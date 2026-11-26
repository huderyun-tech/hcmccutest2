/**
 * 報名網站「加速層」（Cloudflare Pages Functions）
 *
 * 放在網站專案的 functions/api/ 資料夾，跟網站一起用 Git 推上去就會自動生效，
 * 不需要在 Cloudflare 另外建立 Worker，也不用設定變數。
 *
 *   GET  /api/batches  → 課程梯次（年度、金額、名額、候補人數…）。先回覆記住的資料（很快），
 *                         超過 30 秒才在背景向 Google 後台更新，民眾不用等。
 *   POST /api/submit   → 轉送報名到 Google 後台；成功後立刻在背景更新名額。
 *
 * 報名資料、名額判斷、正取／候補，全部仍由 Google Apps Script ＋ 試算表處理；這裡不存任何資料。
 * 這支程式壞掉或沒有部署時，網站會自動改回直接連 Google（只是比較慢），報名不會中斷。
 */

// 後台網址（和 js/config.js 的 SHEETS_API_URL 相同；這串網址本來就是公開的）。
// 之後若換了新的後台網址，請兩個地方一起改；或在 Cloudflare Pages 設定變數 APPS_SCRIPT_URL（優先使用）。
const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbygKB0EwGSVna_RYV_qWMFeh1G9NeU5JRwAJr6lCkgt3ug9i3sd_anp5DwmYIBHgxueDA/exec';

const FRESH_MS = 30 * 1000;        // 30 秒內視為最新
const MAX_BODY = 200000;           // 與後台上限一致
const CACHE_KEY = 'https://hcmccu-fast.internal/batches';

let memo = null;                   // 同一個執行環境內的記憶體快取 { text, at }

function backendUrl(env) { return (env && env.APPS_SCRIPT_URL) || DEFAULT_APPS_SCRIPT_URL; }

function json(body, extra) {
  return new Response(body, { status: 200, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, extra || {}) });
}

/* 向 Google 後台拿最新梯次並記住；失敗回傳 null（不會蓋掉舊資料） */
async function refresh(env) {
  try {
    const base = backendUrl(env);
    const res = await fetch(base + (base.includes('?') ? '&' : '?') + 'action=batches', { redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    if (!data || data.ok !== true) return null;
    memo = { text, at: Date.now() };
    try {
      await caches.default.put(new Request(CACHE_KEY), new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Cached-At': String(memo.at) } }));
    } catch (e) { /* Cache API 不能用也沒關係，只剩記憶體快取 */ }
    return text;
  } catch (e) {
    return null;
  }
}

async function readStored() {
  if (memo) return memo;
  try {
    const hit = await caches.default.match(new Request(CACHE_KEY));
    if (hit) { memo = { text: await hit.text(), at: Number(hit.headers.get('X-Cached-At') || 0) }; return memo; }
  } catch (e) { /* 忽略 */ }
  return null;
}

async function handleBatches(context) {
  const stored = await readStored();
  if (stored) {
    const age = Date.now() - stored.at;
    if (age > FRESH_MS) context.waitUntil(refresh(context.env));       // 舊了：這位民眾先拿現成的，背景更新給下一位
    return json(stored.text, { 'X-Cache': age > FRESH_MS ? 'STALE' : 'HIT', 'X-Cache-Age': String(Math.round(age / 1000)) });
  }
  const text = await refresh(context.env);                              // 第一次：只好等後台
  return text ? json(text, { 'X-Cache': 'MISS' }) : json(JSON.stringify({ ok: false, error: '後台暫時無法連線' }), { 'X-Cache': 'ERROR' });
}

async function handleSubmit(context) {
  const body = await context.request.text();
  if (!body || body.length > MAX_BODY) return json(JSON.stringify({ ok: false, error: '資料格式不正確或太大' }));
  let result;
  try {
    const res = await fetch(backendUrl(context.env), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    result = await res.text();
    JSON.parse(result);
  } catch (e) {
    return json(JSON.stringify({ ok: false, error: '後台暫時無法處理，請稍後再試' }));
  }
  context.waitUntil(refresh(context.env));          // 名額已變動：背景立刻更新
  return json(result);
}


/* ====================== 新版：設定存在 Cloudflare KV ====================== */

import { publicPayload, adminView, normalizeBatchInput, normalizeYears, normalizeForms, normalizeNews, configFromLegacy, emptyConfig, computeBatch } from '../_lib/core.js';
import { requireAdmin, verifySigned, hmacHex } from '../_lib/auth.js';

const KV_CONFIG = 'config', KV_COUNTS = 'counts';

function kv(env) { return env && env.HCMCCU_KV; }
async function getDoc(env, key, ttl) {
  const store = kv(env); if (!store) return null;
  try { return await store.get(key, { type: 'json', cacheTtl: ttl || 30 }); } catch (e) { return null; }
}
async function putDoc(env, key, obj) { await kv(env).put(key, JSON.stringify(obj)); }

const ok = (obj, extra) => json(JSON.stringify(Object.assign({ ok: true }, obj)), extra);
const fail = (msg, status) => new Response(JSON.stringify({ ok: false, error: msg }), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

function hasConfig(cfg) { return cfg && ((cfg.batches || []).length > 0 || Object.keys(cfg.years || {}).length > 0 || (cfg.news || []).length > 0); }

async function handleBatchesNew(context) {
  const cfg = await getDoc(context.env, KV_CONFIG, 30);
  if (!hasConfig(cfg)) return null;                         // 還沒啟用新版設定 → 走舊的（Google 後台）
  const counts = await getDoc(context.env, KV_COUNTS, 30);
  return json(JSON.stringify(publicPayload(cfg, counts, Date.now())), { 'X-Source': 'kv' });
}

function findField(fields, key) {
  if (!Array.isArray(fields)) return '';
  for (const f of fields) if (f && f.k === key) return String(f.v == null ? '' : f.v).trim();
  return '';
}

async function handleSubmitNew(context) {
  const { env, request } = context;
  const cfg = await getDoc(env, KV_CONFIG, 30);
  if (!hasConfig(cfg) || !env.SYNC_SECRET) return null;     // 沒設定好 → 舊流程
  const body = await request.text();
  if (!body || body.length > MAX_BODY) return json(JSON.stringify({ ok: false, error: '資料格式不正確或太大' }));
  let data;
  try { data = JSON.parse(body); } catch (e) { return json(JSON.stringify({ ok: false, error: '資料格式不正確' })); }
  const f = (cfg.forms || {})[data.formType];
  if (f && f.open === false) return json(JSON.stringify({ ok: false, error: f.message || '此表單目前暫停受理' }));

  let batch = null;
  const batchId = findField(data.fields, '梯次代碼');
  if (batchId) {
    const b = (cfg.batches || []).find(x => x.course === data.formType && x.id === batchId);
    if (b) batch = { id: b.id, show: b.show !== false, forceClosed: !!b.forceClosed, closedReason: b.closedReason || '', regEnd: b.regEnd || '', totalQuota: typeof b.totalQuota === 'number' ? b.totalQuota : null, quota: typeof b.quota === 'number' ? b.quota : null, waitlistQuota: typeof b.waitlistQuota === 'number' ? b.waitlistQuota : 0 };
  }
  const ts = String(Date.now());
  const inner = JSON.stringify({ payload: body, batch });
  const sig = await hmacHex(`${ts}.${inner}`, env.SYNC_SECRET);
  let text, result;
  try {
    const res = await fetch(backendUrl(env), { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ cf: 1, ts, sig, inner }) });
    text = await res.text();
    result = JSON.parse(text);
  } catch (e) {
    return json(JSON.stringify({ ok: false, error: '後台暫時無法處理，請稍後再試' }));
  }
  if (result && result.ok && !result.duplicate && batchId && result.category) {
    context.waitUntil((async () => {                         // 先把這一筆算進去，民眾重新整理就看到新名額（1 分鐘內會被試算表的真實數字校正）
      try {
        const doc = (await getDoc(env, KV_COUNTS, 1)) || { counts: {} };
        doc.counts = doc.counts || {};
        const key = `${data.formType}|${batchId}`;
        const c = doc.counts[key] || { main: 0, wait: 0 };
        if (result.category === '候補') c.wait++; else c.main++;
        doc.counts[key] = c;
        await putDoc(env, KV_COUNTS, doc);
      } catch (e) { /* 忽略 */ }
    })());
  }
  return json(text);
}

async function handleSync(context) {
  const { env, request } = context;
  const body = await request.text();
  const good = await verifySigned(request.headers.get('X-Ts'), body, request.headers.get('X-Sig'), env.SYNC_SECRET);
  if (!good) return fail('簽章不正確', 401);
  if (!kv(env)) return fail('尚未綁定 KV（HCMCCU_KV）', 500);
  let d;
  try { d = JSON.parse(body); } catch (e) { return fail('格式不正確', 400); }
  const prev = (await getDoc(env, KV_COUNTS, 1)) || {};
  await putDoc(env, KV_COUNTS, { counts: d.counts || {}, sheets: d.sheets || prev.sheets || {}, spreadsheetUrl: d.spreadsheetUrl || prev.spreadsheetUrl || '', updatedAt: new Date().toISOString() });
  return ok({});
}

/* ---------------- 管理後台 API（一律要通過 Cloudflare Access 驗證） ---------------- */

async function loadAdminState(env) {
  const cfg = (await getDoc(env, KV_CONFIG, 1)) || emptyConfig();
  const counts = await getDoc(env, KV_COUNTS, 1);
  return { cfg, counts };
}
function stamp(cfg, email) { cfg.updatedAt = new Date().toISOString(); cfg.updatedBy = email; return cfg; }

async function handleAdmin(context, path) {
  const { env, request } = context;
  const auth = await requireAdmin(request, env);
  if (!auth.ok) return fail(auth.error, auth.status);
  if (!kv(env)) return fail('尚未綁定 KV（變數名稱 HCMCCU_KV）', 500);
  const sub = path.replace(/^\/api\/admin\/?/, '');
  const now = Date.now();
  try {
    if (request.method === 'GET' && sub === 'state') {
      const { cfg, counts } = await loadAdminState(env);
      return ok({ ...adminView(cfg, counts, now), email: auth.email });
    }
    if (request.method !== 'POST') return fail('不支援的操作', 405);
    let input;
    try { input = JSON.parse((await request.text()) || '{}'); } catch (e) { return fail('資料格式不正確', 400); }
    const { cfg, counts } = await loadAdminState(env);
    cfg.batches = cfg.batches || [];

    if (sub === 'batch') {
      const row = String(input.row || '');
      const idx = row ? cfg.batches.findIndex(b => `${b.course}|${b.id}` === row) : -1;
      if (row && idx < 0) return fail('找不到這個梯次，可能已被刪除，請重新整理');
      const b = normalizeBatchInput(input.batch, idx >= 0 ? cfg.batches[idx] : null, cfg.batches);
      if (idx >= 0) cfg.batches[idx] = b; else cfg.batches.push(b);
    } else if (sub === 'batch-delete') {
      const row = String(input.row || '');
      const idx = cfg.batches.findIndex(b => `${b.course}|${b.id}` === row);
      if (idx < 0) return fail('找不到這個梯次');
      const c = ((counts && counts.counts) || {})[row] || {};
      if ((c.main || 0) + (c.wait || 0) > 0) return fail('這個梯次已經有人報名，不能刪除（會對不到報名資料）。請改成「不顯示在網站」。');
      cfg.batches.splice(idx, 1);
    } else if (sub === 'years') {
      cfg.years = normalizeYears(input.years, cfg.years);
    } else if (sub === 'forms') {
      cfg.forms = normalizeForms(input.forms, cfg.forms);
    } else if (sub === 'news') {
      cfg.news = normalizeNews(input.news);
    } else if (sub === 'import') {
      if (hasConfig(cfg) && !input.overwrite) return fail('目前已經有設定了。若要用試算表的資料覆蓋，請勾選「覆蓋」。');
      const base = backendUrl(env);
      const res = await fetch(base + (base.includes('?') ? '&' : '?') + 'action=batches', { redirect: 'follow' });
      const data = JSON.parse(await res.text());
      if (!data || data.ok !== true) return fail('讀不到 Google 試算表後台的資料');
      const imp = configFromLegacy(data);
      imp.config.updatedAt = new Date().toISOString();
      await putDoc(env, KV_CONFIG, stamp(imp.config, auth.email));
      const prev = counts || {};
      await putDoc(env, KV_COUNTS, { ...prev, counts: { ...imp.counts, ...(prev.counts || {}) } });
      const st = await loadAdminState(env);
      return ok({ ...adminView(st.cfg, st.counts, now), email: auth.email, imported: imp.config.batches.length });
    } else {
      return fail('不支援的操作', 404);
    }
    await putDoc(env, KV_CONFIG, stamp(cfg, auth.email));
    return ok({ ...adminView(cfg, counts, now), email: auth.email });
  } catch (e) {
    return fail(e && e.message ? e.message : '儲存失敗');
  }
}

export async function onRequest(context) {
  const { request } = context;
  const path = new URL(request.url).pathname.replace(/\/+$/, '');
  try {
    if (path.startsWith('/api/admin')) return await handleAdmin(context, path);
    if (request.method === 'POST' && path === '/api/sync') return await handleSync(context);
    if (request.method === 'GET' && path === '/api/batches') return (await handleBatchesNew(context)) || await handleBatches(context);
    if (request.method === 'POST' && path === '/api/submit') return (await handleSubmitNew(context)) || await handleSubmit(context);
    if (request.method === 'GET' && (path === '/api' || path === '/api/ping')) return json(JSON.stringify({ ok: true, service: 'hcmccu-fast', kv: !!kv(context.env), signed: !!context.env.SYNC_SECRET, access: !!(context.env.ACCESS_AUD && context.env.ACCESS_TEAM_DOMAIN) }));
  } catch (e) {
    return json(JSON.stringify({ ok: false, error: '加速層發生錯誤' }));
  }
  return new Response('Not found', { status: 404 });
}

/* 設定與名額計算（公開 API 與管理後台共用）。資料放在 Cloudflare KV：
 *   config  → 課程梯次、年度、表單開關、公告（在管理後台編輯）
 *   counts  → 各梯次目前的正取／候補人數（由 Google Apps Script 每分鐘同步，報名成功時也會即時 +1）
 */
export const COURSE_KEYS = ['gov', 'self', 'skill', 'maternity', 'massage'];
export const COURSE_LABELS = { gov: '托育職訓補助班', self: '托育市府自費班', skill: '術科加強班', maternity: '月子人員培訓班', massage: '嬰幼兒按摩班' };
export const FORM_CODES = ['apply', 'labor', 'service'];
export const FORM_NAMES = { apply: '線上申請入會', labor: '勞健保異動申請', service: '非新竹市市民月子服務媒合登記' };

export function emptyConfig() {
  return { version: 1, updatedAt: '', batches: [], years: {}, forms: {}, news: [] };
}

/* ---------- 日期（一律用台灣時間 yyyy-MM-dd HH:mm） ---------- */
export function parseTaipei(text) {
  const m = String(text || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return NaN;
  return Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+08:00`);
}

/* 看得懂 2026-12-31 23:59、2026-12-31、2026/12/31、民國 115/12/31；只寫日期：截止當天 23:59、開始當天 00:00 */
export function normalizeDateInput(raw, isEnd, label) {
  const s0 = String(raw == null ? '' : raw).trim();
  if (!s0) return '';
  const s = s0.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/：/g, ':');
  const m = s.match(/^(\d{2,4})\s*[-\/.年]\s*(\d{1,2})\s*[-\/.月]\s*(\d{1,2})\s*日?(?:[\sT]*(\d{1,2}):(\d{2}))?$/);
  if (!m) throw new Error(`${label}格式看不懂：「${s0}」，請寫成 2026-12-31 23:59`);
  let y = Number(m[1]); const mo = Number(m[2]), d = Number(m[3]);
  let h = isEnd ? 23 : 0, mi = isEnd ? 59 : 0;
  if (m[4] !== undefined) { h = Number(m[4]); mi = Number(m[5]); }
  if (y < 200) y += 1911;
  if (y < 1990 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) throw new Error(`${label}日期不合理：「${s0}」`);
  const p = n => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}`;
}

export function parseRocYear(v) {
  const m = String(v == null ? '' : v).match(/\d{2,4}/);
  if (!m) return null;
  let y = Number(m[0]);
  if (y >= 1912 && y <= 2300) y -= 1911;
  return (y >= 100 && y <= 300) ? y : null;
}

/* ---------- 單一梯次：算出名額與狀態 ---------- */
export function computeBatch(b, counts, nowMs) {
  const c = (counts && counts[`${b.course}|${b.id}`]) || { main: 0, wait: 0 };
  const hasTotal = typeof b.totalQuota === 'number';
  const enrolled = c.main || 0, waitlistCount = c.wait || 0;
  const quota = hasTotal ? Math.max(0, b.totalQuota - enrolled) : (typeof b.quota === 'number' ? b.quota : undefined);
  const endMs = b.regEnd ? parseTaipei(b.regEnd) : NaN;
  const expired = !isNaN(endMs) && nowMs > endMs;
  const full = typeof quota === 'number' && quota <= 0;
  const show = b.show !== false;
  const waitlistOpen = show && !b.forceClosed && !expired && full && b.waitlistQuota > 0 && waitlistCount < b.waitlistQuota;
  let statusText;
  if (!show) statusText = '已隱藏（顯示在網站＝否）';
  else if (b.forceClosed) statusText = '已手動關閉';
  else if (expired) statusText = '已截止（超過報名截止時間）';
  else if (full) {
    statusText = '額滿' + (hasTotal && enrolled > b.totalQuota ? `（已超收 ${enrolled - b.totalQuota} 人）` : '');
    if (b.waitlistQuota > 0) statusText += `｜候補 ${waitlistCount}/${b.waitlistQuota} 人` + (waitlistCount >= b.waitlistQuota ? '（候補已滿）' : '（開放登記候補）');
  } else statusText = '開放報名中';
  return { enrolled, waitlistCount, quota, hasTotal, expired, full, waitlistOpen, show, isOpen: show && !b.forceClosed && !expired && !full, statusText };
}

/* 網站用的單一梯次格式（與原本 Apps Script 回傳的相同） */
export function toPublicItem(b, v) {
  const it = { id: b.id };
  ['name', 'shortLabel', 'period', 'dates', 'dateText', 'examDate', 'fee', 'regStart', 'regEnd'].forEach(k => { if (b[k] !== undefined && b[k] !== '') it[k] = b[k]; });
  if (typeof v.quota === 'number') it.quota = v.quota;
  if (v.hasTotal) { it.totalQuota = b.totalQuota; it.enrolled = v.enrolled; }
  if (typeof b.waitlistQuota === 'number') { it.waitlistQuota = b.waitlistQuota; it.waitlistCount = v.waitlistCount; }
  it.forceClosed = !!b.forceClosed;
  it.closedReason = b.closedReason || '';
  return it;
}

export function publicPayload(config, countsDoc, nowMs) {
  const counts = (countsDoc && countsDoc.counts) || {};
  const courses = {};
  (config.batches || []).forEach(b => {
    if (b.show === false || COURSE_KEYS.indexOf(b.course) < 0) return;
    (courses[b.course] = courses[b.course] || []).push(toPublicItem(b, computeBatch(b, counts, nowMs)));
  });
  const forms = {};
  FORM_CODES.forEach(code => { const f = (config.forms || {})[code]; if (f) forms[code] = { open: f.open !== false, title: f.title || '', message: f.message || '', linkText: f.linkText || '', linkUrl: f.linkUrl || '' }; });
  const out = { ok: true, updatedAt: config.updatedAt || '', courses, years: config.years || {}, forms };
  const news = (config.news || []).filter(n => n.show !== false).map(n => {
    const imgs = (n.images || []).map(id => '/api/img/' + id);
    const item = { date: n.date, title: n.title, image: imgs[0] || n.image || '', content: String(n.content || '').replace(/\r?\n/g, '<br>') };
    if (imgs.length > 1) item.images = imgs;
    if (n.link) { item.link = n.link; if (n.linkText) item.linkText = n.linkText; if (n.anchor) item.anchor = n.anchor; }
    return item;
  });
  if ((config.news || []).length) out.news = news;
  return out;
}

/* ---------- 管理後台畫面用的完整狀態 ---------- */
export function adminView(config, countsDoc, nowMs) {
  const counts = (countsDoc && countsDoc.counts) || {};
  const s = v => (v === undefined || v === null ? '' : String(v));
  const batches = (config.batches || []).map(b => {
    const v = computeBatch(b, counts, nowMs);
    return {
      row: `${b.course}|${b.id}`, course: b.course, id: b.id, valid: true,
      name: s(b.name), shortLabel: s(b.shortLabel), period: s(b.period), dates: s(b.dates), dateText: s(b.dateText), examDate: s(b.examDate),
      fee: s(b.fee), regStart: s(b.regStart), regEnd: s(b.regEnd),
      totalQuota: typeof b.totalQuota === 'number' ? b.totalQuota : '', quota: typeof v.quota === 'number' ? v.quota : '',
      autoQuota: v.hasTotal, enrolled: v.enrolled,
      waitlistQuota: typeof b.waitlistQuota === 'number' ? b.waitlistQuota : '', waitlistCount: v.waitlistCount,
      forceClosed: !!b.forceClosed, closedReason: s(b.closedReason), show: b.show !== false,
      isOpen: v.isOpen, full: v.full, expired: v.expired, waitlistOpen: v.waitlistOpen, statusText: v.statusText
    };
  });
  const years = COURSE_KEYS.map(k => ({ course: k, name: COURSE_LABELS[k], year: (config.years || {})[k] || '' }));
  const forms = FORM_CODES.map(code => {
    const f = (config.forms || {})[code] || { open: true };
    return { code, name: FORM_NAMES[code], open: f.open !== false, title: f.title || '', message: f.message || '', linkText: f.linkText || '', linkUrl: f.linkUrl || '' };
  });
  return {
    ok: true, courseLabels: COURSE_LABELS, batches, years, forms, news: (config.news || []).map(n => ({ ...n, show: n.show !== false })),
    initialized: (config.batches || []).length > 0,
    codeCounts: counts,   // 試算表裡每個梯次代碼目前的報名人數（含已不在設定中的舊代碼）
    sheetUrl: (countsDoc && countsDoc.spreadsheetUrl) || '', sheetGids: (countsDoc && countsDoc.sheets) || {},
    countsAt: (countsDoc && countsDoc.updatedAt) || '', configAt: config.updatedAt || ''
  };
}

/* ---------- 輸入檢查（管理後台儲存時） ---------- */
function intOrBlank(v, label) {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  if (isNaN(n) || n < 0 || Math.floor(n) !== n) throw new Error(`${label}請填 0 以上的整數`);
  return n;
}

export function normalizeBatchInput(input, existing, all) {
  input = input || {};
  const course = String(input.course || '').trim();
  if (COURSE_KEYS.indexOf(course) < 0) throw new Error('請選擇課程');
  const id = String(input.id || '').trim();
  if (!id) throw new Error('請填寫「梯次代碼」');
  if (/[\s"'<>\\|]/.test(id) || id.length > 40) throw new Error('梯次代碼不能有空白或特殊符號，且不超過 40 字');
  const name = String(input.name || '').trim();
  if (!name) throw new Error('請填寫「梯次名稱」');
  if (existing && existing.course !== course) throw new Error('已建立的梯次不能改「課程」。需要的話請新增一個梯次，舊的改成「不顯示在網站」。');
  if (all.some(b => b !== existing && b.course === course && b.id === id)) throw new Error(`這個課程已經有「${id}」這個梯次代碼`);

  const b = { course, id, name };
  ['shortLabel', 'period', 'dates', 'dateText', 'examDate', 'fee', 'closedReason'].forEach(k => {
    const v = String(input[k] == null ? '' : input[k]).trim().slice(0, 300);
    if (v) b[k] = v;
  });
  const regStart = normalizeDateInput(input.regStart, false, '報名開始'), regEnd = normalizeDateInput(input.regEnd, true, '報名截止');
  if (regStart && regEnd && parseTaipei(regStart) > parseTaipei(regEnd)) throw new Error('報名開始時間不能晚於報名截止時間');
  if (regStart) b.regStart = regStart;
  if (regEnd) b.regEnd = regEnd;
  const total = intOrBlank(input.totalQuota, '總名額'), wait = intOrBlank(input.waitlistQuota, '候補名額'), manual = intOrBlank(input.quota, '尚餘名額');
  if (total !== undefined) b.totalQuota = total; else if (manual !== undefined) b.quota = manual;
  if (wait !== undefined) b.waitlistQuota = wait;
  b.forceClosed = !!input.forceClosed;
  b.show = input.show !== false;
  return b;
}

export function normalizeYears(list, current) {
  const years = { ...(current || {}) };
  (list || []).forEach(it => {
    if (COURSE_KEYS.indexOf(it.course) < 0) return;
    if (it.year === '' || it.year == null) { delete years[it.course]; return; }
    const y = parseRocYear(it.year);
    if (!y) throw new Error(`${COURSE_LABELS[it.course]}的年度請填民國年，例如 116`);
    years[it.course] = y;
  });
  return years;
}

export function normalizeForms(list, current) {
  const forms = { ...(current || {}) };
  (list || []).forEach(it => {
    if (FORM_CODES.indexOf(it.code) < 0) return;
    const url = String(it.linkUrl || '').trim();
    if (url && !/^https:\/\//i.test(url)) throw new Error('聯絡按鈕連結必須以 https:// 開頭');
    forms[it.code] = { open: !!it.open, title: String(it.title || '').slice(0, 100), message: String(it.message || '').slice(0, 1000), linkText: String(it.linkText || '').slice(0, 40), linkUrl: url };
  });
  return forms;
}

export function normalizeNews(list) {
  list = Array.isArray(list) ? list : [];
  if (list.length > 100) throw new Error('公告最多 100 則');
  return list.map((n, i) => {
    const title = String(n.title || '').trim();
    if (!title) throw new Error(`第 ${i + 1} 則公告沒有標題`);
    const date = String(n.date || '').trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`「${title}」的日期格式要是 2026-12-01`);
    const link = String(n.link || '').trim();
    if (link && !(/^\/[A-Za-z0-9\-\/]*$/.test(link) || /^https:\/\//i.test(link))) throw new Error(`「${title}」的前往頁面要是 /course-nanny-gov 這種站內路徑，或 https:// 開頭的網址`);
    const images = Array.isArray(n.images) ? n.images.map(x => String(x)).filter(x => /^[a-f0-9]{16}$/.test(x)).slice(0, 6) : [];
    const item = { date, title, content: String(n.content || '').slice(0, 5000), image: String(n.image || '').trim(), images, show: n.show !== false };
    if (link) { item.link = link; if (n.linkText) item.linkText = String(n.linkText).trim(); if (n.anchor) item.anchor = String(n.anchor).trim(); }
    return item;
  });
}

/* ---------- 把 Apps Script 原本公開的梯次資料（?action=batches）轉成新設定，用於第一次匯入 ---------- */
export function configFromLegacy(data) {
  const cfg = emptyConfig();
  const counts = {};
  Object.keys(data.courses || {}).forEach(course => {
    if (COURSE_KEYS.indexOf(course) < 0) return;
    (data.courses[course] || []).forEach(it => {
      const b = { course, id: String(it.id), name: String(it.name || it.id), show: true, forceClosed: !!it.forceClosed };
      ['shortLabel', 'period', 'dates', 'dateText', 'examDate', 'fee', 'regStart', 'regEnd', 'closedReason'].forEach(k => { if (it[k] !== undefined && it[k] !== '') b[k] = (k === 'fee' && typeof it[k] === 'number') ? it[k] : String(it[k]); });
      if (typeof it.totalQuota === 'number') b.totalQuota = it.totalQuota; else if (typeof it.quota === 'number') b.quota = it.quota;
      if (typeof it.waitlistQuota === 'number') b.waitlistQuota = it.waitlistQuota;
      cfg.batches.push(b);
      counts[`${course}|${b.id}`] = { main: it.enrolled || 0, wait: it.waitlistCount || 0 };
    });
  });
  cfg.years = data.years || {};
  FORM_CODES.forEach(code => { const f = (data.forms || {})[code]; if (f) cfg.forms[code] = { open: f.open !== false, title: f.title || '', message: f.message || '', linkText: f.linkText || '', linkUrl: f.linkUrl || '' }; });
  cfg.news = (data.news || []).map(n => ({ date: n.date, title: n.title, content: String(n.content || '').replace(/<br\s*\/?>/gi, '\n'), image: n.image || '', link: n.link || '', linkText: n.linkText || '', anchor: n.anchor || '', show: true }));
  return { config: cfg, counts };
}

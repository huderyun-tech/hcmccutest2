/* 驗證：① 管理員（Cloudflare Access 簽發的 JWT）② Apps Script 與 Cloudflare 之間的 HMAC 簽章 */

const enc = new TextEncoder();

export function toHex(buf) { return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''); }

export async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(String(secret).trim()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* Apps Script → Cloudflare：簽章 = HMAC(secret, ts + '.' + body)，10 分鐘內有效 */
export async function verifySigned(ts, body, sig, secret) {
  if (!secret || !ts || !sig) return false;
  if (Math.abs(Date.now() - Number(ts)) > 10 * 60 * 1000) return false;
  return safeEqual(await hmacHex(`${ts}.${body}`, secret), sig);
}

function b64uToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64uJson = s => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));

let certsMemo = null;
async function getCerts(team) {
  if (certsMemo && certsMemo.team === team && Date.now() - certsMemo.at < 3600e3) return certsMemo.keys;
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error('無法取得 Access 憑證');
  const j = await res.json();
  certsMemo = { team, at: Date.now(), keys: j.keys || [] };
  return certsMemo.keys;
}

/* 驗證 Cloudflare Access 的登入憑證；沒設定 Access 就一律拒絕（不會有「忘了設定所以大家都能進」的情況） */
export async function requireAdmin(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = env.ACCESS_AUD;
  if (!team || !aud) return { ok: false, status: 503, error: '管理後台尚未啟用：請先完成 Cloudflare Access 設定（ACCESS_TEAM_DOMAIN、ACCESS_AUD）' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401, error: '請先透過 Cloudflare Access 登入' };
  try {
    const [h, p, s] = token.split('.');
    const header = b64uJson(h), payload = b64uJson(p);
    if (header.alg !== 'RS256') throw new Error('alg');
    const jwk = (await getCerts(team)).find(k => k.kid === header.kid);
    if (!jwk) throw new Error('kid');
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(s), enc.encode(`${h}.${p}`));
    if (!ok) throw new Error('sig');
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now || (payload.nbf && payload.nbf > now + 60)) throw new Error('exp');
    if (payload.iss !== `https://${team}`) throw new Error('iss');
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (auds.indexOf(aud) < 0) throw new Error('aud');
    const email = String(payload.email || '').toLowerCase();
    if (!email) throw new Error('email');
    if (env.ADMIN_EMAILS) {
      const allow = String(env.ADMIN_EMAILS).toLowerCase().split(/[,\s;，；]+/).filter(Boolean);
      if (allow.indexOf(email) < 0) return { ok: false, status: 403, error: `此帳號（${email}）不在管理員名單內` };
    }
    return { ok: true, email };
  } catch (e) {
    return { ok: false, status: 401, error: '登入憑證無效，請重新登入' };
  }
}

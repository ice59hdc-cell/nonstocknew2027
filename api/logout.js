import { db } from '../lib/db.js';
import { send, sameOriginJson } from '../lib/http.js';
import { sha256Hex, readSession, getCookie, setCookie, COOKIE } from '../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOriginJson(req)) return send(res, 400, { error: 'คำขอไม่ถูกต้อง' });
  try {
    const s = await readSession(process.env.SESSION_SECRET, getCookie(req.headers.cookie, COOKIE));
    if (s) await db().query('DELETE FROM sessions WHERE token_hash = $1', [await sha256Hex(s.token)]);
  } catch (e) { console.error('logout failed', e); }
  return send(res, 200, { ok: true }, { 'Set-Cookie': setCookie('', 0) });
}

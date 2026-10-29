import { db } from '../lib/db.js';
import { send } from '../lib/http.js';
import { sha256Hex, readSession, getCookie, COOKIE } from '../lib/session.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method' }, { Allow: 'GET' });
  try {
    const s = await readSession(process.env.SESSION_SECRET, getCookie(req.headers.cookie, COOKIE));
    if (!s) return send(res, 401, { error: 'unauthenticated' });
    const { rows } = await db().query(
      `SELECT u.display_name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [await sha256Hex(s.token)]);
    if (!rows[0]) return send(res, 401, { error: 'unauthenticated' });
    return send(res, 200, { name: rows[0].display_name, role: rows[0].role });
  } catch (e) {
    console.error('me failed', e);
    return send(res, 500, { error: 'ระบบขัดข้อง' });
  }
}

import { randomBytes } from 'node:crypto';
import { db } from '../lib/db.js';
import { send, sameOriginJson, clientIp } from '../lib/http.js';
import { PIN_RE, verifyPin, DUMMY } from '../lib/pin.js';
import { sha256Hex, signSession, setCookie, secretOk, SESSION_HOURS } from '../lib/session.js';

const MAX_FAILS = 5;          // ผิดได้กี่ครั้งต่ออีเมล ในช่วงล็อก
const MAX_IP_FAILS = 20;      // ผิดได้กี่ครั้งต่อ IP ในช่วงล็อก
const LOCK_MIN = 15;
const BAD = 'อีเมลหรือ PIN ไม่ถูกต้อง';
const TOO_MANY = `ลองหลายครั้งเกินไป กรุณารอ ${LOCK_MIN} นาทีแล้วลองใหม่`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOriginJson(req)) return send(res, 400, { error: 'คำขอไม่ถูกต้อง' });

  const secret = process.env.SESSION_SECRET;
  if (!secretOk(secret)) return send(res, 500, { error: 'ระบบยังไม่ได้ตั้งค่า (SESSION_SECRET)' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const pin = typeof body?.pin === 'string' ? body.pin : '';
  if (!email || email.length > 254 || !email.includes('@') || !PIN_RE.test(pin)) {
    return send(res, 400, { error: 'กรอกอีเมลและ PIN 6 หลักให้ครบ' });
  }

  try {
    const q = db();
    const ipHash = await sha256Hex(`${clientIp(req)}|${secret}`);
    const since = `now() - interval '${LOCK_MIN} minutes'`;

    const byIp = await q.query(`SELECT count(*)::int AS n FROM login_attempts WHERE ip_hash = $1 AND NOT succeeded AND attempted_at > ${since}`, [ipHash]);
    const byEmail = await q.query(`SELECT count(*)::int AS n FROM login_attempts WHERE email = $1 AND NOT succeeded AND attempted_at > ${since}`, [email]);
    if (byIp.rows[0].n >= MAX_IP_FAILS || byEmail.rows[0].n >= MAX_FAILS) return send(res, 429, { error: TOO_MANY });

    const { rows } = await q.query('SELECT id, display_name, role, pin_salt, pin_hash, active, locked_until FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const pinOk = await verifyPin(pin, user ? user.pin_salt : DUMMY.salt, user ? user.pin_hash : DUMMY.hash);
    const locked = user?.locked_until && new Date(user.locked_until) > new Date();

    if (!user || !pinOk || !user.active || locked) {
      await q.query('INSERT INTO login_attempts (email, ip_hash, succeeded) VALUES ($1, $2, false)', [email, ipHash]);
      if (user && !locked) {
        await q.query(
          `UPDATE users SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= $2 THEN now() + interval '${LOCK_MIN} minutes' ELSE locked_until END,
             updated_at = now() WHERE id = $1`, [user.id, MAX_FAILS]);
      }
      return locked ? send(res, 429, { error: TOO_MANY }) : send(res, 401, { error: BAD });
    }

    const token = randomBytes(32).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
    await q.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3))', [user.id, await sha256Hex(token), exp]);
    await q.query('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1', [user.id]);
    await q.query('INSERT INTO login_attempts (email, ip_hash, succeeded) VALUES ($1, $2, true)', [email, ipHash]);
    // เก็บกวาดของเก่า
    await q.query('DELETE FROM sessions WHERE expires_at < now()');
    await q.query("DELETE FROM login_attempts WHERE attempted_at < now() - interval '2 days'");

    return send(res, 200, { ok: true, user: { name: user.display_name, role: user.role } },
      { 'Set-Cookie': setCookie(await signSession(secret, token, exp), SESSION_HOURS * 3600) });
  } catch (e) {
    console.error('login failed', e);
    return send(res, 500, { error: 'ระบบขัดข้อง ลองใหม่อีกครั้ง' });
  }
}

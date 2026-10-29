import { randomBytes } from 'node:crypto';
import { db } from '../lib/db.js';
import { send, sameOriginJson, clientIp } from '../lib/http.js';
import { PIN_RE, verifyPin, pinLookup, DUMMY } from '../lib/pin.js';
import { sha256Hex, signSession, setCookie, secretOk, SESSION_HOURS } from '../lib/session.js';

/* PIN อย่างเดียวไม่มีอีเมลให้ล็อกต่อบัญชี จึงจำกัดที่ IP และที่ภาพรวมทั้งระบบ */
const MAX_IP_FAILS = 10;      // ผิดได้กี่ครั้งต่อ IP ในช่วงล็อก
const MAX_ALL_FAILS = 60;     // ผิดได้กี่ครั้งรวมทุก IP ในช่วงล็อก (กันเดา PIN กระจายหลาย IP)
const LOCK_MIN = 15;
const BAD = 'PIN ไม่ถูกต้อง';
const TOO_MANY = `ลองหลายครั้งเกินไป กรุณารอ ${LOCK_MIN} นาทีแล้วลองใหม่`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method' }, { Allow: 'POST' });
  if (!sameOriginJson(req)) return send(res, 400, { error: 'คำขอไม่ถูกต้อง' });

  const secret = process.env.SESSION_SECRET;
  if (!secretOk(secret)) return send(res, 500, { error: 'ระบบยังไม่ได้ตั้งค่า (SESSION_SECRET)' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const pin = typeof body?.pin === 'string' ? body.pin : '';
  if (!PIN_RE.test(pin)) return send(res, 400, { error: 'กรอก PIN 6 หลักให้ครบ' });

  try {
    const q = db();
    const ipHash = await sha256Hex(`${clientIp(req)}|${secret}`);
    const since = `now() - interval '${LOCK_MIN} minutes'`;

    const byIp = await q.query(`SELECT count(*)::int AS n FROM login_attempts WHERE ip_hash = $1 AND NOT succeeded AND attempted_at > ${since}`, [ipHash]);
    const all = await q.query(`SELECT count(*)::int AS n FROM login_attempts WHERE NOT succeeded AND attempted_at > ${since}`);
    if (byIp.rows[0].n >= MAX_IP_FAILS || all.rows[0].n >= MAX_ALL_FAILS) return send(res, 429, { error: TOO_MANY });

    const { rows } = await q.query('SELECT id, display_name, role, pin_salt, pin_hash, active FROM users WHERE pin_lookup = $1', [pinLookup(pin)]);
    const user = rows[0];
    const pinOk = await verifyPin(pin, user ? user.pin_salt : DUMMY.salt, user ? user.pin_hash : DUMMY.hash);

    if (!user || !pinOk || !user.active) {
      await q.query('INSERT INTO login_attempts (email, ip_hash, succeeded) VALUES (NULL, $1, false)', [ipHash]);
      return send(res, 401, { error: BAD });
    }

    const token = randomBytes(32).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600;
    await q.query('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, to_timestamp($3))', [user.id, await sha256Hex(token), exp]);
    await q.query('INSERT INTO login_attempts (email, ip_hash, succeeded) VALUES (NULL, $1, true)', [ipHash]);
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

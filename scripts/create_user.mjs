/* สร้างผู้ใช้ / ตั้ง PIN ใหม่ (ระบุ PIN 5 หลักเอง หรือไม่ระบุแล้วสุ่มให้ แสดงครั้งเดียว) ผู้ใช้ระบุด้วย "ชื่อที่แสดง" (ชื่อซ้ำ = ตั้ง PIN ใหม่ให้คนเดิม)
   ใช้:  node scripts/create_user.mjs "<ชื่อที่แสดง>" <admin|editor|viewer> [PIN 5 หลัก] [--migrate]
   ต้องตั้ง DATABASE_URL และ PIN_PEPPER (ค่าเดียวกับที่ตั้งใน Vercel)
   --migrate = สร้าง/ปรับตารางจาก migrations/*.sql ก่อน (รันซ้ำได้) */
import { randomInt } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { db } from '../lib/db.js';
import { hashPin, pinLookup, PIN_RE } from '../lib/pin.js';

const migrate = process.argv.includes('--migrate');
const [name, role, fixedPin] = process.argv.slice(2).filter(a => a !== '--migrate');
if (!name?.trim() || !['admin', 'editor', 'viewer'].includes(role) || (fixedPin !== undefined && !PIN_RE.test(fixedPin))) {
  console.error('ใช้: node scripts/create_user.mjs "<ชื่อที่แสดง>" <admin|editor|viewer> [PIN 5 หลัก] [--migrate]');
  process.exit(1);
}

const q = db();
try {
  if (migrate) {
    const dir = new URL('../migrations/', import.meta.url);
    for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) await q.query(await readFile(new URL(f, dir), 'utf8'));
  }
  // PIN ใช้ระบุตัวตน จึงห้ามซ้ำกับผู้ใช้คนอื่น (ระบุเอง: ซ้ำแล้วหยุด / สุ่ม: สุ่มใหม่จนไม่ซ้ำ)
  const same = lk => q.query('SELECT display_name FROM users WHERE pin_lookup = $1 AND lower(display_name) <> lower($2)', [lk, name.trim()]);
  let pin, lookup;
  do {
    pin = fixedPin ?? String(randomInt(0, 100_000)).padStart(5, '0');
    lookup = pinLookup(pin);
    const clash = await same(lookup);
    if (clash.rowCount && fixedPin) { console.error(`PIN ${pin} ถูกใช้กับ "${clash.rows[0].display_name}" แล้ว`); process.exit(1); }
    if (!clash.rowCount) break;
  } while (true);

  const { salt, hash } = await hashPin(pin);
  const found = await q.query('SELECT id FROM users WHERE lower(display_name) = lower($1)', [name.trim()]);
  let id;
  if (found.rowCount) {
    id = found.rows[0].id;
    await q.query(
      `UPDATE users SET display_name = $2, pin_salt = $3, pin_hash = $4, pin_lookup = $5, role = $6, active = true,
         failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1`, [id, name.trim(), salt, hash, lookup, role]);
  } else {
    id = (await q.query(
      'INSERT INTO users (display_name, pin_salt, pin_hash, pin_lookup, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name.trim(), salt, hash, lookup, role])).rows[0].id;
  }
  await q.query('DELETE FROM sessions WHERE user_id = $1', [id]);
  console.log(`${found.rowCount ? 'ตั้ง PIN ใหม่ให้' : 'สร้างผู้ใช้'}: ${name.trim()} (${role})\nPIN: ${pin}`);
} finally {
  await q.end();
}

/* สร้างผู้ใช้ / ตั้ง PIN ใหม่ (สุ่ม PIN 6 หลัก แสดงครั้งเดียว)
   ใช้:  node scripts/create_user.mjs <อีเมล> "<ชื่อที่แสดง>" <admin|editor|viewer>
   ต้องตั้ง DATABASE_URL และ PIN_PEPPER (ค่าเดียวกับที่ตั้งใน Vercel)
   เพิ่ม --migrate เพื่อสร้างตารางจาก migrations/001_users_and_data.sql ก่อน */
import { randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { db } from '../lib/db.js';
import { hashPin } from '../lib/pin.js';

const args = process.argv.slice(2).filter(a => a !== '--migrate');
const migrate = process.argv.includes('--migrate');
const [emailRaw, name, role] = args;
if (!emailRaw || !name || !['admin', 'editor', 'viewer'].includes(role)) {
  console.error('ใช้: node scripts/create_user.mjs <อีเมล> "<ชื่อ>" <admin|editor|viewer> [--migrate]');
  process.exit(1);
}
const email = emailRaw.trim().toLowerCase();
const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');

const q = db();
try {
  if (migrate) await q.query(await readFile(new URL('../migrations/001_users_and_data.sql', import.meta.url), 'utf8'));
  const { salt, hash } = await hashPin(pin);
  await q.query(
    `INSERT INTO users (email, display_name, pin_salt, pin_hash, role) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET display_name = $2, pin_salt = $3, pin_hash = $4, role = $5,
       active = true, failed_attempts = 0, locked_until = NULL, updated_at = now()`,
    [email, name, salt, hash, role]);
  await q.query('DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = $1)', [email]);
  console.log(`ตั้งค่าแล้ว: ${email} (${role})\nPIN ใหม่: ${pin}   <- แจ้งผู้ใช้แล้วอย่าเก็บไว้ในแชต/ไฟล์`);
} finally {
  await q.end();
}

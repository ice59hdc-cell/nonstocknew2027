/* PIN 5 หลัก: scrypt + salt ต่อผู้ใช้ + pepper ฝั่งเซิร์ฟเวอร์ (PIN มีแค่ 10^5 แบบ ถ้าไม่มี pepper ฐานข้อมูลรั่วแล้วเดาได้ทันที) */
import { scrypt, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const PIN_RE = /^\d{5}$/;

function derive(pin, saltHex) {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('PIN_PEPPER ต้องยาวอย่างน้อย 32 ตัวอักษร');
  return new Promise((res, rej) => scrypt(`${pin}:${pepper}`, Buffer.from(saltHex, 'hex'), 32, (e, k) => (e ? rej(e) : res(k))));
}

/* ค่าค้นหาผู้ใช้จาก PIN (ล็อกอินด้วย PIN อย่างเดียว) ตัวเดียวกันห้ามซ้ำกับผู้ใช้อื่น */
export function pinLookup(pin) {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('PIN_PEPPER ต้องยาวอย่างน้อย 32 ตัวอักษร');
  return createHmac('sha256', pepper).update(`lookup:${pin}`).digest('hex');
}

export async function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await derive(pin, salt)).toString('hex') };
}

export async function verifyPin(pin, saltHex, hashHex) {
  const got = await derive(pin, saltHex);
  const want = Buffer.from(hashHex, 'hex');
  return want.length === got.length && timingSafeEqual(got, want);
}

/* ใช้เทียบเวลาเมื่อไม่พบอีเมล เพื่อไม่ให้เดาได้ว่าอีเมลมีในระบบหรือไม่ */
export const DUMMY = { salt: '00112233445566778899aabbccddeeff', hash: '00'.repeat(32) };

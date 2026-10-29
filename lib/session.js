/* คุกกี้เซสชัน: "<token>.<หมดอายุ(วินาที)>.<HMAC>" ใช้ Web Crypto เหมือนกันทั้ง middleware (edge) และ API (node) */
const enc = new TextEncoder();
export const COOKIE = 'sid';
export const SESSION_HOURS = 8;

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(s) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

function sameText(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const secretOk = s => typeof s === 'string' && s.length >= 32;

export async function signSession(secret, token, exp) {
  return `${token}.${exp}.${await hmac(secret, `${token}.${exp}`)}`;
}

/* คืน {token, exp} เมื่อลายเซ็นถูกและยังไม่หมดอายุ ไม่งั้น null */
export async function readSession(secret, value) {
  if (!secretOk(secret) || typeof value !== 'string') return null;
  const m = /^([A-Za-z0-9_-]{43})\.(\d{10})\.([0-9a-f]{64})$/.exec(value);
  if (!m) return null;
  const [, token, exp, sig] = m;
  if (Number(exp) <= Date.now() / 1000) return null;
  return sameText(sig, await hmac(secret, `${token}.${exp}`)) ? { token, exp: Number(exp) } : null;
}

export function getCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export const setCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

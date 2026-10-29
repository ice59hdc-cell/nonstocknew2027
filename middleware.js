/* กันทุกไฟล์ (หน้าเว็บ + data.js) ด้วยคุกกี้เซสชันที่เซ็นแล้ว ยกเว้นหน้า login และ /api
   ตรวจแค่ลายเซ็น+วันหมดอายุที่ edge; การเพิกถอนเซสชัน (logout) ตรวจที่ /api/me */
import { next } from '@vercel/functions/middleware';
import { readSession, getCookie, COOKIE } from './lib/session.js';

export const config = { matcher: ['/((?!api/|login\\.html$|login\\.css$|login\\.js$|styles\\.css$|favicon\\.ico$).*)'] };

export default async function middleware(request) {
  const s = await readSession(process.env.SESSION_SECRET, getCookie(request.headers.get('cookie'), COOKIE));
  if (s) return next({ headers: { 'Cache-Control': 'private, no-store' } });
  return new Response(null, { status: 302, headers: { Location: new URL('/login.html', request.url).toString(), 'Cache-Control': 'no-store' } });
}

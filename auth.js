/* แสดงชื่อผู้ใช้ + ปุ่มออกจากระบบ; ถ้าเซสชันหมดอายุ/ถูกเพิกถอน ให้กลับไปหน้า login */
(() => {
'use strict';
const toLogin = () => location.replace('/login.html');
fetch('/api/me', { credentials: 'same-origin' }).then(async r => {
  if (r.status === 401) return toLogin();
  if (!r.ok) return;
  const me = await r.json();
  document.getElementById('whoami').textContent = me.name;
  document.getElementById('whoami').hidden = false;
  document.getElementById('logoutBtn').hidden = false;
}).catch(() => {});
document.getElementById('logoutBtn').onclick = async () => {
  try { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' }); } catch (_) { /* ออกจากหน้าอยู่แล้ว */ }
  toLogin();
};
})();

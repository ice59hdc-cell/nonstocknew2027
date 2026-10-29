(() => {
'use strict';
const $ = id => document.getElementById(id);
const digits = [...document.querySelectorAll('.pin-d')];
const err = $('lgErr'), form = $('lgForm'), go = $('lgGo');

function showErr(msg, el) {
  err.textContent = msg; err.hidden = !msg;
  if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
}
const pin = () => digits.map(d => d.value).join('');
const clearInvalid = () => { err.hidden = true; form.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid')); };

digits.forEach((d, i) => {
  d.addEventListener('input', () => {
    clearInvalid();
    const v = d.value.replace(/\D/g, '');
    d.value = v.slice(-1);
    if (v && i < digits.length - 1) digits[i + 1].focus();
  });
  d.addEventListener('keydown', e => {
    if (e.key === 'Backspace' && !d.value && i > 0) { digits[i - 1].value = ''; digits[i - 1].focus(); }
    else if (e.key === 'ArrowLeft' && i > 0) digits[i - 1].focus();
    else if (e.key === 'ArrowRight' && i < digits.length - 1) digits[i + 1].focus();
  });
  d.addEventListener('focus', () => d.select());
  d.addEventListener('paste', e => {  // วางทั้ง 6 หลักได้
    const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, digits.length - i);
    if (!t) return;
    e.preventDefault();
    [...t].forEach((c, k) => { digits[i + k].value = c; });
    digits[Math.min(i + t.length, digits.length - 1)].focus();
  });
});
$('lgEmail').addEventListener('input', clearInvalid);

$('lgShow').onclick = e => {
  const on = e.target.getAttribute('aria-pressed') !== 'true';
  e.target.setAttribute('aria-pressed', String(on));
  e.target.textContent = on ? 'ซ่อน PIN' : 'แสดง PIN';
  digits.forEach(d => { d.type = on ? 'text' : 'password'; });
};

/* ?next=/path เฉพาะพาธภายในเว็บเท่านั้น */
function target() {
  const n = new URLSearchParams(location.search).get('next');
  return n && /^\/(?![/\\])/.test(n) ? n : '/';
}

form.onsubmit = async e => {
  e.preventDefault();
  clearInvalid();
  const email = $('lgEmail').value.trim();
  if (!email || !$('lgEmail').checkValidity()) return showErr('กรอกอีเมลให้ถูกต้อง', $('lgEmail'));
  if (!/^\d{6}$/.test(pin())) return showErr('กรอก PIN ให้ครบ 6 หลัก', digits.find(d => !d.value) || digits[0]);
  go.disabled = true; go.textContent = 'กำลังตรวจสอบ…';
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ email, pin: pin() }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return location.replace(target());
    digits.forEach(d => { d.value = ''; });
    showErr(j.error || 'เข้าสู่ระบบไม่สำเร็จ', digits[0]);
  } catch (_) {
    showErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง');
  }
  go.disabled = false; go.textContent = 'เข้าสู่ระบบ';
};

// เข้าสู่ระบบอยู่แล้ว → ไปหน้าหลัก
fetch('/api/me', { credentials: 'same-origin' }).then(r => { if (r.ok) location.replace(target()); }).catch(() => {});
$('lgEmail').focus();
})();

/* เมนูบันทึกข้อมูล (CRUD) + การสลับหน้า แดชบอร์ด/บันทึกข้อมูล */
(() => {
'use strict';
const S = window.Store, A = window.App, D = window.DATA;
const $ = id => document.getElementById(id);
const { esc, nf0, nf1, nf2, MFULL, mFull } = A;
const PAGE = 25;
const es = { tab: 'txn', page: 1 };
let dirty = false; // ข้อมูลเปลี่ยนแต่แดชบอร์ดยังไม่ได้วาดใหม่

/* ---------- สลับหน้า ---------- */
const filtersBar = document.querySelector('.filters');
function route() {
  const entry = location.hash === '#/entry';
  $('main').hidden = entry;
  filtersBar.hidden = entry;
  $('entryMain').hidden = !entry;
  $('navDash').toggleAttribute('aria-current', !entry);
  $('navEntry').toggleAttribute('aria-current', entry);
  document.querySelector('.skip').setAttribute('href', entry ? '#entryMain' : '#main');
  document.title = (entry ? 'บันทึกข้อมูล · ' : '') + 'แดชบอร์ดคลังยา รพ.สต. จังหวัดนราธิวาส';
  if (entry) { renderEntry(); } else if (dirty) { dirty = false; A.refreshData(); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
S.onChange(() => { dirty = true; });

/* ---------- ข้อความแจ้ง / ยืนยัน ---------- */
let toastTimer;
function toast(msg, undo) {
  $('toastMsg').textContent = msg;
  const u = $('toastUndo');
  u.hidden = !undo;
  u.onclick = () => { undo(); $('toast').hidden = true; clearTimeout(toastTimer); };
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, undo ? 9000 : 4000);
}
function confirmBox({ title, body, ok = 'ตกลง', danger = true, single = false }) {
  const d = $('cfmDlg');
  $('cfTitle').textContent = title;
  $('cfBody').textContent = body;
  $('cfYes').textContent = ok;
  $('cfYes').className = 'btn ' + (danger ? 'danger' : 'primary');
  $('cfNo').hidden = single;
  return new Promise(res => {
    const done = v => { d.close(); res(v); };
    $('cfYes').onclick = () => done(true);
    $('cfNo').onclick = () => done(false);
    d.addEventListener('close', () => res(false), { once: true });
    d.showModal();
    (single ? $('cfYes') : $('cfNo')).focus();
  });
}

/* ---------- ฟอร์ม (ใช้ร่วมกัน) ---------- */
const fd = $('formDlg');
function openForm({ title, html, onSubmit, onInput, okText = 'บันทึก' }) {
  $('fdTitle').textContent = title;
  $('fdBody').innerHTML = html;
  $('fdOk').textContent = okText;
  showErr('');
  const form = $('fdForm');
  form.oninput = () => { showErr(''); onInput && onInput(form); };
  form.onsubmit = e => {
    e.preventDefault();
    const bad = [...form.querySelectorAll('[required]')].find(f => f.disabled === false && (!f.value || (f.type === 'number' && !f.checkValidity())));
    if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); showErr(bad.dataset.msg || 'กรุณากรอกข้อมูลให้ครบถ้วน', bad); return; }
    const err = onSubmit(form);
    if (err) showErr(err);
    else fd.close();
  };
  $('fdCancel').onclick = () => fd.close();
  onInput && onInput(form);
  fd.showModal();
  (form.querySelector('select:not(:disabled), input:not(:disabled)') || $('fdOk')).focus();
}
function showErr(msg) {
  const e = $('fdErr');
  e.textContent = msg; e.hidden = !msg;
  if (!msg) $('fdForm').querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
}
fd.addEventListener('click', e => {
  const r = fd.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) fd.close();
});

/* ---------- ตัวช่วยข้อมูล ---------- */
const unitMap = () => new Map(S.units().map(u => [u.id, u]));
const fyChoices = () => {
  const fys = [...new Set(S.txns().map(t => t[0]))].sort((a, b) => b - a);
  return fys.length ? [fys[0] + 1, ...fys].filter((v, i, a) => a.indexOf(v) === i) : [new Date().getFullYear() + 543];
};
const opt = (v, t, sel, dis) => `<option value="${esc(v)}"${sel ? ' selected' : ''}${dis ? ' disabled' : ''}>${esc(t)}</option>`;
const monthOpts = sel => MFULL.map((n, i) => opt(i + 1, n, i + 1 === sel)).join('');
const hotLabel = () => `▲ เกิน ${nf1.format(A.hot())}`;

/* ---------- แท็บ ---------- */
$('enTabs').onclick = e => {
  const t = e.target.dataset?.tab;
  if (!t) return;
  es.tab = t; es.page = 1;
  renderEntry();
};

function renderEntry() {
  $('enStale').hidden = !S.staleBase();
  $('enTabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === es.tab)));
  $('panelTxn').hidden = es.tab !== 'txn';
  $('panelUnit').hidden = es.tab !== 'unit';
  if (es.tab === 'txn') renderTxn(); else renderUnits();
}

/* ====================== รายการรายเดือน ====================== */
const tf = { fy: '', m: '', dist: '', flag: '', q: '' };
function buildTxnFilters() {
  const fys = [...new Set(S.txns().map(t => t[0]))].sort((a, b) => b - a);
  const dists = [...new Set(S.units().map(u => u.district))].sort((a, b) => a.localeCompare(b, 'th'));
  $('tFy').innerHTML = opt('', 'ทุกปี') + fys.map(f => opt(f, 'พ.ศ. ' + f, String(f) === tf.fy)).join('');
  $('tM').innerHTML = opt('', 'ทุกเดือน') + MFULL.map((n, i) => opt(i + 1, n, String(i + 1) === tf.m)).join('');
  $('tDist').innerHTML = opt('', 'ทุกอำเภอ') + dists.map(d => opt(d, d, d === tf.dist)).join('');
  $('tFlag').value = tf.flag;
}
[['tFy', 'fy'], ['tM', 'm'], ['tDist', 'dist'], ['tFlag', 'flag']].forEach(([id, k]) => { $(id).onchange = e => { tf[k] = e.target.value; es.page = 1; renderTxn(true); }; });
$('tQ').oninput = e => { tf.q = e.target.value.trim().toLowerCase(); es.page = 1; renderTxn(true); };

function txnRows() {
  const um = unitMap();
  return S.txns().filter(t => {
    const u = um.get(t[2]);
    if (!u) return false;
    if (tf.fy && String(t[0]) !== tf.fy) return false;
    if (tf.m && String(t[1]) !== tf.m) return false;
    if (tf.dist && u.district !== tf.dist) return false;
    if (tf.q && !u.name.toLowerCase().includes(tf.q) && !(u.piin || '').includes(tf.q)) return false;
    if (tf.flag === 'hot' && !A.isHot(t[5])) return false;
    if (tf.flag === 'late' && !S.isLate(t[0], t[1], t[2])) return false;
    if (tf.flag === 'anom' && !(t[5] != null && t[5] > A.ANOM)) return false;
    return true;
  }).sort((a, b) => b[0] - a[0] || b[1] - a[1] || a[2].localeCompare(b[2])).map(t => ({ t, u: um.get(t[2]) }));
}
function renderTxn(keepFilters) {
  if (!keepFilters) buildTxnFilters();
  const rows = txnRows(), pages = Math.max(1, Math.ceil(rows.length / PAGE));
  es.page = Math.min(es.page, pages);
  const view = rows.slice((es.page - 1) * PAGE, es.page * PAGE);
  $('ptCount').textContent = `(${nf0.format(rows.length)} รายการ)`;
  $('txnTbl').querySelector('tbody').innerHTML = view.length ? view.map(({ t, u }) => {
    const [fy, m, uid, a, b, c, , note] = t, hot = A.isHot(c), late = S.isLate(fy, m, uid), anom = c != null && c > A.ANOM;
    const label = `${u.name} ${MFULL[m - 1]} ${fy}`;
    return `<tr class="${hot ? 'hot' : ''}"><td>${esc(u.name)}${note ? `<div class="sub" title="${esc(note)}">${esc(note.length > 40 ? note.slice(0, 40) + '…' : note)}</div>` : ''}</td><td>${esc(u.district)}</td><td>${esc(MFULL[m - 1])} ${A.calYear(fy, m)}</td>
      <td class="num">${nf0.format(a)}</td><td class="num">${nf0.format(b)}</td>
      <td class="num ${hot ? 'hot-val' : ''}">${c == null ? '–' : nf2.format(c)}${hot ? ` <span class="pill bad">${hotLabel()}</span>` : ''}</td>
      <td>${late ? '<span class="pill warn">ล่าช้า</span> ' : ''}${anom ? '<span class="pill warn">ผิดปกติ</span>' : ''}${!late && !anom ? 'รายงานแล้ว' : ''}</td>
      <td class="acts"><button class="btn sm" type="button" data-act="edit" data-k="${fy}|${m}|${esc(uid)}" aria-label="แก้ไข ${esc(label)}">แก้ไข</button>
      <button class="btn sm danger-o" type="button" data-act="del" data-k="${fy}|${m}|${esc(uid)}" aria-label="ลบ ${esc(label)}">ลบ</button></td></tr>`;
  }).join('') : '<tr class="empty"><td colspan="8">ไม่พบรายการตามตัวกรอง</td></tr>';
  $('txnPager').innerHTML = pages > 1
    ? `<button class="btn sm" type="button" data-pg="-1" ${es.page <= 1 ? 'disabled' : ''}>ก่อนหน้า</button><span>หน้า ${es.page} / ${pages}</span><button class="btn sm" type="button" data-pg="1" ${es.page >= pages ? 'disabled' : ''}>ถัดไป</button>` : '';
}
$('txnPager').onclick = e => { const d = +e.target.dataset?.pg; if (d) { es.page += d; renderTxn(true); $('txnTbl').scrollIntoView({ block: 'nearest' }); } };
$('txnTbl').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const [fy, m, uid] = b.dataset.k.split('|'), key = [+fy, +m, uid];
  if (b.dataset.act === 'edit') txnForm(S.findTxn(...key));
  else {
    const t = S.findTxn(...key), u = unitMap().get(uid);
    if (!t) return;
    const ok = await confirmBox({ title: 'ลบรายการนี้?', body: `${u.name} · ${MFULL[+m - 1]} ${A.calYear(+fy, +m)} (เบิกจ่าย ${nf0.format(t[3])} · คงคลัง ${nf0.format(t[4])})` });
    if (!ok) return;
    const r = S.deleteTxn(...key);
    renderTxn(true);
    toast('ลบรายการแล้ว', () => { S.restoreTxn(r.removed); renderTxn(true); toast('กู้รายการคืนแล้ว'); });
  }
});
$('txnAdd').onclick = () => txnForm(null);

function txnForm(rec) {
  const isNew = !rec, um = unitMap();
  const [fy0, m0, uid0, a0, b0, , , note0] = rec || [fyChoices()[1] ?? fyChoices()[0], 1, '', '', '', null, 'web', ''];
  const byDist = new Map();
  S.units().filter(u => u.active || u.id === uid0).forEach(u => (byDist.get(u.district) || byDist.set(u.district, []).get(u.district)).push(u));
  const unitOpts = '<option value="">เลือกหน่วยบริการ</option>' + [...byDist.entries()].sort((x, y) => x[0].localeCompare(y[0], 'th'))
    .map(([d, us]) => `<optgroup label="${esc(d)}">${us.sort((x, y) => x.name.localeCompare(y.name, 'th')).map(u => opt(u.id, u.name, u.id === uid0)).join('')}</optgroup>`).join('');
  const lockKey = isNew ? '' : ' disabled';
  let lastPiin = '';
  openForm({
    title: isNew ? 'เพิ่มรายการรายเดือน' : `แก้ไขรายการ: ${um.get(uid0)?.name || uid0}`,
    html: `
      ${isNew ? `<label>ค้นหาด้วย PIIN (5 หลัก)<input name="piin" type="text" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="เช่น 96000"></label>
      <p class="calc" id="fdPiin" aria-live="polite"></p>` : ''}
      <label><span>หน่วยบริการ <span class="req">*</span></span><select name="uid" required data-msg="กรุณาเลือกหน่วยบริการ"${lockKey}>${unitOpts}</select></label>
      <div class="two">
        <label><span>ปีงบประมาณ (พ.ศ.) <span class="req">*</span></span><select name="fy" required${lockKey}>${fyChoices().map(f => opt(f, f, f === fy0)).join('')}</select></label>
        <label><span>เดือน <span class="req">*</span></span><select name="m" required${lockKey}>${monthOpts(m0)}</select></label>
      </div>
      <div class="two">
        <label><span>เบิกจ่าย A (บาท) <span class="req">*</span></span><input name="A" type="number" min="0" step="0.01" inputmode="decimal" required data-msg="กรุณากรอกยอดเบิกจ่าย (0 ขึ้นไป)" value="${a0 === '' ? '' : esc(a0)}"></label>
        <label><span>คงคลัง B (บาท) <span class="req">*</span></span><input name="B" type="number" min="0" step="0.01" inputmode="decimal" required data-msg="กรุณากรอกยอดคงคลัง (0 ขึ้นไป)" value="${b0 === '' ? '' : esc(b0)}"></label>
      </div>
      <p class="calc" id="fdCalc" aria-live="polite"></p>
      <label class="check"><input name="late" type="checkbox"${!isNew && S.isLate(fy0, m0, uid0) ? ' checked' : ''}><span>รายงานล่าช้า</span></label>
      <label>หมายเหตุ<input name="note" type="text" maxlength="200" value="${esc(note0 || '')}"></label>`,
    onInput: f => {
      if (f.piin) {
        const p = f.piin.value = f.piin.value.replace(/\D/g, ''), el = $('fdPiin');
        if (p !== lastPiin) {
          lastPiin = p;
          const hit = p.length === 5 ? S.unitByPiin(p) : null;
          if (hit && !hit.active) { el.textContent = `PIIN ${p} คือ ${hit.name} แต่หน่วยนี้ปิดใช้งานอยู่`; }
          else if (hit) { f.uid.value = hit.id; el.textContent = `PIIN ${p} → ${hit.name} (อ.${hit.district})`; }
          else el.textContent = p.length === 5 ? `ไม่พบหน่วยบริการที่มี PIIN ${p} (ตั้ง PIIN ได้ที่แท็บหน่วยบริการ)` : '';
        }
      }
      const a = parseFloat(f.A.value), b = parseFloat(f.B.value), el = $('fdCalc');
      if (!(a >= 0) || !(b >= 0)) { el.textContent = 'อัตราสำรอง = คงคลัง ÷ เบิกจ่าย (คำนวณอัตโนมัติ)'; el.className = 'calc'; return; }
      const c = S.calcC(a, b);
      if (c == null) { el.textContent = 'ไม่มีการเบิกจ่าย จึงไม่คำนวณอัตราสำรอง'; el.className = 'calc'; return; }
      const hot = A.isHot(c);
      el.className = 'calc' + (hot ? ' hot-val' : '');
      el.textContent = `อัตราสำรอง ${nf2.format(c)} เดือน` + (hot ? ` ${hotLabel()} เดือน` : '') + (c > A.ANOM ? ' · สูงผิดปกติ (เกิน ' + A.ANOM + ' เดือน) ตรวจยอดเบิกจ่ายอีกครั้ง' : '');
    },
    onSubmit: f => {
      const r = S.upsertTxn({ fy: +f.fy.value, m: +f.m.value, uid: f.uid.value, A: f.A.value, B: f.B.value, late: f.late.checked, note: f.note.value }, isNew);
      if (r.error === 'dup') return `มีรายการของ ${um.get(f.uid.value)?.name} เดือน${MFULL[+f.m.value - 1]} ปี ${f.fy.value} อยู่แล้ว ให้ค้นหาแล้วกด “แก้ไข” แทน`;
      if (r.error) return r.error;
      renderEntry();
      toast(r.saved ? (isNew ? 'เพิ่มรายการแล้ว' : 'บันทึกการแก้ไขแล้ว') : 'บันทึกแล้ว แต่เบราว์เซอร์ไม่อนุญาตให้เก็บถาวร ข้อมูลจะหายเมื่อปิดหน้านี้ ควรกด “สำรองข้อมูล”');
      return '';
    },
  });
}

/* ====================== หน่วยบริการ ====================== */
const uf = { q: '', inactive: false };
$('uQ').oninput = e => { uf.q = e.target.value.trim().toLowerCase(); renderUnits(); };
$('uActive').onchange = e => { uf.inactive = e.target.checked; renderUnits(); };
function renderUnits() {
  const counts = new Map();
  S.txns().forEach(t => counts.set(t[2], (counts.get(t[2]) || 0) + 1));
  const rows = S.units().filter(u => (!uf.q || u.name.toLowerCase().includes(uf.q) || (u.piin || '').includes(uf.q) || u.district.toLowerCase().includes(uf.q)) && (!uf.inactive || !u.active))
    .sort((a, b) => a.id.localeCompare(b.id));
  $('puCount').textContent = `(${rows.length} จาก ${S.units().length} หน่วย)`;
  $('unitTbl').querySelector('tbody').innerHTML = rows.length ? rows.map(u => `<tr>
    <td>${esc(u.id)}</td><td>${esc(u.piin || '–')}</td><td>${esc(u.name)}</td><td>${esc(u.district)}</td><td>${esc(u.aff)}</td><td class="num">${counts.get(u.id) || 0}</td>
    <td>${u.active ? 'ใช้งาน' : '<span class="pill none">ปิดใช้งาน</span>'}</td>
    <td class="acts"><button class="btn sm" type="button" data-act="edit" data-id="${esc(u.id)}" aria-label="แก้ไข ${esc(u.name)}">แก้ไข</button>
    <button class="btn sm danger-o" type="button" data-act="del" data-id="${esc(u.id)}" aria-label="ลบ ${esc(u.name)}">ลบ</button></td></tr>`).join('')
    : '<tr class="empty"><td colspan="8">ไม่พบหน่วยบริการ</td></tr>';
}
$('unitAdd').onclick = () => unitForm(null);
$('unitTbl').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const u = S.units().find(x => x.id === b.dataset.id);
  if (!u) return;
  if (b.dataset.act === 'edit') return unitForm(u);
  const n = S.countTxnsOfUnit(u.id);
  if (n) {
    await confirmBox({ title: 'ลบหน่วยนี้ไม่ได้', body: `${u.name} มีรายการบันทึก ${n} รายการ ถ้าไม่ต้องการให้แสดงในแดชบอร์ด ให้แก้ไขแล้วปิดใช้งานแทน`, ok: 'รับทราบ', danger: false, single: true });
    return;
  }
  if (!(await confirmBox({ title: 'ลบหน่วยบริการ?', body: `${u.name} (${u.id}) อำเภอ${u.district}` }))) return;
  const r = S.deleteUnit(u.id);
  if (r.error) return toast(r.error);
  renderUnits();
  toast('ลบหน่วยบริการแล้ว', () => { S.restoreUnit(r.removed); renderUnits(); toast('กู้หน่วยบริการคืนแล้ว'); });
});
function unitForm(u) {
  const isNew = !u, id = isNew ? S.nextUnitId() : u.id;
  const dists = [...new Set(S.units().map(x => x.district))].sort((a, b) => a.localeCompare(b, 'th'));
  const affs = [...new Set(S.units().map(x => x.aff).filter(Boolean))].sort();
  openForm({
    title: isNew ? 'เพิ่มหน่วยบริการ' : `แก้ไขหน่วยบริการ: ${u.name}`,
    html: `
      <div class="two">
        <label>รหัสหน่วย<input name="id" type="text" value="${esc(id)}" disabled></label>
        <label>PIIN (5 หลัก)<input name="piin" type="text" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" placeholder="เช่น 96000" value="${esc(u?.piin || '')}"></label>
      </div>
      <label><span>ชื่อหน่วยบริการ <span class="req">*</span></span><input name="name" type="text" required maxlength="80" data-msg="กรุณากรอกชื่อหน่วยบริการ" value="${esc(u?.name || '')}"></label>
      <div class="two">
        <label><span>อำเภอ <span class="req">*</span></span><input name="district" type="text" list="dlDist" required maxlength="40" data-msg="กรุณากรอกอำเภอ" value="${esc(u?.district || '')}"><datalist id="dlDist">${dists.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
        <label><span>สังกัด <span class="req">*</span></span><input name="aff" type="text" list="dlAff" required maxlength="80" data-msg="กรุณากรอกสังกัด" value="${esc(u?.aff || '')}"><datalist id="dlAff">${affs.map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
      </div>
      <label class="check"><input name="active" type="checkbox"${!u || u.active ? ' checked' : ''}><span>ใช้งาน (ถ้าปิด จะไม่แสดงในแดชบอร์ด)</span></label>`,
    onSubmit: f => {
      const r = S.upsertUnit({ id, piin: f.piin.value, name: f.name.value, district: f.district.value, aff: f.aff.value, active: f.active.checked }, isNew);
      if (r.error) return r.error;
      renderEntry();
      toast(isNew ? 'เพิ่มหน่วยบริการแล้ว' : 'บันทึกการแก้ไขแล้ว');
      return '';
    },
  });
}

/* ====================== สำรอง / กู้คืน / รีเซ็ต ====================== */
$('enBackup').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([S.exportJSON()], { type: 'application/json' }));
  a.download = `drugdash-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('enRestore').onclick = () => $('enFile').click();
$('enFile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  if (!(await confirmBox({ title: 'กู้คืนข้อมูลจากไฟล์?', body: `ข้อมูลปัจจุบันในเครื่องนี้จะถูกแทนที่ด้วยข้อมูลจาก “${f.name}”`, ok: 'กู้คืน' }))) return;
  const r = S.importJSON(await f.text());
  if (r.error) return toast(r.error);
  renderEntry();
  toast(`กู้คืนแล้ว: ${r.units} หน่วย · ${nf0.format(r.txns)} รายการ`);
};
$('enReset').onclick = async () => {
  if (!(await confirmBox({ title: 'คืนค่าเริ่มต้น?', body: 'รายการที่เพิ่ม แก้ไข หรือลบไว้ในเครื่องนี้ทั้งหมดจะหาย และกลับไปใช้ข้อมูลจากไฟล์ Excel ต้นฉบับ ควรกด “สำรองข้อมูล” ก่อน', ok: 'คืนค่าเริ่มต้น' }))) return;
  S.reset();
  renderEntry();
  toast('คืนค่าเริ่มต้นแล้ว');
};

route();
})();

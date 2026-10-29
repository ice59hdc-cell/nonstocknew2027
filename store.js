/* ชั้นข้อมูล: ข้อมูลตั้งต้นมาจาก data.js (Excel) แล้วเก็บส่วนที่แก้ไขไว้ใน localStorage ของเบราว์เซอร์
   txn = [ปีงบ, เดือนที่(1=ต.ค.), รหัสหน่วย, A เบิกจ่าย, B คงคลัง, C สำรอง(เดือน), แหล่งที่มา, หมายเหตุ] */
window.Store = (() => {
  const KEY = 'drugdash-data-v1';
  const base = window.DATA;
  const clone = x => JSON.parse(JSON.stringify(x));
  const listeners = [];
  let db = load();

  function fresh() { return { units: clone(base.units), txns: clone(base.txns), late: clone(base.late), edited: false, staleBase: false }; }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.units) && Array.isArray(s.txns) && Array.isArray(s.late)) {
        return { units: s.units, txns: s.txns, late: s.late, edited: true, staleBase: s.base !== base.lastUpdate };
      }
    } catch (_) { /* ใช้ข้อมูลตั้งต้น */ }
    return fresh();
  }
  function persist() {
    db.edited = true;
    let saved = true;
    try { localStorage.setItem(KEY, JSON.stringify({ base: base.lastUpdate, units: db.units, txns: db.txns, late: db.late })); } catch (_) { saved = false; }
    listeners.forEach(f => f());
    return saved;
  }

  const key = (fy, m, uid) => `${fy}|${m}|${uid}`;
  const round2 = v => Math.round(v * 100) / 100;
  const calcC = (A, B) => (A > 0 ? round2(B / A) : null);
  const txnIndex = (fy, m, uid) => db.txns.findIndex(t => t[0] === fy && t[1] === m && t[2] === uid);
  const lateIndex = (fy, m, uid) => db.late.findIndex(l => l[0] === fy && l[1] === m && l[2] === uid);
  const setLate = (fy, m, uid, on) => {
    const i = lateIndex(fy, m, uid);
    if (on && i < 0) db.late.push([fy, m, uid]);
    if (!on && i >= 0) db.late.splice(i, 1);
  };

  return {
    key, calcC,
    units: () => db.units,
    txns: () => db.txns,
    late: () => db.late,
    isLate: (fy, m, uid) => lateIndex(fy, m, uid) >= 0,
    edited: () => db.edited,
    staleBase: () => db.staleBase,
    onChange: f => listeners.push(f),
    findTxn: (fy, m, uid) => db.txns[txnIndex(fy, m, uid)],

    /* บันทึกรายเดือน: o = {fy, m, uid, A, B, late, note} */
    upsertTxn(o, isNew) {
      const A = Number(o.A), B = Number(o.B);
      if (!db.units.some(u => u.id === o.uid)) return { error: 'ไม่พบหน่วยบริการ' };
      if (!Number.isInteger(o.fy) || o.fy < 2500 || o.fy > 2700) return { error: 'ปีงบประมาณไม่ถูกต้อง' };
      if (!Number.isInteger(o.m) || o.m < 1 || o.m > 12) return { error: 'เดือนไม่ถูกต้อง' };
      if (!Number.isFinite(A) || A < 0 || !Number.isFinite(B) || B < 0) return { error: 'ยอดเบิกจ่ายและคงคลังต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' };
      const i = txnIndex(o.fy, o.m, o.uid);
      if (isNew && i >= 0) return { error: 'dup' };
      if (!isNew && i < 0) return { error: 'ไม่พบรายการที่จะแก้ไข' };
      const note = (o.note || '').trim().slice(0, 200) || null;
      const row = [o.fy, o.m, o.uid, round2(A), round2(B), calcC(round2(A), round2(B)), isNew ? 'web' : db.txns[i][6], note];
      if (isNew) db.txns.push(row); else db.txns[i] = row;
      setLate(o.fy, o.m, o.uid, !!o.late);
      return { ok: true, saved: persist() };
    },
    deleteTxn(fy, m, uid) {
      const i = txnIndex(fy, m, uid);
      if (i < 0) return { error: 'ไม่พบรายการ' };
      const removed = { row: db.txns[i], wasLate: lateIndex(fy, m, uid) >= 0 };
      db.txns.splice(i, 1);
      setLate(fy, m, uid, false);
      persist();
      return { ok: true, removed };
    },
    restoreTxn({ row, wasLate }) {
      if (txnIndex(row[0], row[1], row[2]) >= 0) return;
      db.txns.push(row);
      setLate(row[0], row[1], row[2], wasLate);
      persist();
    },

    /* หน่วยบริการ: o = {id, name, district, aff, active} */
    nextUnitId() {
      const n = db.units.reduce((mx, u) => Math.max(mx, parseInt(String(u.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
      return 'U' + String(n).padStart(3, '0');
    },
    upsertUnit(o, isNew) {
      const name = (o.name || '').trim(), district = (o.district || '').trim(), aff = (o.aff || '').trim();
      if (!name || !district || !aff) return { error: 'กรุณากรอกชื่อหน่วย อำเภอ และสังกัด' };
      const piin = String(o.piin ?? '').trim();
      if (piin && !/^\d{5}$/.test(piin)) return { error: 'PIIN ต้องเป็นตัวเลข 5 หลัก' };
      if (db.units.some(u => u.id !== o.id && u.name === name)) return { error: 'มีหน่วยบริการชื่อนี้แล้ว' };
      if (piin && db.units.some(u => u.id !== o.id && u.piin === piin)) return { error: `PIIN ${piin} ถูกใช้กับหน่วยอื่นแล้ว` };
      const i = db.units.findIndex(u => u.id === o.id);
      if (isNew && i >= 0) return { error: 'รหัสหน่วยซ้ำ' };
      if (!isNew && i < 0) return { error: 'ไม่พบหน่วยบริการ' };
      const rec = { id: o.id, name, district, aff, active: !!o.active };
      if (piin) rec.piin = piin;
      if (isNew) db.units.push(rec); else db.units[i] = rec;
      return { ok: true, saved: persist() };
    },
    unitByPiin: piin => db.units.find(u => u.piin === piin),
    countTxnsOfUnit: uid => db.txns.filter(t => t[2] === uid).length,
    deleteUnit(uid) {
      const n = db.txns.filter(t => t[2] === uid).length;
      if (n) return { error: `หน่วยนี้มีรายการบันทึก ${n} รายการ ลบไม่ได้ ให้ตั้งเป็น “ปิดใช้งาน” แทน` };
      const i = db.units.findIndex(u => u.id === uid);
      if (i < 0) return { error: 'ไม่พบหน่วยบริการ' };
      const removed = db.units.splice(i, 1)[0];
      persist();
      return { ok: true, removed };
    },
    restoreUnit(u) { if (!db.units.some(x => x.id === u.id)) { db.units.push(u); persist(); } },

    /* สำรอง / กู้คืน */
    exportJSON: () => JSON.stringify({ app: 'drugdash', version: 1, exportedAt: new Date().toISOString(), units: db.units, txns: db.txns, late: db.late }, null, 1),
    importJSON(text) {
      let s;
      try { s = JSON.parse(text); } catch (_) { return { error: 'ไฟล์ไม่ใช่ JSON ที่อ่านได้' }; }
      const okUnit = u => u && typeof u.id === 'string' && typeof u.name === 'string' && typeof u.district === 'string';
      const okTxn = t => Array.isArray(t) && t.length >= 5 && Number.isInteger(t[0]) && Number.isInteger(t[1]) && typeof t[2] === 'string';
      if (!s || s.app !== 'drugdash' || !Array.isArray(s.units) || !Array.isArray(s.txns) || !s.units.every(okUnit) || !s.txns.every(okTxn)) {
        return { error: 'ไฟล์นี้ไม่ใช่ไฟล์สำรองของแดชบอร์ดนี้' };
      }
      db.units = s.units.map(u => ({ id: u.id, name: u.name, district: u.district, aff: u.aff || '', active: u.active !== false, ...(/^\d{5}$/.test(u.piin) ? { piin: u.piin } : {}) }));
      db.txns = s.txns; db.late = Array.isArray(s.late) ? s.late : [];
      db.staleBase = false;
      persist();
      return { ok: true, units: db.units.length, txns: db.txns.length };
    },
    reset() {
      try { localStorage.removeItem(KEY); } catch (_) { /* ไม่มี storage */ }
      db = fresh();
      listeners.forEach(f => f());
    },
  };
})();

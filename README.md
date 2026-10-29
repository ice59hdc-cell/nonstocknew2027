# แดชบอร์ดคลังยา รพ.สต. จ.นราธิวาส

เปิด `index.html` ด้วยเบราว์เซอร์ได้ทันที (ไม่ต้องติดตั้ง ไม่ต้องต่ออินเทอร์เน็ต)

## อัปเดตข้อมูลจาก Excel ใหม่
```
pip install openpyxl
python scripts/build_data.py <ไฟล์.xlsx> data.js
```
สคริปต์อ่านเฉพาะชีตข้อมูลปฏิบัติการ (Transactions, Master_Units, Trans_Log, KPI_Targets, Key_Insights, Settings บางคีย์)
ไม่นำ PIN/รหัสผ่านจากชีต Master_Units, Settings และ ชีต2 ออกมาใส่ในเว็บ

## เมนูบันทึกข้อมูล (CRUD)
เมนู “บันทึกข้อมูล” เพิ่ม/แก้ไข/ลบ รายการรายเดือนและหน่วยบริการ ข้อมูลเก็บใน localStorage ของเบราว์เซอร์เครื่องนั้น
(ไม่มีเซิร์ฟเวอร์กลาง) จึงไม่แชร์ข้ามเครื่อง ใช้ “สำรองข้อมูล (JSON)” / “กู้คืนจากไฟล์” เพื่อย้ายหรือเก็บสำเนา
ถ้าสร้าง data.js ใหม่จาก Excel ให้กด “คืนค่าเริ่มต้น” เพื่อใช้ข้อมูลใหม่

## ไฮไลต์สำรองเกินเกณฑ์
ค่าเริ่มต้น 1.5 เดือน ปรับได้ที่ช่อง “ไฮไลต์แดงเมื่อสำรองเกิน” (จำค่าไว้ในเบราว์เซอร์)

## เข้าสู่ระบบด้วย PIN
ทุกหน้า (รวม `data.js`) ต้องเข้าสู่ระบบก่อน ผ่าน `login.html` ใช้ PIN 6 หลักอย่างเดียว (PIN ของแต่ละคนต้องไม่ซ้ำกัน)
- `middleware.js` ตรวจคุกกี้เซสชันที่เซ็นแล้ว ถ้าไม่ผ่านส่งไป `/login.html`
- `api/login.js` · `api/me.js` · `api/logout.js` ตรวจ PIN, เปิด/ปิดเซสชัน (ตาราง `users`, `sessions`, `login_attempts` ใน `migrations/`)
- PIN เก็บเป็น scrypt + salt ต่อผู้ใช้ + `PIN_PEPPER` ผิดครบ 10 ครั้งต่อ IP หรือ 60 ครั้งรวมทั้งระบบ จะล็อก 15 นาที (ไม่มีอีเมลให้ล็อกรายบัญชี)

### ตั้งค่าบน Vercel (Settings → Environment Variables)
| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | connection string ของ Postgres (Neon / Supabase ฯลฯ) |
| `SESSION_SECRET` | สุ่มอย่างน้อย 32 ตัวอักษร (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `PIN_PEPPER` | สุ่มอย่างน้อย 32 ตัวอักษร **ห้ามเปลี่ยนภายหลัง** ไม่งั้น PIN เดิมใช้ไม่ได้ทั้งหมด |

### สร้างผู้ใช้ / ตั้ง PIN ใหม่
```
npm install
# ตั้ง DATABASE_URL และ PIN_PEPPER ใน shell (ค่าเดียวกับบน Vercel) แล้ว
node scripts/create_user.mjs "ชื่อ นามสกุล" admin --migrate   # ครั้งแรก สร้างตารางด้วย
node scripts/create_user.mjs "ชื่อ นามสกุล" editor             # คนถัดไป (ชื่อซ้ำ = ตั้ง PIN ใหม่ให้คนเดิม)
```
สคริปต์สุ่ม PIN แล้วแสดงครั้งเดียว บทบาท: `admin`, `editor`, `viewer` (ตอนนี้ยังใช้แยกสิทธิ์ในหน้าเว็บไม่ได้ ทุกบทบาทเข้าได้เท่ากัน)

-- เข้าสู่ระบบด้วย PIN อย่างเดียว: ไม่ใช้อีเมลระบุตัวตนอีกต่อไป
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_lookup text;
CREATE UNIQUE INDEX IF NOT EXISTS users_pin_lookup_key ON users(pin_lookup);
ALTER TABLE login_attempts ALTER COLUMN email DROP NOT NULL;

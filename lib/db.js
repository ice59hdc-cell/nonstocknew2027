import pg from 'pg';

let pool;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('ไม่ได้ตั้ง DATABASE_URL');
  return (pool ||= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 }));
}

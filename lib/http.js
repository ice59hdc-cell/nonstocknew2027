export function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

/* POST ต้องมาจากหน้าเว็บของเราเอง (Origin ตรงกับ Host) และเป็น JSON */
export function sameOriginJson(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  try { if (new URL(origin).host !== req.headers.host) return false; } catch { return false; }
  return String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json');
}

export const clientIp = req => String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || '').split(',')[0].trim();

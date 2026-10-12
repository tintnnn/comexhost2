'use strict';

// Your own backend URL. Set BACKEND_URL in the frontend Vercel project
// (e.g. https://your-backend.vercel.app). Do not point this at an expired
// or third-party deployment.
const BACKEND = process.env.BACKEND_URL || '';

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (!BACKEND) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error:
          'BACKEND_URL is not set. Deploy the backend from /backend and set BACKEND_URL on this frontend project.',
      })
    );
    return;
  }

  const forwardedPath = String(req.query.path || '').replace(/^\/+/, '');
  const destUrl = new URL(`/api/${forwardedPath}`, BACKEND);

  const incoming = new URL(req.url, 'http://localhost');
  incoming.searchParams.delete('path');
  incoming.searchParams.forEach((value, key) => destUrl.searchParams.append(key, value));

  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const k = key.toLowerCase();
    if (
      [
        'host',
        'origin',
        'referer',
        'connection',
        'content-length',
        'accept-encoding',
      ].includes(k)
    ) {
      continue;
    }
    if (typeof value === 'string') headers[key] = value;
  }

  const method = req.method || 'GET';
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await collectBody(req);

  const upstream = await fetch(destUrl, { method, headers, body });

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(k)) return;
    res.setHeader(key, value);
  });

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
};

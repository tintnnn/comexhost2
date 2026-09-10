'use strict';

const BACKEND = 'https://backend-ten-dusky-71.vercel.app';

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

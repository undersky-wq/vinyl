const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const version = require('../app.json').expo.version;
const file = path.resolve(__dirname, '../../..', `reports/shelf-offline-${version}.apk`);
const host = process.env.APK_HOST || '192.168.1.133';
const route = `/shelf-offline-${version}.apk`;
http.createServer((request, response) => {
  if (request.url !== route || !['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(404); return response.end('Not found');
  }
  if (!fs.existsSync(file)) { response.writeHead(503); return response.end('APK is not ready'); }
  response.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': `attachment; filename="Shelf-Offline-${version}.apk"`,
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') return response.end();
  const stream = fs.createReadStream(file);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}).listen(8765, host, () => console.log(`APK: http://${host}:8765${route}`));

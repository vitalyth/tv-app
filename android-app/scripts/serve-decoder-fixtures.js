const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '/tmp/tv-decoder-clips');
http.createServer((request, response) => {
  console.info(request.method, request.url, request.headers.range || '', request.headers['user-agent'] || '');
  const name = new URL(request.url, 'http://localhost').pathname;
  if (!/^\/tile-[123]\.mp4$/.test(name)) {
    response.writeHead(404).end();
    return;
  }
  const filename = path.join(root, name.slice(1));
  fs.stat(filename, (error, stat) => {
    if (error) { response.writeHead(404).end(); return; }
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
      return;
    }
    const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 };
    if (range) { headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = fs.createReadStream(filename, { start, end });
    response.on('close', () => stream.destroy());
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });
}).listen(8766, '0.0.0.0', () => console.info(`Decoder fixtures: ${root}, port 8766`));

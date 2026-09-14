const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.fbx': 'application/octet-stream',
  '.bin': 'application/octet-stream'
};

const ROOT_DIR = __dirname;
let preferredPort = parseInt(process.env.PORT, 10) || 8080;

function createServer(port) {
  const server = http.createServer((req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    // Strip query parameters and hash
    const cleanUrl = req.url.split('?')[0].split('#')[0];
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(cleanUrl);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // Normalize and prevent directory traversal
    let safePath = path.normalize(decodedPath).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
      safePath = '/index.html';
    }

    let filePath = path.join(ROOT_DIR, safePath);

    // If path points to a directory, try serving index.html within it
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${safePath}`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const fileSize = stats.size;
      const range = req.headers.range;

      // Range request handling for audio/video media
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize || end >= fileSize || start > end) {
          res.writeHead(416, {
            'Content-Range': `bytes */${fileSize}`,
            'Content-Type': contentType
          });
          res.end();
          return;
        }

        const chunksize = (end - start) + 1;
        const fileStream = fs.createReadStream(filePath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType
        });

        if (req.method === 'HEAD') {
          res.end();
        } else {
          fileStream.pipe(res);
        }
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });

        if (req.method === 'HEAD') {
          res.end();
        } else {
          fs.createReadStream(filePath).pipe(res);
        }
      }
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      createServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n======================================================`);
    console.log(` Subway Surfers - Local Dev Server Running!`);
    console.log(` URL: ${url}`);
    console.log(` Root: ${ROOT_DIR}`);
    console.log(`======================================================\n`);

    // Auto-open browser on macOS if not in headless/subagent test
    if (process.argv.includes('--open')) {
      exec(`open "${url}"`);
    }
  });
}

createServer(preferredPort);

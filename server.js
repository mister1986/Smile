// Standalone local/VPS server — no Vercel needed.
// Run:  GEMINI_API_KEY="KEY_ID:KEY_SECRET" node server.js
// Windows (PowerShell):  $env:GEMINI_API_KEY="KEY_ID:KEY_SECRET"; node server.js
// Then open http://localhost:3000

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import generate from './api/generate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Adapt to the Vercel-style handler
  if (req.url === '/api/generate') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try { req.body = JSON.parse(body || '{}'); } catch { req.body = {}; }
      const vres = {
        setHeader: (k, v) => res.setHeader(k, v),
        status(code) { res.statusCode = code; return this; },
        json(obj) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); },
        end: (d) => res.end(d),
      };
      await generate(req, vres);
    });
    return;
  }
  // Static: serve index.html
  try {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(readFileSync(join(__dirname, 'index.html')));
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`✅ My Dental Implant smile preview running at http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('⚠️  GEMINI_API_KEY is not set — generation will fail. Get a free key at https://aistudio.google.com');
  }
});

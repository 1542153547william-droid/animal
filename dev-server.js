// ============================================================
// dev-server.js  —  本地开发服务器（前后端一体，无需 Vercel 也能跑）
// ------------------------------------------------------------
// 用法：node dev-server.js  →  打开 http://localhost:3000
// 它既托管静态文件，又把 /api/pet 转发给与 Vercel 同一套核心逻辑。
// 部署到 Vercel 时本文件不会被使用（Vercel 用 api/pet.js 处理接口）。
// ============================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePet } from './api/_petCore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // —— 后端接口 ——
  if (url.pathname === '/api/pet') {
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {}
    }
    const r = await handlePet({
      method: req.method,
      query: Object.fromEntries(url.searchParams),
      body,
    });
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(r.json));
  }

  // —— 静态文件 ——
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(__dirname, p);
  if (!file.startsWith(__dirname) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`🐾 萌宠小镇本地运行中：http://localhost:${PORT}`);
});

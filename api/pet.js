// ============================================================
// api/pet.js  —  Vercel Serverless 函数入口（部署后映射到 /api/pet）
// ------------------------------------------------------------
// 仅做"请求适配"：把 Vercel 的 req/res 转交给与框架无关的 _petCore.js。
// 注意：本目录下以 _ 开头的文件（_petCore.js / _store.js）不会被
// Vercel 当作独立路由，只作为被引用的模块。
// ============================================================

import { handlePet } from './_petCore.js';

export default async function handler(req, res) {
  const result = await handlePet({
    method: req.method,
    query: req.query || {},
    body: req.body || {},
  });
  res.status(result.status).json(result.json);
}

// ============================================================
// lib/api.js  —  前端 API 客户端（视图层只跟它打交道）
// ------------------------------------------------------------
// 前端不在本地保存任何宠物状态，只保存一个 petId 用来识别“这是谁的宠物”。
// 所有状态读写都通过 fetch('/api/pet') 交给后端。这就是前后端分离。
// 后端返回结构：{ ok, pet, catalog } —— 这里统一透传。
// ============================================================

const API = '/api/pet';

// 生成本机唯一的宠物 ID（仅此一项存在 localStorage）
function getPetId() {
  let id = localStorage.getItem('mengpet_id');
  if (!id) {
    id = 'u_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('mengpet_id', id);
  }
  return id;
}

// 拉取完整数据（宠物状态 + 目录）
export async function fetchData() {
  const res = await fetch(`${API}?petId=${encodeURIComponent(getPetId())}`);
  return res.json();
}

// 执行一个动作，返回最新完整数据
export async function act(action, extra = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petId: getPetId(), action, ...extra }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'request failed');
  return data;
}

// ============================================================
// api/_petCore.js  —  业务逻辑（前后端共用的核心，与框架无关）
// ------------------------------------------------------------
// 这里是"唯一真相源"：宠物状态、时间衰减、互动、等级全在这里算。
// Vercel 的 api/pet.js 和本地 dev-server.js 都调用本文件，
// 因此同一套逻辑在本地和云端表现完全一致。
// ============================================================

import { store } from './_store.js';

function fresh(petId) {
  return {
    petId,
    name: '小喵',
    satiety: 80,    // 饱食度 0-100
    happiness: 80,  // 心情   0-100
    energy: 80,     // 精力   0-100
    careCount: 0,   // 累计照顾次数
    born: Date.now(),
    lastUpdate: Date.now(),
  };
}

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const DECAY = { satiety: 1.0, happiness: 0.8, energy: -0.5 }; // energy 为负=缓慢恢复

// 依据距上次更新的时间差，回算状态衰减
function decay(s) {
  const minutes = (Date.now() - s.lastUpdate) / 60000;
  if (minutes <= 0) return s;
  s.satiety = clamp(s.satiety - DECAY.satiety * minutes);
  s.happiness = clamp(s.happiness - DECAY.happiness * minutes);
  s.energy = clamp(s.energy - DECAY.energy * minutes);
  s.lastUpdate = Date.now();
  return s;
}

export async function handlePet({ method, query = {}, body = {} }) {
  const petId = String(query.petId || body.petId || 'default').slice(0, 64);
  const action = String(body.action || '');

  if (method === 'GET') {
    let s = await store.get(petId);
    if (!s) {
      s = fresh(petId);
      await store.save(petId, s);
    }
    return { status: 200, json: { ok: true, pet: decay({ ...s }) } };
  }

  if (method === 'POST') {
    let s = (await store.get(petId)) || fresh(petId);
    s = decay(s);

    if (action === 'feed') {
      s.satiety = clamp(s.satiety + 20);
    } else if (action === 'play') {
      s.happiness = clamp(s.happiness + 15);
      s.energy = clamp(s.energy - 10);
      s.satiety = clamp(s.satiety - 5);
    } else if (action === 'sleep') {
      s.energy = clamp(s.energy + 25);
      s.satiety = clamp(s.satiety - 3);
    } else if (action === 'rename') {
      s.name = String(body.name || '').trim().slice(0, 12) || '小喵';
    } else if (action === 'reset') {
      s = fresh(petId);
    } else {
      return { status: 400, json: { ok: false, error: 'unknown action' } };
    }

    if (action !== 'reset') s.careCount += 1;
    s.lastUpdate = Date.now();
    await store.save(petId, s);
    return { status: 200, json: { ok: true, pet: s } };
  }

  return { status: 405, json: { ok: false, error: 'Method Not Allowed' } };
}

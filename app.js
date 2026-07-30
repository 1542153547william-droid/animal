// app.js — 纯视图层：渲染 + 事件，所有数据来自后端 API
import { fetchData, act } from './lib/api.js';

const $ = (id) => document.getElementById(id);
let CATALOG = { species: [], scenes: [], shop: [], achievements: [] };
let currentTab = 'home';
let openScene = null;

// —— 工具 ——
const clamp = (v) => Math.max(0, Math.min(100, v));
function moodOf(s) {
  if (s.sick) return { emoji: '🤒', text: '我生病了，快带我去看医生💊' };
  const min = Math.min(s.satiety, s.cleanliness, s.happiness, s.health);
  if (min < 25) return { emoji: '😿', text: '有点难受，照顾一下我吧…' };
  if (s.happiness > 70 && s.health > 50) return { emoji: '😸', text: '超开心！' };
  if (s.satiety < 40) return { emoji: '🙀', text: '肚子有点饿…' };
  if (s.cleanliness < 40) return { emoji: '🐾', text: '身上脏脏的～' };
  return { emoji: '🐱', text: '心情不错～' };
}
const petLevelOf = (s) => Math.floor(s.careCount / 5) + 1;
const speciesEmoji = (s) => (CATALOG.species.find(x => x.key === s.species) || {}).emoji || '🐱';
const shopItem = (id) => CATALOG.shop.find(x => x.id === id);

// —— 渲染：领养屏 ——
function renderAdopt() {
  const wrap = $('speciesCards');
  wrap.innerHTML = '';
  CATALOG.species.forEach(sp => {
    const card = document.createElement('div');
    card.className = 'species-card';
    card.dataset.species = sp.key;
    card.innerHTML = `<div class="s-emoji">${sp.emoji}</div>
      <div class="s-name">${sp.name}</div>
      <div class="s-person">${sp.personality}</div>
      <div class="s-desc">${sp.desc}</div>`;
    card.addEventListener('click', () => {
      document.querySelectorAll('.species-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      card._selected = sp.key;
      window.__selectedSpecies = sp.key;
    });
    wrap.appendChild(card);
  });
}

// —— 渲染：钱包 + 宠物卡 ——
function renderHome(s) {
  $('gold').textContent = s.gold;
  $('diamond').textContent = s.diamond;
  $('token').textContent = s.token;
  $('ulevel').textContent = s.level;

  const mood = moodOf(s);
  const clothing = s.equipped.clothing ? (shopItem(s.equipped.clothing)?.icon || '') : '';
  $('petAvatar').textContent = speciesEmoji(s) + clothing;
  $('petMood').textContent = mood.text;
  $('petName').value = s.name;
  $('petLevel').textContent = petLevelOf(s);
  $('careCount').textContent = s.careCount;

  $('barSatiety').style.width = s.satiety + '%';
  $('barCleanliness').style.width = s.cleanliness + '%';
  $('barHappiness').style.width = s.happiness + '%';
  $('barHealth').style.width = s.health + '%';

  const btnHeal = $('btnHeal');
  btnHeal.classList.toggle('urgent', s.sick);

  const furniture = s.equipped.furniture ? (shopItem(s.equipped.furniture)?.icon || '') : '';
  $('room').textContent = furniture ? `房间：${furniture}` : '';
}

// —— 渲染：小镇场景 ——
function renderTown() {
  const grid = $('sceneCards');
  grid.innerHTML = '';
  CATALOG.scenes.forEach(sc => {
    const card = document.createElement('div');
    card.className = 'scene-card';
    const visited = state.visitedScenes?.includes(sc.key);
    card.innerHTML = `<div class="sc-emoji">${sc.emoji}</div>
      <div class="sc-name">${sc.name}</div>
      <div class="sc-desc">${sc.desc}</div>
      <div class="sc-flag">${visited ? '✅ 已到访' : '未到访'}</div>`;
    card.addEventListener('click', () => { openScene = sc.key; renderSceneDetail(); });
    grid.appendChild(card);
  });
  if (openScene) renderSceneDetail();
}

function renderSceneDetail() {
  const sc = CATALOG.scenes.find(x => x.key === openScene);
  const detail = $('sceneDetail');
  if (!sc) { detail.classList.add('hidden'); return; }
  detail.classList.remove('hidden');
  const s = state;
  let actions = '';
  if (sc.key === 'hospital') {
    actions = `<p>当前健康：${s.health} ${s.sick ? '🤒 生病中' : '❤️ 良好'}</p>
      <button class="btn heal" data-act="heal">💊 就医治疗</button>
      <button class="btn" data-visit="hospital">📍 到访医院</button>`;
  } else if (sc.key === 'school') {
    actions = `<p>上课可增长经验与心情（每次 +15 经验）</p>
      <button class="btn school" data-act="school">📚 上课训练</button>
      <button class="btn" data-visit="school">📍 到访学校</button>`;
  } else if (sc.key === 'park') {
    actions = `<p>散步可愉悦心情、赚金币（每次 +5 金币）</p>
      <button class="btn play" data-visit="park">🌳 去公园散步</button>`;
  } else if (sc.key === 'shop') {
    actions = `<p>前往商城采购道具与装扮</p>
      <button class="btn feed" data-goto="shop">🛒 进入商城</button>
      <button class="btn" data-visit="shop">📍 到访商店</button>`;
  }
  detail.innerHTML = `<h3>${sc.emoji} ${sc.name}</h3>${actions}
    <button class="btn reset small" id="closeScene">返回地图</button>`;
  detail.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
    await doAct(b.dataset.act); renderSceneDetail();
  }));
  detail.querySelectorAll('[data-visit]').forEach(b => b.addEventListener('click', async () => {
    await doAct('visit', { scene: b.dataset.visit }); renderTown(); renderSceneDetail();
  }));
  detail.querySelectorAll('[data-goto]').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.goto)));
  $('closeScene').addEventListener('click', () => { openScene = null; detail.classList.add('hidden'); });
}

// —— 渲染：商城 ——
function renderShop() {
  const grid = $('shopGrid');
  grid.innerHTML = '';
  CATALOG.shop.forEach(it => {
    const cant = (state[it.cur] ?? 0) < it.price;
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.innerHTML = `<div class="sh-emoji">${it.icon}</div>
      <div class="sh-name">${it.name}</div>
      <div class="sh-desc">${it.desc}</div>
      <div class="sh-price">${it.cur === 'gold' ? '💰' : it.cur === 'diamond' ? '💎' : '🪙'} ${it.price}</div>
      <button class="btn small ${cant ? 'disabled' : ''}" data-buy="${it.id}" ${cant ? 'disabled' : ''}>购买</button>`;
    card.querySelector('[data-buy]').addEventListener('click', async () => { await doAct('buy', { itemId: it.id }); renderShop(); });
    grid.appendChild(card);
  });
  // 背包
  const inv = $('inventory');
  inv.innerHTML = '';
  const owned = Object.entries(state.inventory).filter(([, n]) => n > 0);
  if (owned.length === 0) { inv.innerHTML = '<p class="empty">背包空空，去商城逛逛吧～</p>'; return; }
  owned.forEach(([id, n]) => {
    const it = shopItem(id);
    if (!it) return;
    const equipped = state.equipped[it.type === 'clothing' ? 'clothing' : 'furniture'] === id;
    const el = document.createElement('div');
    el.className = 'inv-card';
    const btn = it.type === 'food'
      ? `<button class="btn small" data-use="${id}">使用</button>`
      : `<button class="btn small ${equipped ? 'reset' : 'feed'}" data-equip="${id}">${equipped ? '卸下' : '装备'}</button>`;
    el.innerHTML = `<span>${it.icon} ${it.name}</span><span class="cnt">x${n}</span>${btn}`;
    el.querySelector('[data-use]')?.addEventListener('click', async () => { await doAct('use', { itemId: id }); renderShop(); });
    el.querySelector('[data-equip]')?.addEventListener('click', async () => { await doAct('equip', { itemId: id }); renderShop(); });
    inv.appendChild(el);
  });
}

// —— 渲染：任务 / 成就 ——
function renderTasks() {
  const list = $('taskList');
  list.innerHTML = '';
  state.tasks.forEach(t => {
    const done = t.progress >= t.goal;
    const el = document.createElement('div');
    el.className = 'task-card' + (t.claimed ? ' claimed' : '');
    const reward = Object.entries(t.reward).map(([k, v]) => `${k === 'gold' ? '💰' : k === 'diamond' ? '💎' : '🪙'}${v}`).join(' ');
    el.innerHTML = `<div class="t-info"><div>${t.desc}</div><div class="t-prog">${t.progress}/${t.goal}</div></div>
      <div class="t-reward">${reward}</div>
      <button class="btn small ${t.claimed || !done ? 'disabled' : 'feed'}" data-claim="${t.id}" ${t.claimed || !done ? 'disabled' : ''}>${t.claimed ? '已领' : '领取'}</button>`;
    el.querySelector('[data-claim]')?.addEventListener('click', async () => { await doAct('claimTask', { taskId: t.id }); renderTasks(); });
    list.appendChild(el);
  });

  const ach = $('achList');
  ach.innerHTML = '';
  CATALOG.achievements.forEach(a => {
    const got = state.achievements.includes(a.id);
    const reward = Object.entries(a.reward).map(([k, v]) => `${k === 'gold' ? '💰' : k === 'diamond' ? '💎' : '🪙'}${v}`).join(' ');
    const el = document.createElement('div');
    el.className = 'ach-card' + (got ? ' got' : '');
    el.innerHTML = `<div class="a-icon">${got ? '🏆' : '🔒'}</div>
      <div class="a-info"><div class="a-name">${a.name}</div><div class="a-desc">${a.desc}</div></div>
      <div class="a-reward">${reward}</div>`;
    ach.appendChild(el);
  });
}

// —— 全局状态缓存（用于渲染场景/商城/任务里的引用）——
let state = null;

function renderAll(s) {
  state = s;
  const adopted = s.adopted;
  $('adoptScreen').classList.toggle('hidden', adopted);
  ['home', 'town', 'shop', 'tasks'].forEach(t => {
    $('view-' + t).classList.toggle('hidden', !(adopted && currentTab === t));
  });
  if (!adopted) { renderAdopt(); return; }
  renderHome(s);
  if (currentTab === 'town') renderTown();
  if (currentTab === 'shop') renderShop();
  if (currentTab === 'tasks') renderTasks();
}

function showBanner(msg) {
  const b = $('banner');
  b.textContent = msg;
  b.classList.remove('hidden');
  setTimeout(() => b.classList.add('hidden'), 4000);
}

async function doAct(action, extra = {}) {
  try {
    const data = await act(action, extra);
    renderAll(data.pet);
  } catch (e) {
    showBanner('⚠️ ' + e.message);
  }
}

// —— Tab 切换 ——
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderAll(state);
}

// —— 事件绑定 ——
$('tabbar').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (t) switchTab(t.dataset.tab);
});
$('btnAdopt').addEventListener('click', async () => {
  const sp = window.__selectedSpecies;
  if (!sp) { showBanner('请先选择一只宠物🐾'); return; }
  const name = $('adoptName').value.trim();
  try { const d = await act('adopt', { species: sp, name }); renderAll(d.pet); } catch (e) { showBanner('⚠️ ' + e.message); }
});
$('btnFeed').addEventListener('click', () => doAct('feed'));
$('btnPlay').addEventListener('click', () => doAct('play'));
$('btnBathe').addEventListener('click', () => doAct('bathe'));
$('btnSleep').addEventListener('click', () => doAct('sleep'));
$('btnHeal').addEventListener('click', () => doAct('heal'));
$('petName').addEventListener('change', (e) => doAct('rename', { name: e.target.value }));
$('btnReset').addEventListener('click', async () => {
  if (confirm('确定要放生并重领吗？当前进度会清空。')) await doAct('reset');
});

// —— 启动 ——
async function load() {
  try {
    const d = await fetchData();
    CATALOG = d.catalog || CATALOG;
    renderAll(d.pet);
  } catch (e) {
    showBanner('⚠️ 后端未连接：请运行 `node dev-server.js` 或部署到 Vercel 后访问。');
  }
}
load();
setInterval(load, 8000); // 定时回拉，让离线衰减在界面上自然体现

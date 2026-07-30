// app.js — 纯视图层：渲染 + 事件，所有数据来自后端 API
// 体验升级①：场景 PPT 式转场 + 宠物进场景动画 + 地点常驻导航
import { fetchData, act } from './lib/api.js';

const $ = (id) => document.getElementById(id);
let CATALOG = { species: [], scenes: [], shop: [], achievements: [] };
let state = null;
let currentLoc = 'home';
let tasksOpen = false;

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
// 不同物种进场景的动画：兔子跳，猫狗走
const petAnimClass = (s) => (s.species === 'rabbit' ? 'hop' : 'walk');

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
      window.__selectedSpecies = sp.key;
    });
    wrap.appendChild(card);
  });
}

// —— 渲染：钱包 ——
function renderWallet(s) {
  $('gold').textContent = s.gold;
  $('diamond').textContent = s.diamond;
  $('token').textContent = s.token;
  $('ulevel').textContent = s.level;
}

// —— 渲染：所有场景里的宠物精灵 ——
function renderPetSprite(s) {
  const clothing = s.equipped.clothing ? (shopItem(s.equipped.clothing)?.icon || '') : '';
  const txt = speciesEmoji(s) + clothing;
  document.querySelectorAll('[data-sprite]').forEach(el => el.textContent = txt);
}

// —— 渲染：家（养成照料）——
function renderHome(s) {
  const mood = moodOf(s);
  $('petMood').textContent = mood.text;
  $('petName').value = s.name;
  $('petLevel').textContent = petLevelOf(s);
  $('careCount').textContent = s.careCount;
  $('barSatiety').style.width = s.satiety + '%';
  $('barCleanliness').style.width = s.cleanliness + '%';
  $('barHappiness').style.width = s.happiness + '%';
  $('barHealth').style.width = s.health + '%';
  $('btnHeal').classList.toggle('urgent', s.sick);
  const furniture = s.equipped.furniture ? (shopItem(s.equipped.furniture)?.icon || '') : '';
  $('room').textContent = furniture ? `房间：${furniture}` : '';
}

// —— 渲染：医院 / 学校 / 公园 ——
function renderHospital(s) {
  $('hospStatus').textContent = s.sick
    ? `当前状态：🤒 生病中，健康度 ${s.health}`
    : `当前状态：❤️ 健康良好（${s.health}）`;
  $('hospHint').textContent = s.visitedScenes?.includes('hospital') ? '✅ 已到访过医院' : '';
}
function renderSchool(s) {
  $('schoolHint').textContent = s.visitedScenes?.includes('school') ? '✅ 已到访过学校' : '';
}
function renderPark(s) {
  $('parkHint').textContent = s.visitedScenes?.includes('park') ? '✅ 已到访过公园' : '';
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

// —— 渲染：任务 / 成就（面板）——
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

// —— 总渲染 ——
function renderAll(s) {
  state = s;
  const adopted = s.adopted;
  $('adoptScreen').classList.toggle('hidden', adopted);
  $('locationbar').classList.toggle('hidden', !adopted);
  $('stage').classList.toggle('hidden', !adopted);
  if (!adopted) { renderAdopt(); return; }
  renderWallet(s);
  renderPetSprite(s);
  renderCurrent();
  if (tasksOpen) renderTasks();
}

function renderCurrent() {
  if (currentLoc === 'home') renderHome(state);
  else if (currentLoc === 'hospital') renderHospital(state);
  else if (currentLoc === 'school') renderSchool(state);
  else if (currentLoc === 'park') renderPark(state);
  else if (currentLoc === 'shop') renderShop(state);
}

// —— 地点切换（PPT 式转场 + 宠物进场景）——
function switchLocation(loc) {
  if (loc === currentLoc) { renderCurrent(); return; }
  const oldEl = $('loc-' + currentLoc);
  const nextEl = $('loc-' + loc);
  const stage = $('stage');
  stage.classList.add('switching');
  oldEl.classList.add('leaving');
  setTimeout(() => {
    oldEl.classList.add('hidden');
    oldEl.classList.remove('leaving');
    nextEl.classList.remove('hidden');
    // 宠物随新场景"走进来"
    const spr = nextEl.querySelector('[data-sprite]');
    if (spr) {
      spr.classList.remove('enter', 'hop', 'walk');
      void spr.offsetWidth; // 强制重排以重启动画
      spr.classList.add('enter', petAnimClass(state));
    }
    stage.classList.remove('switching');
    currentLoc = loc;
    document.querySelectorAll('.loc').forEach(b => b.classList.toggle('active', b.dataset.loc === loc));
    renderCurrent();
  }, 220);
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

// —— 事件绑定 ——
$('locationbar').addEventListener('click', (e) => {
  const b = e.target.closest('.loc');
  if (b) switchLocation(b.dataset.loc);
});
$('btnTasks').addEventListener('click', () => {
  tasksOpen = !tasksOpen;
  $('taskPanel').classList.toggle('hidden', !tasksOpen);
  if (tasksOpen) renderTasks();
});
$('closeTasks').addEventListener('click', () => { tasksOpen = false; $('taskPanel').classList.add('hidden'); });

// 场景内的动作按钮（就医/上课/到访等）走事件委托
$('stage').addEventListener('click', (e) => {
  const actBtn = e.target.closest('[data-act]');
  if (actBtn) { doAct(actBtn.dataset.act); return; }
  const visBtn = e.target.closest('[data-visit]');
  if (visBtn) { doAct('visit', { scene: visBtn.dataset.visit }); return; }
});

$('btnAdopt').addEventListener('click', async () => {
  const sp = window.__selectedSpecies;
  if (!sp) { showBanner('请先选择一只宠物🐾'); return; }
  const name = $('adoptName').value.trim();
  try { const d = await act('adopt', { species: sp, name }); renderAll(d.pet); switchLocation('home'); } catch (e) { showBanner('⚠️ ' + e.message); }
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

// app.js — 纯视图层：渲染 + 事件，所有数据来自后端 API
// 体验升级①：场景 PPT 式转场 + 宠物进场景动画 + 地点常驻导航
import { fetchData, act } from './lib/api.js';

const $ = (id) => document.getElementById(id);
let CATALOG = { species: [], scenes: [], shop: [], achievements: [] };
let state = null;
let currentLoc = 'home';
let tasksOpen = false;
let gameActive = false;          // 小游戏进行中时，阻止自动刷新重渲染打断游戏
let gameTimers = [];             // 当前小游戏的所有定时器，退出时统一清理

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

// 照料动作 → 特效（宠物反应 + 漂浮表情）
const CARE_FX = {
  feed:  { emoji: '🍖', react: 'react-eat' },
  play:  { emoji: '🎾', react: 'react-bounce' },
  bathe: { emoji: '🫧', react: 'react-bubbles' },
  sleep: { emoji: '💤', react: 'react-sleep' },
  heal:  { emoji: '💊', react: 'react-heal' },
};
function playCareEffect(action) {
  const fx = CARE_FX[action];
  if (!fx) return;
  const spr = document.querySelector('#loc-' + currentLoc + ' [data-sprite]');
  if (!spr) return;
  spr.classList.remove(fx.react);
  void spr.offsetWidth; // 重启动画
  spr.classList.add(fx.react);
  setTimeout(() => spr.classList.remove(fx.react), 950);
  const f = document.createElement('div');
  f.className = 'fx-float';
  // 喂食漂浮的是宠物最爱的食物图标
  f.textContent = action === 'feed' && state?.favFood ? state.favFood.emoji : fx.emoji;
  spr.parentElement.appendChild(f);
  setTimeout(() => f.remove(), 1000);
}

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
  $('petFav').textContent = s.favFood ? `🍽️ 最爱：${s.favFood.emoji} ${s.favFood.name}` : '';
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

// —— 渲染：装扮间（换装 + 房间家具拖拽）——
function roomKey() { return 'mengpet_room_' + (localStorage.getItem('mengpet_id') || 'x'); }
function loadLayout() { try { return JSON.parse(localStorage.getItem(roomKey()) || '{}'); } catch { return {}; } }
function saveLayout(id, x, y) { const l = loadLayout(); l[id] = { x, y }; localStorage.setItem(roomKey(), JSON.stringify(l)); }

function renderDress(s) {
  const w = $('wardrobe');
  w.innerHTML = '';
  const items = Object.entries(s.inventory).filter(([, n]) => n > 0)
    .map(([id]) => shopItem(id)).filter(it => it && (it.type === 'clothing' || it.type === 'furniture'));
  if (items.length === 0) { w.innerHTML = '<p class="empty">还没有服饰/家具，去🛒商店逛逛吧～</p>'; }
  else {
    items.forEach(it => {
      const equipped = s.equipped[it.type === 'clothing' ? 'clothing' : 'furniture'] === it.id;
      const el = document.createElement('div');
      el.className = 'inv-card';
      el.innerHTML = `<span>${it.icon} ${it.name}</span><button class="btn small ${equipped ? 'reset' : 'feed'}" data-equip="${it.id}">${equipped ? '卸下' : '装备'}</button>`;
      el.querySelector('[data-equip]').addEventListener('click', async () => { await doAct('equip', { itemId: it.id }); renderDress(state); });
      w.appendChild(el);
    });
  }
  renderRoom(s);
}

function renderRoom(s) {
  const canvas = $('roomCanvas');
  canvas.innerHTML = '';
  const ownedFurn = Object.entries(s.inventory).filter(([id, n]) => n > 0 && shopItem(id)?.type === 'furniture').map(([id]) => id);
  if (ownedFurn.length === 0) { canvas.innerHTML = '<p class="empty">暂无家具，去商店买一个吧～</p>'; $('dressHint').textContent = ''; return; }
  const layout = loadLayout();
  ownedFurn.forEach(id => {
    const it = shopItem(id);
    const d = document.createElement('div');
    d.className = 'furniture-item';
    d.textContent = it.icon;
    d.dataset.id = id;
    const pos = layout[id] || { x: 16 + Math.random() * 120, y: 16 + Math.random() * 50 };
    d.style.left = pos.x + 'px';
    d.style.top = pos.y + 'px';
    makeDraggable(d, id);
    canvas.appendChild(d);
  });
  $('dressHint').textContent = '已装备的家具会出现在这里，按住拖动即可摆放';
}

function makeDraggable(el, id) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const canvas = el.parentElement;
    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX, startY = e.clientY;
    const ox = parseFloat(el.style.left) || 0, oy = parseFloat(el.style.top) || 0;
    const move = (ev) => {
      let nx = ox + (ev.clientX - startX), ny = oy + (ev.clientY - startY);
      nx = Math.max(0, Math.min(nx, rect.width - 36));
      ny = Math.max(0, Math.min(ny, rect.height - 36));
      el.style.left = nx + 'px'; el.style.top = ny + 'px';
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      saveLayout(id, parseFloat(el.style.left), parseFloat(el.style.top));
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
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
  else if (currentLoc === 'dress') renderDress(state);
  else if (currentLoc === 'game') renderGame(state);
}

// —— 渲染：小游戏 ——
function renderGame(s) {
  if (gameActive) return;           // 游戏中不被自动刷新打断
  $('gamePlay').innerHTML = '';
  $('gameCards').classList.remove('hidden');
  $('gameHint').textContent = '';
}

function clearGameTimers() {
  gameTimers.forEach(t => { try { clearInterval(t); } catch {} });
  gameTimers = [];
}
function quitGame() {
  clearGameTimers();
  gameActive = false;
  $('gamePlay').innerHTML = '';
  $('gameCards').classList.remove('hidden');
  $('gameHint').textContent = '';
}
async function endGame(game, score) {
  clearGameTimers();
  gameActive = false;
  const MAP = { fishing:{ n:'钓鱼', u:'金币' }, food:{ n:'接食物', u:'饱食' }, chase:{ n:'逗宠追逐', u:'心情' } };
  const g = MAP[game] || { n:'', u:'' };
  const reward = Math.round(score / 2);
  showBanner(`🎮 ${g.n}结束！得分 ${score}，获得 ${reward} ${g.u}`);
  $('gamePlay').innerHTML = '';
  $('gameCards').classList.remove('hidden');
  $('gameHint').textContent = '';
  await doAct('game', { game, score });
}

// 钓鱼：把握时机收杆，满分 100 → +50 金币
function startFishing() {
  gameActive = true;
  $('gameCards').classList.add('hidden');
  const play = $('gamePlay');
  play.innerHTML = `
    <div class="game-box">
      <div class="game-hint">鱼漂在滑动，在<b>绿色区域</b>点「收杆」得分最高！</div>
      <div class="fish-track"><div class="fish-sweet"></div><div class="fish-bob" id="fishBob">🐟</div></div>
      <div class="game-score">得分：<b id="fishScore">0</b></div>
      <div class="actions"><button class="btn play" id="fishReel">🎣 收杆</button><button class="btn reset" id="fishQuit">退出</button></div>
    </div>`;
  let pos = 0, dir = 1;
  const bob = $('fishBob');
  const tick = () => {
    pos += dir * 3.2;
    if (pos >= 100) { pos = 100; dir = -1; }
    if (pos <= 0) { pos = 0; dir = 1; }
    bob.style.left = `calc(${pos}% - 16px)`;
  };
  const t = setInterval(tick, 28);
  gameTimers.push(t);
  $('fishReel').addEventListener('click', () => {
    clearInterval(t); gameTimers = gameTimers.filter(x => x !== t);
    const score = Math.max(0, Math.min(100, Math.round(100 - Math.abs(pos - 50) * 2)));
    $('fishScore').textContent = score;
    endGame('fishing', score);
  });
  $('fishQuit').addEventListener('click', quitGame);
}

// 接食物：移动碗接住掉落食物，15 秒，每接 1 个 +10 分 → 满分 +50 饱食
function startCatch() {
  gameActive = true;
  $('gameCards').classList.add('hidden');
  const play = $('gamePlay');
  play.innerHTML = `
    <div class="game-box">
      <div class="game-hint">移动下方🥣接住掉落的食物！限时 15 秒</div>
      <div class="catch-field" id="catchField"><div class="catcher" id="catcher">🥣</div></div>
      <div class="game-score">接住：<b id="catchNum">0</b> · 剩余：<b id="catchTime">15</b>s</div>
      <button class="btn reset" id="catchQuit">退出</button>
    </div>`;
  const field = $('catchField');
  const catcher = $('catcher');
  const foods = ['🍖','🍎','🥕','🐟','🍗','🥩'];
  let catches = 0, time = 15;
  const move = (e) => {
    const r = field.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 100;
    x = Math.max(8, Math.min(92, x));
    catcher.style.left = `calc(${x}% - 18px)`;
  };
  field.addEventListener('pointermove', move);
  const spawnT = setInterval(() => {
    const f = document.createElement('div');
    f.className = 'falling-food';
    f.textContent = foods[Math.floor(Math.random() * foods.length)];
    f.style.left = (10 + Math.random() * 80) + '%';
    f.style.top = '0px';
    field.appendChild(f);
    let y = 0;
    const fall = setInterval(() => {
      y += 6; f.style.top = y + 'px';
      const fr = field.getBoundingClientRect(), fh = fr.height;
      const cr = catcher.getBoundingClientRect(), frr = f.getBoundingClientRect();
      if (frr.bottom >= cr.top - 6 && frr.bottom <= cr.bottom + 6 &&
          Math.abs((frr.left + frr.width / 2) - (cr.left + cr.width / 2)) < 26) {
        catches++; $('catchNum').textContent = catches;
        clearInterval(fall); f.remove();
      } else if (y > fh - 10) { clearInterval(fall); f.remove(); }
    }, 24);
    gameTimers.push(fall);
  }, 750);
  gameTimers.push(spawnT);
  const clock = setInterval(() => {
    time--; $('catchTime').textContent = time;
    if (time <= 0) { clearInterval(clock); endGame('food', Math.min(100, catches * 10)); }
  }, 1000);
  gameTimers.push(clock);
  $('catchQuit').addEventListener('click', quitGame);
}

// 逗宠追逐：点中乱跑萌宠，10 秒，每点 1 次 +10 分 → 满分 +50 心情
function startChase() {
  gameActive = true;
  $('gameCards').classList.add('hidden');
  const play = $('gamePlay');
  const emoji = speciesEmoji(state);
  play.innerHTML = `
    <div class="game-box">
      <div class="game-hint">点中乱跑的小萌宠！限时 10 秒</div>
      <div class="chase-field" id="chaseField"><div class="chase-pet" id="chasePet">${emoji}</div></div>
      <div class="game-score">得分：<b id="chaseNum">0</b> · 剩余：<b id="chaseTime">10</b>s</div>
      <button class="btn reset" id="chaseQuit">退出</button>
    </div>`;
  const field = $('chaseField');
  const pet = $('chasePet');
  let taps = 0, time = 10;
  const hop = () => {
    const r = field.getBoundingClientRect();
    pet.style.left = (Math.random() * (r.width - 44)) + 'px';
    pet.style.top = (Math.random() * (r.height - 44)) + 'px';
  };
  hop();
  const mover = setInterval(hop, 650);
  gameTimers.push(mover);
  pet.addEventListener('click', (e) => {
    e.stopPropagation();
    taps++; $('chaseNum').textContent = taps;
    pet.classList.remove('tap'); void pet.offsetWidth; pet.classList.add('tap');
    hop();
  });
  const clock = setInterval(() => {
    time--; $('chaseTime').textContent = time;
    if (time <= 0) { clearInterval(clock); endGame('chase', Math.min(100, taps * 10)); }
  }, 1000);
  gameTimers.push(clock);
  $('chaseQuit').addEventListener('click', quitGame);
}

function startGame(g) {
  if (g === 'fishing') startFishing();
  else if (g === 'food') startCatch();
  else if (g === 'chase') startChase();
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
  if (actBtn) {
    const a = actBtn.dataset.act;
    doAct(a).then(() => { if (CARE_FX[a]) playCareEffect(a); });
    return;
  }
  const visBtn = e.target.closest('[data-visit]');
  if (visBtn) { doAct('visit', { scene: visBtn.dataset.visit }); return; }
  const gameBtn = e.target.closest('[data-game]');
  if (gameBtn) { if (!gameActive) startGame(gameBtn.dataset.game); return; }
});

$('btnAdopt').addEventListener('click', async () => {
  const sp = window.__selectedSpecies;
  if (!sp) { showBanner('请先选择一只宠物🐾'); return; }
  const name = $('adoptName').value.trim();
  try { const d = await act('adopt', { species: sp, name }); renderAll(d.pet); switchLocation('home'); } catch (e) { showBanner('⚠️ ' + e.message); }
});
$('btnFeed').addEventListener('click', () => doAct('feed').then(() => playCareEffect('feed')));
$('btnPlay').addEventListener('click', () => doAct('play').then(() => playCareEffect('play')));
$('btnBathe').addEventListener('click', () => doAct('bathe').then(() => playCareEffect('bathe')));
$('btnSleep').addEventListener('click', () => doAct('sleep').then(() => playCareEffect('sleep')));
$('btnHeal').addEventListener('click', () => doAct('heal').then(() => playCareEffect('heal')));
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

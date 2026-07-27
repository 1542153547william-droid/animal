// app.js — 纯视图层：渲染 + 事件，所有数据来自后端 API
import { fetchPet, act } from './lib/api.js';

const $ = (id) => document.getElementById(id);

function moodOf(s) {
  const min = Math.min(s.satiety, s.happiness, s.energy);
  if (min < 25) return { emoji: '😿', text: '有点难受，照顾一下我吧…' };
  if (s.happiness > 70 && s.energy > 50) return { emoji: '😸', text: '超开心！' };
  if (s.satiety < 40) return { emoji: '🙀', text: '肚子有点饿…' };
  return { emoji: '🐱', text: '心情不错～' };
}

function levelOf(s) {
  return Math.floor(s.careCount / 5) + 1;
}

function render(s) {
  const mood = moodOf(s);
  $('petAvatar').textContent = mood.emoji;
  $('petMood').textContent = mood.text;
  $('petName').value = s.name;
  $('petLevel').textContent = levelOf(s);
  $('careCount').textContent = s.careCount;
  $('barSatiety').style.width = s.satiety + '%';
  $('barHappiness').style.width = s.happiness + '%';
  $('barEnergy').style.width = s.energy + '%';
}

function showBanner(msg) {
  const b = $('banner');
  b.textContent = msg;
  b.classList.remove('hidden');
}

async function load() {
  try {
    render(await fetchPet());
  } catch (e) {
    showBanner('⚠️ 后端未连接：请运行 `node dev-server.js` 或部署到 Vercel 后访问。');
  }
}

// 交互
$('btnFeed').addEventListener('click', async () => render(await act('feed')));
$('btnPlay').addEventListener('click', async () => render(await act('play')));
$('btnSleep').addEventListener('click', async () => render(await act('sleep')));

$('petName').addEventListener('change', async (e) => {
  render(await act('rename', { name: e.target.value }));
});

$('btnReset').addEventListener('click', async () => {
  if (confirm('确定要重置宠物吗？当前进度会清空。')) {
    render(await act('reset'));
  }
});

load();
// 每 5 秒拉一次，让离线时间流逝后状态自然下降
setInterval(load, 5000);

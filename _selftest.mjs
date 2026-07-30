// 接口自测：覆盖领养 / 四维养成 / 生病 / 经济 / 场景 / 商城 / 任务 / 成就
const BASE = 'http://localhost:3000/api/pet';
const PET = 'selftest_' + Math.random().toString(36).slice(2, 8);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅', name); }
  else { fail++; console.log('  ❌', name, extra); }
};

async function get() {
  const r = await fetch(`${BASE}?petId=${PET}`);
  return { status: r.status, json: await r.json() };
}
async function post(action, extra = {}) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petId: PET, action, ...extra }),
  });
  return { status: r.status, json: await r.json() };
}

// HTTP 状态码辅助
async function postStatus(action, extra = {}) {
  const r = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ petId: PET, action, ...extra }),
  });
  return r.status;
}

console.log('0) 初始 & catalog');
let g = await get();
check('GET 200', g.status === 200);
check('初始未领养', g.json.pet.adopted === false);
check('catalog 含 4 场景', g.json.catalog.scenes.length === 4, `(=${g.json.catalog.scenes.length})`);
check('catalog 含商城物品', g.json.catalog.shop.length >= 6);
check('catalog 含成就', g.json.catalog.achievements.length >= 3);

console.log('0.1) 未领养禁止互动');
let st = await postStatus('feed');
check('feed 返回 400 (未领养)', st === 400);

console.log('1) 领养');
let r = await post('adopt', { species: 'dog', name: '旺财' });
check('adopt 200', r.status === 200 && r.json.ok === true);
check('物种已设置', r.json.pet.species === 'dog');
check('名字已设置', r.json.pet.name === '旺财');
check('初始金币=50', r.json.pet.gold === 50);
check('领养触发成就 first_adopt', r.json.pet.achievements.includes('first_adopt'));

console.log('1.1) 重复领养被拒');
st = await postStatus('adopt', { species: 'cat', name: 'x' });
check('重复 adopt 返回 400', st === 400);

console.log('2) 四维互动');
r = await post('feed');
check('喂食 饱食+20', r.json.pet.satiety === 100, `(=${r.json.pet.satiety})`);
check('喂食 +金币', r.json.pet.gold === 51);
check('喂食 +经验', r.json.pet.xp === 5 && r.json.pet.level === 1);
r = await post('bathe');
check('洗澡 清洁+25', r.json.pet.cleanliness === 100);
r = await post('play');
check('玩耍 心情+15', r.json.pet.happiness >= 95, `(=${r.json.pet.happiness})`);
check('玩耍 饱食-5/清洁-3', r.json.pet.satiety === 95 && r.json.pet.cleanliness === 97);
r = await post('sleep');
check('睡觉 健康+15', r.json.pet.health >= 95, `(=${r.json.pet.health})`);

console.log('3) 任务进度');
r = await post('feed');
let ft = r.json.pet.tasks.find(t => t.id === 'feed3');
check('feed3 进度=2', ft.progress === 2, `(=${ft.progress})`);
r = await post('bathe');
let bt = r.json.pet.tasks.find(t => t.id === 'bathe1');
check('bathe1 进度=1', bt.progress === 1);

console.log('4) 场景');
r = await post('visit', { scene: 'park' });
check('公园到访记录', r.json.pet.visitedScenes.includes('park'));
check('公园 +5 金币 +8 经验', r.json.pet.gold >= 56 && r.json.pet.xp >= 33);
r = await post('visit', { scene: 'hospital' });
r = await post('visit', { scene: 'school' });
r = await post('visit', { scene: 'shop' });
check('四场景全到访', ['park','hospital','school','shop'].every(s => r.json.pet.visitedScenes.includes(s)));
check('成就 all_scenes 解锁', r.json.pet.achievements.includes('all_scenes'));

console.log('5) 商城购买 / 使用 / 装备');
let goldBefore = r.json.pet.gold;
r = await post('buy', { itemId: 'can' });
check('购买 营养罐头 成功', r.status === 200 && (r.json.pet.inventory.can === 1));
check('购买扣 10 金币', r.json.pet.gold === goldBefore - 10);
r = await post('use', { itemId: 'can' });
check('使用罐头 饱食提升', r.json.pet.satiety > 0 && r.json.pet.inventory.can === 0);

r = await post('buy', { itemId: 'bed' });
check('购买家具 猫窝', r.json.pet.inventory.bed === 1);
check('成就 first_furniture 解锁', r.json.pet.achievements.includes('first_furniture'));
r = await post('equip', { itemId: 'bed' });
check('装备家具', r.json.pet.equipped.furniture === 'bed');
r = await post('equip', { itemId: 'bed' });
check('再次装备=卸下', r.json.pet.equipped.furniture === null);

console.log('5.1) 余额不足');
// 钻石当前仅 5（first_adopt 成就发放），买 hat(30钻石) 应失败
st = await postStatus('buy', { itemId: 'hat' });
check('钻石不足买帽子 400', st === 400);

console.log('6) 任务领取奖励');
r = await post('feed'); r = await post('feed'); r = await post('feed');
let t = r.json.pet.tasks.find(x => x.id === 'feed3');
check('feed3 完成', t.progress >= t.goal && !t.claimed);
let gBefore = r.json.pet.gold;
r = await post('claimTask', { taskId: 'feed3' });
check('领取任务奖励', r.json.pet.tasks.find(x => x.id === 'feed3').claimed === true);
check('领取 +20 金币', r.json.pet.gold === gBefore + 20);

console.log('7) 错误参数');
st = await postStatus('adopt', { species: 'dragon' });
check('未知物种 400', st === 400);
st = await postStatus('fly');
check('未知 action 400', st === 400);
st = await postStatus('buy', { itemId: 'nope' });
check('未知商品 400', st === 400);

console.log('8) 跨请求持久（同一 petId）');
g = await get();
check('二次 GET 保留状态', g.json.pet.name === '旺财' && g.json.pet.adopted === true);

console.log('8.5) 口味偏好 + 小游戏');
// 重领一只兔子，便于验证随机口味
r = await post('reset');
r = await post('adopt', { species: 'rabbit', name: '草泥兔' });
check('领养生成最爱食物', !!(r.json.pet.favFood && r.json.pet.favFood.name), JSON.stringify(r.json.pet.favFood));
check('最爱加成 20~35', r.json.pet.favBonus >= 20 && r.json.pet.favBonus <= 35, `(=${r.json.pet.favBonus})`);
let g0 = r.json.pet.gold;
r = await post('game', { game: 'fishing', score: 100 });
check('钓鱼满分 +50 金币 +5 经验', r.json.pet.gold === g0 + 50 && r.json.pet.xp === 5, `(gold=${r.json.pet.gold}, xp=${r.json.pet.xp})`);
r = await post('game', { game: 'food', score: 100 });
check('接食物满分 +50 饱食(封顶100)', r.json.pet.satiety === 100, `(=${r.json.pet.satiety})`);
let hap0 = r.json.pet.happiness;
r = await post('game', { game: 'chase', score: 100 });
check('逗宠满分 +50 心情(封顶100)', r.json.pet.happiness === 100, `(=${r.json.pet.happiness})`);
check('三游戏记入 gamesPlayed', ['fishing', 'food', 'chase'].every(x => r.json.pet.gamesPlayed.includes(x)));
check('成就 game_master 解锁', r.json.pet.achievements.includes('game_master'));
let tg = r.json.pet.tasks.find(t => t.id === 'game1');
check('任务 game1 进度=1', !!tg && tg.progress === 1);
let st2 = await postStatus('game', { game: 'chess' });
check('未知游戏 400', st2 === 400);

console.log('9) 重置');
r = await post('reset');
check('重置后未领养', r.json.pet.adopted === false);
check('重置后金币归 50', r.json.pet.gold === 50);
check('重置后成就清空', r.json.pet.achievements.length === 0);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);

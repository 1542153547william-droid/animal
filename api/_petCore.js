// ============================================================
// api/_petCore.js  —  业务逻辑（前后端共用的核心，与框架无关）
// ------------------------------------------------------------
// 这里是“唯一真相源”：宠物状态、时间衰减、互动、经济、场景、任务、成就
// 全在这里算。Vercel 的 api/pet.js 和本地 dev-server.js 都调用本文件，
// 因此同一套逻辑在本地和云端表现完全一致。
// 本版本对齐 PRD §5：领养 / 日常养成(四维+医疗) / 小镇四场景 /
// 商城+货币 / 任务+成就+用户等级。
// ============================================================

import { store } from './_store.js';

// —— 物种目录（前端只读，从 catalog 获取）——
export const SPECIES = {
  cat:    { key:'cat',    name:'小猫',   emoji:'🐱', personality:'高冷傲娇', desc:'心情细腻、精力恢复慢、较独立',  decay:{ satiety:0.9, cleanliness:0.7, happiness:0.8, health:0.20 }, foods:[{name:'猫粮',emoji:'🥣'},{name:'小鱼干',emoji:'🐟'},{name:'三文鱼',emoji:'🍣'},{name:'鸡胸肉',emoji:'🍗'}] },
  dog:    { key:'dog',    name:'小狗',   emoji:'🐶', personality:'活泼忠诚', desc:'贪吃、饭量大消耗快、精力恢复快', decay:{ satiety:1.3, cleanliness:1.1, happiness:0.6, health:0.20 }, foods:[{name:'肉狗粮',emoji:'🦴'},{name:'排骨',emoji:'🍖'},{name:'鸡肉',emoji:'🍗'},{name:'牛肉',emoji:'🥩'}] },
  rabbit: { key:'rabbit', name:'小兔子', emoji:'🐰', personality:'胆小温柔', desc:'心情敏感易波动、需温柔陪伴',     decay:{ satiety:1.0, cleanliness:1.2, happiness:1.1, health:0.25 }, foods:[{name:'提摩西草',emoji:'🌿'},{name:'苜蓿草',emoji:'🌱'},{name:'蒲公英草',emoji:'🍃'},{name:'胡萝卜',emoji:'🥕'}] },
  pig:      { key:'pig',      name:'小猪',   emoji:'🐷', personality:'贪吃贪睡', desc:'饭量大掉毛快、性格憨厚好养',   decay:{ satiety:1.2, cleanliness:1.3, happiness:0.7, health:0.20 }, foods:[{name:'猪饲料',emoji:'🌾'},{name:'蔬菜',emoji:'🥬'},{name:'苹果',emoji:'🍎'},{name:'剩饭',emoji:'🍚'}] },
  guinea:   { key:'guinea',   name:'荷兰猪', emoji:'🐭', personality:'胆小爱叫', desc:'群居胆小、爱啃草、需补维C',   decay:{ satiety:1.1, cleanliness:1.0, happiness:1.0, health:0.25 }, foods:[{name:'提摩西草',emoji:'🌿'},{name:'苜蓿草',emoji:'🌱'},{name:'彩椒',emoji:'🫑'},{name:'VC片',emoji:'🟠'}] },
  hamster:  { key:'hamster',  name:'仓鼠',   emoji:'🐹', personality:'夜行囤粮', desc:'夜行小宠、爱囤粮、需安静环境', decay:{ satiety:0.8, cleanliness:0.6, happiness:0.9, health:0.20 }, foods:[{name:'仓鼠粮',emoji:'🌾'},{name:'葵花籽',emoji:'🌻'},{name:'面包虫',emoji:'🐛'},{name:'苹果粒',emoji:'🍎'}] },
  chinchilla:{ key:'chinchilla', name:'龙猫', emoji:'🐿️', personality:'毛厚怕热', desc:'毛厚蓬松、怕热需沙浴、胆小', decay:{ satiety:0.9, cleanliness:0.5, happiness:1.0, health:0.22 }, foods:[{name:'龙猫粮',emoji:'🌾'},{name:'提摩西草',emoji:'🌿'},{name:'苹果枝',emoji:'🍏'},{name:'葡萄干',emoji:'🍇'}] },
};

// —— 小镇四场景 ——
export const SCENES = {
  hospital: { key:'hospital', name:'医院', emoji:'🏥', desc:'看病就医，恢复健康' },
  school:   { key:'school',   name:'学校', emoji:'🏫', desc:'上课训练，增长经验' },
  park:     { key:'park',     name:'公园', emoji:'🌳', desc:'散步游玩，愉悦心情' },
  shop:     { key:'shop',     name:'商店', emoji:'🛒', desc:'采购道具与装扮' },
};

// —— 商城目录（道具 / 服饰 / 家具）——
export const SHOP = {
  can:     { id:'can',     name:'营养罐头', type:'food',      stat:'satiety',     amount:25, price:10, cur:'gold',    icon:'🥫', desc:'喂食立即 +25 饱食' },
  shampoo: { id:'shampoo', name:'沐浴露',   type:'food',      stat:'cleanliness', amount:25, price:10, cur:'gold',    icon:'🧴', desc:'洗澡立即 +25 清洁' },
  toy:     { id:'toy',     name:'逗趣玩具', type:'food',      stat:'happiness',   amount:25, price:12, cur:'gold',    icon:'🧸', desc:'玩耍立即 +25 心情' },
  medkit:  { id:'medkit',  name:'急救包',   type:'food',      stat:'heal',        amount:1,  price:20, cur:'gold',    icon:'💊', desc:'使用后治愈生病状态' },
  hat:     { id:'hat',     name:'小帽子',   type:'clothing',                    price:30, cur:'diamond', icon:'🎩', desc:'给宠物戴上可爱帽子' },
  scarf:   { id:'scarf',   name:'毛线围巾', type:'clothing',                    price:25, cur:'diamond', icon:'🧣', desc:'给宠物围上暖暖围巾' },
  bed:     { id:'bed',     name:'舒适猫窝', type:'furniture',                   price:40, cur:'gold',    icon:'🛏️', desc:'房间摆上舒适猫窝' },
  rug:     { id:'rug',     name:'温馨地毯', type:'furniture',                   price:35, cur:'gold',    icon:'🟫', desc:'房间铺上温馨地毯' },
};

// —— 每日任务定义 ——
const TASK_DEFS = [
  { id:'feed3',  desc:'喂食 3 次',   goal:3, type:'feed',  reward:{ gold:20 } },
  { id:'play2',  desc:'玩耍 2 次',   goal:2, type:'play',  reward:{ gold:15 } },
  { id:'bathe1', desc:'洗澡 1 次',   goal:1, type:'bathe', reward:{ gold:10 } },
  { id:'park1',  desc:'去公园 1 次', goal:1, type:'park',  reward:{ gold:15 } },
  { id:'game1',  desc:'玩一次小游戏', goal:1, type:'game',  reward:{ gold:10 } },
];

// —— 成就定义（check 在后端统一判定，奖励自动发放）——
export const ACHIEVEMENTS = [
  { id:'first_adopt',    name:'初心萌主',   desc:'完成初次领养',            reward:{ diamond:5 },  check:(s)=> !!s.adopted },
  { id:'all_scenes',     name:'小镇通勤',   desc:'访问全部四个场景',        reward:{ token:3 },    check:(s)=> ['hospital','school','park','shop'].every(x=>s.visitedScenes.includes(x)) },
  { id:'lv5',            name:'资深饲养员', desc:'用户等级达到 5 级',        reward:{ diamond:10 }, check:(s)=> s.level>=5 },
  { id:'first_furniture',name:'小窝布置',   desc:'拥有第一件家具',          reward:{ token:2 },    check:(s)=> s.equipped.furniture!=null || Object.keys(s.inventory).some(k=>SHOP[k]&&SHOP[k].type==='furniture') },
  { id:'rich',           name:'小富翁',     desc:'持有 100 金币',           reward:{ token:1 },    check:(s)=> s.gold>=100 },
  { id:'game_master',    name:'游戏达人',   desc:'体验全部三种小游戏',      reward:{ token:3 },    check:(s)=> ['fishing','food','chase'].every(x=>(s.gamesPlayed||[]).includes(x)) },
];

// —— 工具函数 ——
const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`; };
const levelFromXp = (xp) => Math.floor(xp/50)+1;
const genTasks = () => TASK_DEFS.map(t=>({ id:t.id, desc:t.desc, goal:t.goal, type:t.type, progress:0, reward:t.reward, claimed:false }));

function fresh(petId) {
  return {
    petId,
    adopted: false,
    species: null,
    name: '小宠',
    // 四维养成
    satiety: 80, cleanliness: 80, happiness: 80, health: 80,
    sick: false,
    careCount: 0,
    // 经济
    gold: 50, diamond: 0, token: 0,
    inventory: {},                      // itemId -> count
    equipped: { clothing: null, furniture: null },
    // 口味偏好（领养时随机生成，体现每只宠物的独一无二）
    favFood: null,                      // { name, emoji }
    favBonus: 20,                       // 喂最爱食物时的额外饱食加成
    // 用户等级
    xp: 0, level: 1,
    // 场景 & 任务
    visitedScenes: [],
    gamesPlayed: [],                   // 玩过的小游戏 id 集合
    taskDate: todayStr(),
    tasks: genTasks(),
    achievements: [],
    born: Date.now(),
    lastUpdate: Date.now(),
  };
}

// —— 经济 / 任务 / 成就 辅助 ——
function earn(s, amt) { s.gold += amt; }
function gainXp(s, amt) { s.xp += amt; s.level = levelFromXp(s.xp); }
function bumpTask(s, type) {
  for (const t of s.tasks) {
    if (t.type === type && t.progress < t.goal && !t.claimed) t.progress += 1;
  }
}
function applyReward(s, reward) {
  if (!reward) return;
  if (reward.gold) s.gold += reward.gold;
  if (reward.diamond) s.diamond += reward.diamond;
  if (reward.token) s.token += reward.token;
}
function checkAchievements(s) {
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.check(s)) {
      s.achievements.push(a.id);
      applyReward(s, a.reward);
    }
  }
}

// —— 时间衰减 + 健康联动 + 生病兜底 ——
export function decay(s) {
  const minutes = (Date.now() - s.lastUpdate) / 60000;
  if (minutes <= 0) return s;
  const sp = (s.species && SPECIES[s.species]) ? SPECIES[s.species].decay
                                             : { satiety:1, cleanliness:1, happiness:1, health:0.25 };
  s.satiety    = clamp(s.satiety    - sp.satiety    * minutes);
  s.cleanliness= clamp(s.cleanliness - sp.cleanliness* minutes);
  s.happiness  = clamp(s.happiness  - sp.happiness  * minutes);

  if (!s.sick) {
    const low = [s.satiety, s.cleanliness, s.happiness].filter(v => v < 25).length;
    s.health = clamp(s.health - sp.health * minutes - low * 0.5 * minutes);
    if (s.health < 30) s.sick = true;            // 触发生病（PRD 兜底：只生病不死亡）
  } else {
    s.health = clamp(s.health - sp.health * 0.5 * minutes);
  }
  // 状态良好时缓慢自愈
  if (s.satiety > 30 && s.cleanliness > 30 && s.happiness > 30 && s.health > 90 && !s.sick) {
    s.health = clamp(s.health + 0.2 * minutes);
  }
  s.lastUpdate = Date.now();
  return s;
}

export async function handlePet({ method, query = {}, body = {} }) {
  const petId = String(query.petId || body.petId || 'default').slice(0, 64);
  const action = String(body.action || '');

  if (method === 'GET') {
    let s = await store.get(petId);
    if (!s) { s = fresh(petId); await store.save(petId, s); }
    return {
      status: 200,
      json: {
        ok: true,
        pet: decay({ ...s }),
        catalog: {
          species: Object.values(SPECIES),
          scenes: Object.values(SCENES),
          shop: Object.values(SHOP),
          achievements: ACHIEVEMENTS.map(a => ({ id:a.id, name:a.name, desc:a.desc, reward:a.reward })),
        },
      },
    };
  }

  if (method === 'POST') {
    let s = (await store.get(petId)) || fresh(petId);
    s = decay(s);

    // 每日任务跨天重置
    if (s.taskDate !== todayStr()) { s.taskDate = todayStr(); s.tasks = genTasks(); }

    // —— 领养 ——
    if (action === 'adopt') {
      if (s.adopted) return { status:400, json:{ ok:false, error:'already adopted' } };
      const sp = SPECIES[String(body.species)];
      if (!sp) return { status:400, json:{ ok:false, error:'unknown species' } };
      s = fresh(petId);                 // 保留 petId，重置状态
      s.adopted = true;
      s.species = sp.key;
      s.name = String(body.name || '').trim().slice(0, 12) || '小宠';
      // 随机生成这只宠物独一无二的饮食偏好
      const foods = SPECIES[sp.key].foods;
      s.favFood = foods[Math.floor(Math.random() * foods.length)];
      s.favBonus = 20 + Math.floor(Math.random() * 16); // 20~35
    } else if (!s.adopted) {
      return { status:400, json:{ ok:false, error:'not adopted' } };
    }
    // —— 日常互动 ——
    else if (action === 'feed')  { s.satiety=clamp(s.satiety+(s.favBonus||20)); s.happiness=clamp(s.happiness+5); s.careCount++; gainXp(s,5); earn(s,1); bumpTask(s,'feed'); }
    else if (action === 'play')  { s.happiness=clamp(s.happiness+15); s.satiety=clamp(s.satiety-5); s.cleanliness=clamp(s.cleanliness-3); s.careCount++; gainXp(s,5); earn(s,1); bumpTask(s,'play'); }
    else if (action === 'bathe') { s.cleanliness=clamp(s.cleanliness+25); s.careCount++; gainXp(s,5); earn(s,1); bumpTask(s,'bathe'); }
    else if (action === 'sleep') { s.health=clamp(s.health+15); s.satiety=clamp(s.satiety-3); s.careCount++; gainXp(s,5); earn(s,1); }
    else if (action === 'heal')  { if (s.sick){ s.sick=false; s.health=clamp(s.health+30); } else { s.health=clamp(s.health+10); } s.careCount++; gainXp(s,3); }
    else if (action === 'rename'){ s.name = String(body.name || '').trim().slice(0, 12) || '小宠'; }
    else if (action === 'reset') { s = fresh(petId); }
    // —— 小游戏（奖励走后端，保持唯一真相源）——
    else if (action === 'game') {
      const GM = { fishing:'fishing', food:'food', chase:'chase' };
      const g = GM[String(body.game)];
      if (!g) return { status:400, json:{ ok:false, error:'unknown game' } };
      const score = Math.max(0, Math.min(100, Math.round(Number(body.score) || 0)));
      if (g === 'fishing')      { earn(s, Math.round(score/2)); gainXp(s,5); }                                   // 金币
      else if (g === 'food')    { s.satiety = clamp(s.satiety + Math.round(score/2)); gainXp(s,3); }             // 饱食
      else if (g === 'chase')   { s.happiness = clamp(s.happiness + Math.round(score/2)); gainXp(s,5); }         // 心情
      s.gamesPlayed = s.gamesPlayed || [];
      if (!s.gamesPlayed.includes(g)) s.gamesPlayed.push(g);
      bumpTask(s, 'game');
    }
    // —— 小镇场景 ——
    else if (action === 'visit') {
      const sc = String(body.scene);
      if (!SCENES[sc]) return { status:400, json:{ ok:false, error:'unknown scene' } };
      if (!s.visitedScenes.includes(sc)) s.visitedScenes.push(sc);
      if (sc === 'park')     { s.happiness=clamp(s.happiness+10); gainXp(s,8); earn(s,5); bumpTask(s,'park'); }
      else if (sc === 'school') { s.happiness=clamp(s.happiness+5); s.health=clamp(s.health+3); gainXp(s,15); earn(s,2); }
      else if (sc === 'hospital') { /* 就医在 heal 中处理 */ }
      else if (sc === 'shop') { /* 购物在 buy 中处理 */ }
    }
    else if (action === 'school') { s.happiness=clamp(s.happiness+5); s.health=clamp(s.health+3); gainXp(s,15); earn(s,2); }
    // —— 商城 ——
    else if (action === 'buy') {
      const item = SHOP[String(body.itemId)];
      if (!item) return { status:400, json:{ ok:false, error:'unknown item' } };
      if ((s[item.cur] ?? 0) < item.price) return { status:400, json:{ ok:false, error:'not enough ' + item.cur } };
      s[item.cur] -= item.price;
      s.inventory[item.id] = (s.inventory[item.id] || 0) + 1;
    }
    else if (action === 'use') {
      const item = SHOP[String(body.itemId)];
      if (!item || item.type !== 'food') return { status:400, json:{ ok:false, error:'not usable' } };
      if ((s.inventory[item.id] || 0) < 1) return { status:400, json:{ ok:false, error:'none left' } };
      s.inventory[item.id] -= 1;
      if (item.stat === 'heal') { if (s.sick) s.sick = false; s.health = clamp(s.health + 40); }
      else { s[item.stat] = clamp(s[item.stat] + (item.amount || 0)); }
    }
    else if (action === 'equip') {
      const item = SHOP[String(body.itemId)];
      if (!item || (item.type !== 'clothing' && item.type !== 'furniture')) return { status:400, json:{ ok:false, error:'not equippable' } };
      if ((s.inventory[item.id] || 0) < 1) return { status:400, json:{ ok:false, error:'not owned' } };
      const slot = item.type === 'clothing' ? 'clothing' : 'furniture';
      s.equipped[slot] = s.equipped[slot] === item.id ? null : item.id;
    }
    else if (action === 'claimTask') {
      const t = s.tasks.find(t => t.id === String(body.taskId));
      if (!t) return { status:400, json:{ ok:false, error:'unknown task' } };
      if (t.claimed) return { status:400, json:{ ok:false, error:'already claimed' } };
      if (t.progress < t.goal) return { status:400, json:{ ok:false, error:'not done' } };
      t.claimed = true;
      applyReward(s, t.reward);
    }
    else {
      return { status:400, json:{ ok:false, error:'unknown action' } };
    }

    checkAchievements(s);
    s.lastUpdate = Date.now();
    await store.save(petId, s);
    return { status:200, json:{ ok:true, pet:s } };
  }

  return { status:405, json:{ ok:false, error:'Method Not Allowed' } };
}

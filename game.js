'use strict';
/* «Оазис» — roguelite-колода с выкладкой клеток. Прототип для GamesUp42.
   Ваниль JS, без сборки. Прогресс хранится в localStorage. */

const SIZE = 7;
const HAND = 5;
const ENERGY = 3;
const $ = (s) => document.querySelector(s);

// ---------- случайные числа с зерном ----------
let rng = mulberry32(Date.now() & 0xffffffff);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const ri = (n) => Math.floor(rng() * n);
const pickOne = (a) => a[ri(a.length)];
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// ---------- клетки ----------
const TILES = {
  spring: { name: 'Родник', source: 4, fixed: true, desc: 'Сердце оазиса. Даёт 4 воды в свою сеть каналов.' },
  well: { name: 'Колодец', source: 3, desc: 'Источник: 3 воды в сеть каналов.' },
  pump: { name: 'Ветряной насос', source: 5, desc: 'Мощный источник: 5 воды в сеть каналов.' },
  fountain: { name: 'Фонтан', source: 2, aura: 1, desc: 'Источник на 2 воды. Растения вокруг (8 клеток) дают +1 жизни в день.' },
  canal: { name: 'Канал', conduct: true, desc: 'Проводит воду от источника. Растения рядом пьют из этой сети.' },
  grass: { name: 'Злаки', plant: true, need: 1, max: 2, yield: [0, 1, 2], desc: 'Быстрые и неприхотливые. Пьют 1 воду.' },
  palm: { name: 'Финиковая пальма', plant: true, need: 2, max: 3, yield: [0, 0, 2, 4], shadeAt: 3, windbreakAt: 3, desc: 'Пьёт 2 воды. Взрослая даёт 4 жизни, тень вокруг и защищает от бури.' },
  saxaul: { name: 'Саксаул', plant: true, need: 0, max: 2, yield: [0, 0, 1], windbreakAt: 1, saltOk: true, desc: 'Растёт без воды, даже на солончаке. Со 2-го дня держит бурю.' },
  pomegranate: { name: 'Гранат', plant: true, need: 2, max: 3, yield: [0, 1, 3, 6], needsShade: true, desc: 'Пьёт 2 воды и растёт только в тени. Взрослый — 6 жизни в день.' },
  melon: { name: 'Бахча', plant: true, need: 1, max: 2, yield: [0, 0, 0], harvest: 6, desc: 'Пьёт 1 воду. Созрев, отдаёт урожай: +6 жизни разом, и клетка освобождается.' },
  wall: { name: 'Каменная стена', windbreak: true, desc: 'Ветролом: буря дальше по этой линии не проходит.' },
  awning: { name: 'Навес', shade: true, desc: 'Даёт тень 8 клеткам вокруг: жара их не сушит, гранат может расти.' },
  rock: { name: 'Скала', obstacle: true, windbreak: true, desc: 'Камень. Здесь ничего не построить, но ветер он держит.' },
};

// ---------- карты ----------
const CARDS = {
  canal: { cost: 1, kind: 'tile', tile: 'canal', rarity: 0 },
  grass: { cost: 1, kind: 'tile', tile: 'grass', rarity: 0 },
  saxaul: { cost: 1, kind: 'tile', tile: 'saxaul', rarity: 0 },
  wall: { cost: 1, kind: 'tile', tile: 'wall', rarity: 0 },
  well: { cost: 2, kind: 'tile', tile: 'well', rarity: 1 },
  palm: { cost: 2, kind: 'tile', tile: 'palm', rarity: 1 },
  melon: { cost: 1, kind: 'tile', tile: 'melon', rarity: 1 },
  awning: { cost: 1, kind: 'tile', tile: 'awning', rarity: 1 },
  pomegranate: { cost: 3, kind: 'tile', tile: 'pomegranate', rarity: 2, unlock: 6 },
  pump: { cost: 3, kind: 'tile', tile: 'pump', rarity: 2, unlock: 14 },
  fountain: { cost: 3, kind: 'tile', tile: 'fountain', rarity: 2, unlock: 22 },
  compost: { cost: 1, kind: 'action', target: 'plant', name: 'Компост', desc: 'Растение сразу вырастает на 1 стадию.', rarity: 0 },
  bucket: { cost: 0, kind: 'action', target: 'plant', name: 'Ведро воды', desc: 'Растение будет полито этой ночью без сети. Карта сгорает после оазиса… нет, просто стоит 0.', rarity: 0 },
  seeds: { cost: 1, kind: 'action', name: 'Мешок семян', desc: 'Возьмите 2 карты.', rarity: 0 },
  rain: { cost: 2, kind: 'action', name: 'Ливень', desc: 'Этой ночью все растения политы, даже без сети.', rarity: 2, unlock: 3 },
  clear: { cost: 0, kind: 'action', target: 'removable', name: 'Расчистка', desc: 'Уберите свою постройку или растение с клетки.', rarity: 1 },
  caravan: { cost: 0, kind: 'action', name: 'Караван', desc: '+2 силы на этот день. Карта уходит из колоды до конца оазиса.', rarity: 2, unlock: 10, exhaust: true },
};
CARDS.bucket.desc = 'Растение будет полито этой ночью, даже без сети.';
function cardName(id) { const c = CARDS[id]; return c.kind === 'tile' ? TILES[c.tile].name : c.name; }
function cardDesc(id) { const c = CARDS[id]; return c.kind === 'tile' ? TILES[c.tile].desc : c.desc; }

// ---------- реликвии ----------
const RELICS = {
  jug: { name: 'Медный кувшин', desc: 'Все источники дают +1 воду.' },
  windmap: { name: 'Карта ветров', desc: 'Виден прогноз на весь оазис. Буря засыпает только крайний ряд.' },
  bag: { name: 'Большая сума', desc: 'В руке на 1 карту больше.' },
  pit: { name: 'Финиковая косточка', desc: 'Пальмы и гранаты сажаются сразу на 1-й стадии.' },
  filter: { name: 'Солевой фильтр', desc: 'Любые растения можно сажать на солончак.' },
  silk: { name: 'Шёлковый полог', desc: 'Жара больше не сушит растения.' },
  hourglass: { name: 'Песочные часы', desc: '+2 дня в каждом оазисе.' },
  shovel: { name: 'Крепкая лопата', desc: 'Первый канал за день бесплатный.' },
  rope: { name: 'Пальмовая верёвка', desc: 'Взрослые пальмы дают +2 жизни.' },
  lantern: { name: 'Масляный фонарь', desc: '+1 сила каждый день.' },
};

// ---------- регионы ----------
const REGIONS = [
  { name: 'Тихие барханы', intro: 'Песок здесь мягкий, бури редкие. Учимся вести воду.', spring: 4, rocks: 2, salt: 0, heat: 0, storms: 1, depth: 2,
    levels: [{ n: 'Сухое русло', t: 16, d: 7 }, { n: 'Три пальмы', t: 30, d: 8 }, { n: 'Старый караван-сарай', t: 44, d: 8 }, { n: 'Ветреная седловина', t: 58, d: 9 }, { n: 'Большая буря', t: 76, d: 10, boss: true }] },
  { name: 'Солончаки', intro: 'Белая корка соли: растёт только саксаул. Днём бывает жара — растения без тени пьют больше.', spring: 4, rocks: 2, salt: 10, heat: 2, storms: 2, depth: 2,
    levels: [{ n: 'Белая чаша', t: 54, d: 8 }, { n: 'Соляной брод', t: 68, d: 9 }, { n: 'Мираж', t: 82, d: 9 }, { n: 'Высохшее озеро', t: 96, d: 10 }, { n: 'Зной', t: 120, d: 10, boss: true, extraHeat: 2 }] },
  { name: 'Каменное плато', intro: 'Скалы и слабый родник. Бури сильнее: засыпают три ряда.', spring: 3, rocks: 8, salt: 3, heat: 2, storms: 3, depth: 3,
    levels: [{ n: 'Каменные ворота', t: 80, d: 9 }, { n: 'Ущелье ветров', t: 96, d: 10 }, { n: 'Плоская гора', t: 114, d: 10 }, { n: 'Край плато', t: 132, d: 11 }, { n: 'Последний колодец', t: 165, d: 12, boss: true, extraStorm: 2 }] },
];
const START_DECK = ['canal', 'canal', 'canal', 'grass', 'grass', 'grass', 'palm', 'saxaul', 'wall', 'well', 'compost'];

// ---------- состояние ----------
let meta = loadMeta();
let run = null;   // поход: колода, реликвии, номер уровня
let L = null;     // текущий оазис
let ui = { sel: null, hover: null, msg: '' };

function loadMeta() {
  try { return Object.assign({ drops: 0, best: 0, runs: 0, wins: 0, seenHelp: false }, JSON.parse(localStorage.getItem('oasis_meta') || '{}')); }
  catch (e) { return { drops: 0, best: 0, runs: 0, wins: 0, seenHelp: false }; }
}
function saveMeta() { localStorage.setItem('oasis_meta', JSON.stringify(meta)); }
function saveRun() { if (run) localStorage.setItem('oasis_run', JSON.stringify({ run, L })); else localStorage.removeItem('oasis_run'); }
function loadRun() { try { const s = JSON.parse(localStorage.getItem('oasis_run') || 'null'); return s && s.run ? s : null; } catch (e) { return null; } }
const has = (r) => run && run.relics.includes(r);
const unlocked = (id) => !CARDS[id].unlock || meta.drops >= CARDS[id].unlock;

// ---------- поход ----------
function newRun() {
  meta.runs++; saveMeta();
  run = { deck: START_DECK.slice(), relics: [], level: 0, seed: Date.now() & 0xffffff, lifeTotal: 0 };
  showMap();
}
function levelInfo(idx) { const r = REGIONS[Math.floor(idx / 5)]; return { region: r, lv: r.levels[idx % 5], ri: Math.floor(idx / 5) }; }

function startLevel() {
  const { region, lv } = levelInfo(run.level);
  rng = mulberry32(run.seed + run.level * 977);
  const grid = [];
  for (let y = 0; y < SIZE; y++) { grid.push([]); for (let x = 0; x < SIZE; x++) grid[y].push({ g: 'sand', t: null }); }
  const c = Math.floor(SIZE / 2);
  grid[c][c].t = { id: 'spring', stage: 0 };
  const free = () => { for (let k = 0; k < 200; k++) { const x = ri(SIZE), y = ri(SIZE); if (Math.abs(x - c) + Math.abs(y - c) > 1 && !grid[y][x].t && grid[y][x].g === 'sand') return [x, y]; } return null; };
  for (let i = 0; i < region.rocks; i++) { const p = free(); if (p) grid[p[1]][p[0]].t = { id: 'rock', stage: 0 }; }
  // соль кляксами
  let saltLeft = region.salt;
  while (saltLeft > 0) {
    const p = free(); if (!p) break; let [x, y] = p;
    for (let k = 0; k < 4 && saltLeft > 0; k++) {
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE && grid[y][x].g === 'sand' && !(Math.abs(x - c) + Math.abs(y - c) <= 1)) { grid[y][x].g = 'salt'; saltLeft--; }
      const d = pickOne([[1, 0], [-1, 0], [0, 1], [0, -1]]); x += d[0]; y += d[1];
    }
  }
  const days = lv.d + (has('hourglass') ? 2 : 0);
  // прогноз
  const fc = Array.from({ length: days + 1 }, () => ({}));
  const nStorm = region.storms + (lv.boss ? 1 : 0) + (lv.extraStorm || 0) + Math.floor((run.level % 5) / 2);
  const dirs = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < nStorm; i++) { const d = 2 + ri(days - 1); fc[d].storm = pickOne(dirs); }
  if (lv.boss && run.level === 4) { fc[days - 2].storm = 'W'; fc[days - 1].storm = 'E'; }
  const nHeat = region.heat + (lv.extraHeat || 0) + (run.level % 5 >= 2 ? 1 : 0);
  for (let i = 0; i < nHeat; i++) { const d = 1 + ri(days); if (!fc[d].storm) fc[d].heat = true; }
  const draw = shuffle(run.deck.slice());
  if (run.level === 0) { for (const want of ['grass', 'grass', 'canal']) { const k = draw.indexOf(want); if (k >= 0) { draw.splice(k, 1); draw.push(want); } } }
  L = { grid, day: 1, days, fc, life: 0, target: lv.t, energy: 0, draw, hand: [], discard: [], exhausted: [], log: [], rain: false, freeCanal: false, won: false, uid: 1 };
  startDay();
  saveRun();
  showGame();
}

function startDay() {
  L.energy = ENERGY + (has('lantern') ? 1 : 0);
  L.rain = false; L.freeCanal = has('shovel');
  const n = HAND + (has('bag') ? 1 : 0);
  drawCards(n);
}
function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (!L.draw.length) { if (!L.discard.length) break; L.draw = shuffle(L.discard); L.discard = []; }
    L.hand.push(L.draw.pop());
  }
}

// ---------- геометрия ----------
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const inB = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
function cell(x, y) { return inB(x, y) ? L.grid[y][x] : null; }
function each(fn) { for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) fn(L.grid[y][x], x, y); }
function isShaded(x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue; const c = cell(x + dx, y + dy); if (!c || !c.t) continue;
    const T = TILES[c.t.id]; if (T.shade || (T.shadeAt && c.t.stage >= T.shadeAt)) return true;
  }
  return false;
}
function auraBonus(x, y) {
  let b = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const c = cell(x + dx, y + dy); if (c && c.t && TILES[c.t.id].aura) b += TILES[c.t.id].aura; }
  return b;
}
function isWindbreak(t) { if (!t) return false; const T = TILES[t.id]; return !!(T.windbreak || (T.windbreakAt !== undefined && t.stage >= T.windbreakAt)); }
function heatToday() { return !!(L.fc[L.day] && L.fc[L.day].heat) && !has('silk'); }

// ---------- вода ----------
function computeWater() {
  const comp = Array.from({ length: SIZE }, () => Array(SIZE).fill(-1));
  const cap = [];
  let k = 0;
  each((c, x, y) => {
    if (!c.t || comp[y][x] >= 0) return; const T = TILES[c.t.id]; if (!T.source && !T.conduct) return;
    let sum = 0; const q = [[x, y]]; comp[y][x] = k;
    while (q.length) {
      const [cx, cy] = q.pop(); const t = L.grid[cy][cx].t; const TT = TILES[t.id];
      if (TT.source) sum += TT.source + (has('jug') ? 1 : 0);
      for (const [dx, dy] of N4) { const nx = cx + dx, ny = cy + dy, n = cell(nx, ny); if (!n || !n.t || comp[ny][nx] >= 0) continue; const NT = TILES[n.t.id]; if (NT.source || NT.conduct) { comp[ny][nx] = k; q.push([nx, ny]); } }
    }
    cap.push(sum); k++;
  });
  const left = cap.slice();
  const plants = [];
  each((c, x, y) => { if (c.t && TILES[c.t.id].plant) plants.push({ c, x, y }); });
  plants.sort((a, b) => (b.c.t.stage - a.c.t.stage) || (a.c.t.uid - b.c.t.uid));
  const watered = new Map(); const needs = new Map();
  for (const p of plants) {
    const T = TILES[p.c.t.id];
    let need = T.need; if (need > 0 && heatToday() && !isShaded(p.x, p.y)) need += 1;
    needs.set(p.c.t, need);
    if (need === 0 || L.rain || p.c.t.bucket) { watered.set(p.c.t, true); continue; }
    const adj = new Set();
    for (const [dx, dy] of N4) { const nx = p.x + dx, ny = p.y + dy; if (inB(nx, ny) && comp[ny][nx] >= 0) adj.add(comp[ny][nx]); }
    let best = -1; for (const a of adj) if (left[a] >= need && (best < 0 || left[a] > left[best])) best = a;
    if (best >= 0) { left[best] -= need; watered.set(p.c.t, true); } else watered.set(p.c.t, false);
  }
  return { comp, cap, left, watered, needs };
}

// ---------- ход ----------
function canPlace(cardId, x, y) {
  const C = CARDS[cardId]; const c = cell(x, y); if (!c) return false;
  if (C.kind === 'tile') {
    if (c.t) return false; const T = TILES[C.tile];
    if (c.g === 'salt' && T.plant && !T.saltOk && !has('filter')) return false;
    return true;
  }
  if (C.target === 'plant') return !!(c.t && TILES[c.t.id].plant);
  if (C.target === 'removable') return !!(c.t && !TILES[c.t.id].fixed && !TILES[c.t.id].obstacle);
  return false;
}
function cardCost(id) { if (id === 'canal' && L.freeCanal) return 0; return CARDS[id].cost; }

function playCard(hi, x, y) {
  const id = L.hand[hi]; const C = CARDS[id]; const cost = cardCost(id);
  if (cost > L.energy) return;
  if (C.kind === 'tile') {
    if (!canPlace(id, x, y)) return;
    const st = (has('pit') && (C.tile === 'palm' || C.tile === 'pomegranate')) ? 1 : 0;
    L.grid[y][x].t = { id: C.tile, stage: st, uid: L.uid++ };
    if (id === 'canal' && L.freeCanal) L.freeCanal = false;
    fx(x, y, 'place');
  } else if (C.target) {
    if (!canPlace(id, x, y)) return;
    const t = L.grid[y][x].t;
    if (id === 'compost') { const T = TILES[t.id]; t.stage = Math.min(T.max, t.stage + 1); fx(x, y, 'grow'); }
    if (id === 'bucket') { t.bucket = true; fx(x, y, 'water'); }
    if (id === 'clear') { L.grid[y][x].t = null; fx(x, y, 'place'); }
  } else {
    if (id === 'seeds') { L.hand.splice(hi, 1); L.discard.push(id); L.energy -= cost; drawCards(2); ui.sel = null; render(); return; }
    if (id === 'rain') L.rain = true;
    if (id === 'caravan') L.energy += 2;
  }
  L.energy -= cost;
  L.hand.splice(hi, 1);
  if (C.exhaust) L.exhausted.push(id); else L.discard.push(id);
  ui.sel = null;
  checkEarlyWin();
  render();
}

function endDay() {
  const W = computeWater();
  const log = []; let gain = 0; const pops = [];
  // рост
  each((c, x, y) => {
    if (!c.t || !TILES[c.t.id].plant) return;
    const T = TILES[c.t.id]; const t = c.t;
    if (W.watered.get(t)) {
      if (T.needsShade && !isShaded(x, y)) { /* ждёт тени */ }
      else t.stage = Math.min(T.max, t.stage + 1);
    } else {
      t.stage -= 1;
      if (t.stage < 0) { c.t = null; log.push(`${T.name} засохли`); pops.push([x, y, '✕', 'bad']); }
      else pops.push([x, y, 'жажда', 'bad']);
    }
    if (c.t) delete c.t.bucket;
  });
  // урожай
  each((c, x, y) => {
    if (!c.t || !TILES[c.t.id].plant) return;
    const T = TILES[c.t.id]; let g = T.yield[c.t.stage] || 0;
    if (g > 0) g += auraBonus(x, y);
    if (c.t.id === 'palm' && c.t.stage >= 3 && has('rope')) g += 2;
    if (T.harvest && c.t.stage >= T.max) { g += T.harvest + auraBonus(x, y); c.t = null; log.push('Бахча дала урожай'); }
    if (g > 0) { gain += g; pops.push([x, y, '+' + g, 'good']); }
  });
  L.life += gain;
  // буря
  const f = L.fc[L.day];
  if (f && f.storm) {
    const depth = has('windmap') ? 1 : levelInfo(run.level).region.depth;
    let hit = 0;
    for (let i = 0; i < SIZE; i++) {
      for (let s = 0; s < depth; s++) {
        let x, y;
        if (f.storm === 'N') { x = i; y = s; } else if (f.storm === 'S') { x = i; y = SIZE - 1 - s; }
        else if (f.storm === 'W') { x = s; y = i; } else { x = SIZE - 1 - s; y = i; }
        const c = L.grid[y][x];
        if (isWindbreak(c.t)) break;
        if (c.t) {
          const T = TILES[c.t.id];
          if (T.plant) { c.t.stage -= 1; if (c.t.stage < 0) c.t = null; hit++; pops.push([x, y, 'песок', 'bad']); }
          else if (T.conduct) { c.t = null; hit++; pops.push([x, y, 'песок', 'bad']); }
        }
      }
    }
    log.push(`Буря ${dirName(f.storm)}: засыпано клеток — ${hit}`);
  }
  L.log = [`День ${L.day}: +${gain} жизни`].concat(log);
  showPops(pops);
  // сброс руки
  L.discard.push(...L.hand); L.hand = [];
  L.day++;
  if (L.life >= L.target && !L.won) L.won = true;
  if (L.day > L.days) { finishLevel(L.life >= L.target); return; }
  startDay();
  saveRun();
  render();
}
function dirName(d) { return { N: 'с севера', S: 'с юга', W: 'с запада', E: 'с востока' }[d]; }
function checkEarlyWin() { if (L.life >= L.target) L.won = true; }

function finishLevel(win) {
  const lvIdx = run.level;
  if (win) {
    const spare = Math.max(0, L.days - L.day + 1);
    run.lifeTotal += L.life;
    meta.drops += 1 + Math.floor(spare / 2); meta.best = Math.max(meta.best, lvIdx + 1); saveMeta();
    run.level++;
    if (run.level >= 15) { meta.wins++; saveMeta(); run = null; saveRun(); showEnd(true); return; }
    showReward(lvIdx, spare);
  } else {
    meta.drops += Math.floor(lvIdx / 2); meta.best = Math.max(meta.best, lvIdx); saveMeta();
    const r = run; run = null; saveRun(); showEnd(false, r, lvIdx);
  }
}

// ---------- награды ----------
function rewardCards() {
  const pool = Object.keys(CARDS).filter(unlocked);
  const out = [];
  let guard = 0;
  while (out.length < 3 && guard++ < 100) {
    const roll = rng(); const want = roll < 0.55 ? 0 : roll < 0.88 ? 1 : 2;
    const opts = pool.filter((id) => CARDS[id].rarity === want && !out.includes(id));
    if (opts.length) out.push(pickOne(opts));
  }
  return out;
}
function rewardRelics() { return shuffle(Object.keys(RELICS).filter((r) => !run.relics.includes(r))).slice(0, 2); }

// ---------- отрисовка: SVG ----------
function svg(inner) { return `<svg viewBox="0 0 100 100" aria-hidden="true">${inner}</svg>`; }
function tileArt(t, x, y) {
  const s = t.stage;
  switch (t.id) {
    case 'spring': return svg(`<circle cx="50" cy="50" r="40" fill="#b9a27a"/><circle cx="50" cy="50" r="33" fill="#2f9fb0"/><circle cx="50" cy="50" r="24" fill="none" stroke="#8fe0ea" stroke-width="2.5" class="ripple"/><circle cx="50" cy="50" r="12" fill="none" stroke="#bff1f5" stroke-width="2" class="ripple r2"/>` + stones(40));
    case 'well': return svg(`<circle cx="50" cy="50" r="34" fill="#9c8f7c"/><circle cx="50" cy="50" r="22" fill="#21667a"/><circle cx="46" cy="46" r="6" fill="#5fb7c8" opacity=".6"/><rect x="14" y="46" width="72" height="8" rx="3" fill="#7a5533"/><rect x="45" y="40" width="10" height="20" rx="2" fill="#5c3d22"/>` + stones(34));
    case 'pump': return svg(`<circle cx="50" cy="56" r="20" fill="#21667a"/><path d="M50 50 L30 18 L40 14 Z M50 50 L82 30 L86 40 Z M50 50 L70 82 L60 86 Z M50 50 L18 70 L14 60 Z" fill="#e9dcc3" stroke="#7a5533" stroke-width="2" class="spin"/><circle cx="50" cy="50" r="6" fill="#7a5533"/>`);
    case 'fountain': return svg(`<path d="M50 10 L78 22 L90 50 L78 78 L50 90 L22 78 L10 50 L22 22Z" fill="#e7dcc6" stroke="#b9a27a" stroke-width="3"/><path d="M50 22 L70 30 L78 50 L70 70 L50 78 L30 70 L22 50 L30 30Z" fill="#3ea9ba"/><circle cx="50" cy="50" r="7" fill="#e7dcc6"/><circle cx="50" cy="50" r="15" fill="none" stroke="#bff1f5" stroke-width="2" class="ripple"/>`);
    case 'canal': {
      let p = '';
      const link = N4.map(([dx, dy]) => { const n = cell(x + dx, y + dy); return n && n.t && (TILES[n.t.id].conduct || TILES[n.t.id].source); });
      const seg = ['M50 50 L50 0', 'M50 50 L100 50', 'M50 50 L50 100', 'M50 50 L0 50'];
      const any = link.some(Boolean);
      link.forEach((l, i) => { if (l || !any) p += seg[i] + ' '; });
      return svg(`<path d="${p}" stroke="#b9a27a" stroke-width="30" stroke-linecap="round" fill="none"/><path d="${p}" stroke="#3aa3b5" stroke-width="18" stroke-linecap="round" fill="none"/><path d="${p}" stroke="#8fe0ea" stroke-width="3" stroke-dasharray="6 10" fill="none" class="flow"/>`);
    }
    case 'grass': { let g = ''; const n = [2, 4, 7][s]; const pts = [[30, 35], [65, 30], [45, 60], [72, 66], [25, 70], [55, 82], [80, 45]]; for (let i = 0; i < n; i++) g += tuft(pts[i][0], pts[i][1], 0.7 + s * 0.25); return svg(g); }
    case 'palm': {
      const r = [10, 20, 30, 40][s];
      let f = `<circle cx="50" cy="50" r="${r + 6}" fill="#000" opacity=".12"/>`;
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const ex = 50 + Math.cos(a) * r, ey = 50 + Math.sin(a) * r; const mx = 50 + Math.cos(a + 0.35) * r * 0.6, my = 50 + Math.sin(a + 0.35) * r * 0.6; f += `<path d="M50 50 Q${mx} ${my} ${ex} ${ey} Q${50 + Math.cos(a - 0.25) * r * 0.55} ${50 + Math.sin(a - 0.25) * r * 0.55} 50 50" fill="${i % 2 ? '#3f8f3a' : '#56a84a'}"/>`; }
      if (s >= 2) for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.4; f += `<circle cx="${50 + Math.cos(a) * 7}" cy="${50 + Math.sin(a) * 7}" r="3.4" fill="#a8641c"/>`; }
      f += `<circle cx="50" cy="50" r="5" fill="#7a5533"/>`;
      return svg(f);
    }
    case 'saxaul': { const r = [10, 18, 26][s]; let f = ''; for (let i = 0; i < 9; i++) { const a = i * 0.7; f += `<path d="M50 50 Q${50 + Math.cos(a + 1) * r * 0.5} ${50 + Math.sin(a + 1) * r * 0.5} ${50 + Math.cos(a) * r} ${50 + Math.sin(a) * r}" stroke="#7d6a46" stroke-width="2.4" fill="none"/>`; f += `<circle cx="${50 + Math.cos(a) * r}" cy="${50 + Math.sin(a) * r}" r="${3 + s}" fill="#8fa35a"/>`; } return svg(f); }
    case 'pomegranate': {
      const r = [9, 18, 27, 34][s];
      let f = `<circle cx="52" cy="53" r="${r + 3}" fill="#000" opacity=".13"/><circle cx="50" cy="50" r="${r}" fill="#3d7d3f"/><circle cx="44" cy="44" r="${r * 0.6}" fill="#4f9550"/>`;
      if (s >= 2) { const n = s === 2 ? 3 : 6; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + 0.3; f += `<circle cx="${50 + Math.cos(a) * r * 0.62}" cy="${50 + Math.sin(a) * r * 0.62}" r="5" fill="#c8323a"/><circle cx="${49 + Math.cos(a) * r * 0.62}" cy="${48 + Math.sin(a) * r * 0.62}" r="1.6" fill="#f2a1a5"/>`; } }
      return svg(f);
    }
    case 'melon': { let f = `<path d="M12 70 Q30 52 48 64 T88 50" stroke="#4e8a3a" stroke-width="4" fill="none"/><path d="M18 34 Q36 46 54 34 T86 30" stroke="#5e9a46" stroke-width="3" fill="none"/>`; [[24, 58], [56, 40], [80, 62], [36, 30]].forEach(([lx, ly]) => { f += `<path d="M${lx} ${ly} l7 -9 l7 9 l-7 6 Z" fill="#5f9c45"/>`; }); const ms = s >= 2 ? [[40, 62, 15], [68, 34, 12]] : s >= 1 ? [[42, 60, 10]] : []; ms.forEach(([mx, my, mr]) => { f += `<circle cx="${mx}" cy="${my}" r="${mr}" fill="#e3c45a" stroke="#b49330" stroke-width="2"/><path d="M${mx - mr * 0.6} ${my - mr * 0.5} Q${mx} ${my + mr * 0.2} ${mx + mr * 0.6} ${my - mr * 0.5} M${mx - mr * 0.75} ${my + mr * 0.1} Q${mx} ${my + mr * 0.8} ${mx + mr * 0.75} ${my + mr * 0.1}" stroke="#c9a640" stroke-width="2" fill="none"/>`; }); return svg(f); }
    case 'wall': return svg(`<rect x="6" y="34" width="88" height="32" rx="6" fill="#8b7d68"/><rect x="10" y="36" width="24" height="13" rx="3" fill="#a89780"/><rect x="38" y="36" width="24" height="13" rx="3" fill="#9d8c75"/><rect x="66" y="36" width="24" height="13" rx="3" fill="#a89780"/><rect x="22" y="51" width="24" height="13" rx="3" fill="#9d8c75"/><rect x="50" y="51" width="26" height="13" rx="3" fill="#a89780"/>`);
    case 'awning': return svg(`<rect x="12" y="12" width="76" height="76" rx="4" fill="#000" opacity=".12"/><rect x="8" y="8" width="76" height="76" rx="4" fill="#e9e0cf"/><path d="M8 20 H84 M8 36 H84 M8 52 H84 M8 68 H84" stroke="#c7653f" stroke-width="7"/><circle cx="10" cy="10" r="4" fill="#5c3d22"/><circle cx="82" cy="10" r="4" fill="#5c3d22"/><circle cx="10" cy="82" r="4" fill="#5c3d22"/><circle cx="82" cy="82" r="4" fill="#5c3d22"/>`);
    case 'rock': return svg(`<path d="M18 70 L26 34 L48 20 L74 28 L86 58 L70 82 L34 84Z" fill="#7c7466"/><path d="M26 34 L48 20 L60 40 L40 52Z" fill="#958c7c"/><path d="M60 40 L74 28 L86 58 L66 60Z" fill="#6a6356"/>`);
  }
  return '';
}
function stones(r) { let s = ''; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; s += `<circle cx="${50 + Math.cos(a) * r}" cy="${50 + Math.sin(a) * r}" r="5" fill="#a49274" stroke="#7d6c50"/>`; } return s; }
function tuft(x, y, k) { return `<g transform="translate(${x} ${y}) scale(${k})"><path d="M0 8 Q-6 -6 -10 -12 M0 8 Q0 -8 2 -16 M0 8 Q6 -4 11 -10" stroke="#5e9a38" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="2" cy="-16" r="2.4" fill="#c9b04a"/></g>`; }

function cardArt(id) {
  const C = CARDS[id];
  if (C.kind === 'tile') return tileArt({ id: C.tile, stage: TILES[C.tile].plant ? TILES[C.tile].max : 0 }, -9, -9);
  const icons = {
    compost: `<path d="M20 70 Q50 40 80 70 Z" fill="#6b4a2b"/><path d="M50 58 Q44 40 36 34 M50 58 Q56 38 66 32" stroke="#5e9a38" stroke-width="4" fill="none"/>`,
    bucket: `<path d="M28 34 H72 L66 84 H34 Z" fill="#8a6a45"/><ellipse cx="50" cy="34" rx="22" ry="6" fill="#3aa3b5"/><path d="M28 34 Q50 4 72 34" stroke="#5c3d22" stroke-width="3" fill="none"/>`,
    seeds: `<path d="M30 40 Q50 20 70 40 L74 80 H26 Z" fill="#c7a46a"/><path d="M40 30 Q50 22 60 30" stroke="#7a5533" stroke-width="4" fill="none"/><circle cx="44" cy="58" r="3" fill="#7a5533"/><circle cx="56" cy="64" r="3" fill="#7a5533"/><circle cx="50" cy="52" r="3" fill="#7a5533"/>`,
    rain: `<path d="M24 46 Q24 26 46 28 Q54 14 70 24 Q86 26 82 44 Z" fill="#a9c3cf"/><path d="M34 56 l-4 12 M50 56 l-4 12 M66 56 l-4 12 M42 74 l-4 12 M58 74 l-4 12" stroke="#3aa3b5" stroke-width="4" stroke-linecap="round"/>`,
    clear: `<path d="M30 80 L62 30" stroke="#7a5533" stroke-width="6"/><path d="M56 24 L78 20 L74 42 Z" fill="#9aa1a6"/><path d="M20 84 Q40 70 64 84" stroke="#c9a96e" stroke-width="5" fill="none"/>`,
    caravan: `<path d="M14 70 H86" stroke="#b9a27a" stroke-width="4"/><rect x="20" y="44" width="26" height="20" rx="3" fill="#c7653f"/><rect x="54" y="44" width="26" height="20" rx="3" fill="#d9a441"/><path d="M33 44 V34 M67 44 V34" stroke="#5c3d22" stroke-width="3"/><circle cx="26" cy="68" r="4" fill="#5c3d22"/><circle cx="74" cy="68" r="4" fill="#5c3d22"/>`,
  };
  return svg(icons[id] || '');
}
function relicArt(id) {
  const ic = {
    jug: `<path d="M38 22 H62 L60 32 Q80 44 72 70 Q66 86 50 86 Q34 86 28 70 Q20 44 40 32Z" fill="#c4783d"/><path d="M38 22 H62" stroke="#8a4d22" stroke-width="5"/>`,
    windmap: `<rect x="18" y="22" width="64" height="56" rx="4" fill="#e9dcc3"/><path d="M28 40 Q44 30 60 40 T80 36 M24 56 Q40 46 56 56 T76 52" stroke="#3aa3b5" stroke-width="3" fill="none"/>`,
    bag: `<path d="M26 40 Q50 24 74 40 L78 84 H22Z" fill="#a8743f"/><path d="M38 34 Q50 14 62 34" stroke="#6b4a2b" stroke-width="4" fill="none"/>`,
    pit: `<ellipse cx="50" cy="52" rx="16" ry="26" fill="#8a5a2a"/><path d="M50 30 V74" stroke="#5c3d22" stroke-width="3"/>`,
    filter: `<path d="M24 26 H76 L56 56 V80 L44 74 V56Z" fill="#d7d2c6" stroke="#8b7d68" stroke-width="3"/>`,
    silk: `<path d="M14 30 Q50 10 86 30 V40 Q50 22 14 40Z" fill="#d9a441"/><path d="M14 40 Q50 22 86 40 V50 Q50 32 14 50Z" fill="#c7653f"/>`,
    hourglass: `<path d="M30 18 H70 M30 82 H70" stroke="#7a5533" stroke-width="6"/><path d="M34 22 Q34 46 50 50 Q66 46 66 22Z M34 78 Q34 54 50 50 Q66 54 66 78Z" fill="#e9dcc3" stroke="#7a5533" stroke-width="2"/><path d="M42 74 Q50 62 58 74Z" fill="#d9b26a"/>`,
    shovel: `<path d="M50 14 V58" stroke="#7a5533" stroke-width="6"/><path d="M36 56 H64 L58 84 Q50 90 42 84Z" fill="#9aa1a6"/>`,
    rope: `<path d="M20 30 Q50 50 80 30 M20 50 Q50 70 80 50 M20 70 Q50 90 80 70" stroke="#b08a4e" stroke-width="6" fill="none"/>`,
    lantern: `<rect x="36" y="30" width="28" height="40" rx="6" fill="#f1c75b"/><path d="M40 30 V22 H60 V30 M36 70 H64" stroke="#5c3d22" stroke-width="4"/><circle cx="50" cy="50" r="8" fill="#fff4c4"/>`,
  };
  return svg(ic[id] || '');
}

// ---------- экраны ----------
const app = () => $('#app');
function showTitle() {
  const saved = loadRun();
  const unl = Object.keys(CARDS).filter((k) => CARDS[k].unlock).map((k) => `<li class="${unlocked(k) ? 'on' : ''}">${cardName(k)} — ${unlocked(k) ? 'открыто' : 'нужно ' + CARDS[k].unlock + ' капель'}</li>`).join('');
  app().innerHTML = `
  <section class="title">
    <div class="logo">${tileArt({ id: 'palm', stage: 3 }, 0, 0)}</div>
    <h1>Оазис</h1>
    <p class="tag">Ведите воду, сажайте сад, переживите бурю.<br>Roguelite-колода с выкладкой клеток.</p>
    <div class="btns">
      ${saved ? '<button class="big" id="cont">Продолжить поход</button>' : ''}
      <button class="big ${saved ? 'ghost' : ''}" id="new">Новый поход</button>
      <button class="ghost" id="help">Как играть</button>
    </div>
    <div class="metabox">
      <div><b>${meta.drops}</b> капель памяти · лучший результат: ${meta.best}/15 оазисов · побед: ${meta.wins}</div>
      <ul>${unl}</ul>
      <p class="hint">Капли даются за каждый оживлённый оазис и открывают новые карты для наград.</p>
    </div>
  </section>`;
  $('#new').onclick = () => { if (!meta.seenHelp) { meta.seenHelp = true; saveMeta(); showHelp(true); } else newRun(); };
  $('#help').onclick = () => showHelp(false);
  if (saved) $('#cont').onclick = () => { run = saved.run; L = saved.L; if (L) showGame(); else showMap(); };
}

function showHelp(thenStart) {
  app().innerHTML = `
  <section class="panel help">
    <h2>Как играть</h2>
    <ol>
      <li><b>Цель оазиса</b> — набрать нужное количество <span class="life">жизни</span> до последнего дня.</li>
      <li>Каждый день у вас <b>3 силы</b> и 5 карт. Карта-постройка ставится на пустую клетку, карта-действие — на растение или сразу.</li>
      <li><b>Вода.</b> Родник, колодцы и насосы — источники. Каналы соединяют их в сеть. Растение рядом (по стороне) с любой клеткой сети пьёт из неё. Синяя капля на растении — оно будет полито этой ночью, красная — не хватит воды.</li>
      <li><b>Ночь.</b> Политые растения растут на 1 стадию и дают жизнь. Неполитые теряют стадию и могут засохнуть.</li>
      <li><b>Прогноз</b> сверху: ☀ жара — растения без тени пьют на 1 больше; ⇶ буря — засыпает крайние ряды с указанной стороны. Стена, скала, саксаул и взрослая пальма останавливают бурю по своей линии.</li>
      <li>За оживлённый оазис выбирайте новую карту в колоду, иногда — реликвию. 3 региона по 5 оазисов. Поход заканчивается при первой неудаче.</li>
    </ol>
    <p class="hint">Совет: сначала протяните 1–2 канала от родника, посадите злаки — они быстро дают жизнь. Пальмы медленные, но потом кормят и защищают.</p>
    <button class="big" id="ok">${thenStart ? 'В путь' : 'Назад'}</button>
  </section>`;
  $('#ok').onclick = () => thenStart ? newRun() : showTitle();
}

function showMap() {
  const rows = REGIONS.map((r, i) => {
    const nodes = r.levels.map((lv, j) => {
      const idx = i * 5 + j; const st = idx < run.level ? 'done' : idx === run.level ? 'cur' : 'todo';
      return `<div class="node ${st} ${lv.boss ? 'boss' : ''}" title="${lv.n}: цель ${lv.t}, дней ${lv.d}"><span>${idx < run.level ? '✓' : lv.boss ? '★' : idx + 1}</span><small>${lv.n}</small></div>`;
    }).join('<div class="link"></div>');
    return `<div class="region ${Math.floor(run.level / 5) === i ? 'active' : ''}"><h3>${r.name}</h3><p>${r.intro}</p><div class="path">${nodes}</div></div>`;
  }).join('');
  const { lv } = levelInfo(run.level);
  app().innerHTML = `
  <section class="panel map">
    <h2>Карта похода</h2>
    ${rows}
    <div class="mapfoot">
      <div>Колода: ${run.deck.length} карт · Реликвии: ${run.relics.length ? run.relics.map((r) => RELICS[r].name).join(', ') : 'нет'}</div>
      <button class="big" id="go">Оазис «${lv.n}» →</button>
      <button class="ghost" id="deck">Колода</button>
      <button class="ghost" id="menu">В меню</button>
    </div>
  </section>`;
  $('#go').onclick = startLevel;
  $('#deck').onclick = () => showDeck(showMap);
  $('#menu').onclick = () => { saveRun(); showTitle(); };
  L = null; saveRun();
}

function showDeck(back) {
  const counts = {}; run.deck.forEach((d) => counts[d] = (counts[d] || 0) + 1);
  app().innerHTML = `<section class="panel"><h2>Колода (${run.deck.length})</h2><div class="cards wrap">${Object.keys(counts).map((id) => cardHTML(id, -1, '×' + counts[id])).join('')}</div><button class="big" id="b">Назад</button></section>`;
  $('#b').onclick = back;
}

function cardHTML(id, hi, extra) {
  const C = CARDS[id]; const cost = L && hi >= 0 ? cardCost(id) : C.cost;
  const dis = L && hi >= 0 && cost > L.energy ? 'dis' : '';
  const sel = ui.sel === hi && hi >= 0 ? 'sel' : '';
  return `<div class="card r${C.rarity} ${dis} ${sel}" data-hi="${hi}" data-id="${id}"><div class="cost">${cost}</div><div class="art">${cardArt(id)}</div><div class="nm">${cardName(id)}</div><div class="ds">${cardDesc(id)}</div>${extra ? `<div class="cnt">${extra}</div>` : ''}</div>`;
}

function showGame() {
  app().innerHTML = `
  <section class="game">
    <header class="top">
      <div class="lvl"><small id="rg"></small><b id="ln"></b></div>
      <div class="life"><div class="bar"><i id="lb"></i></div><span id="lt"></span></div>
      <div class="day" id="dy"></div>
      <div class="fc" id="fc"></div>
      <button class="ghost sm" id="mn" title="Сохранить и выйти">Меню</button>
    </header>
    <div class="mid">
      <aside class="side">
        <div class="energy" id="en"></div>
        <div class="piles" id="pl"></div>
        <div class="relics" id="rl"></div>
        <div class="log" id="lg"></div>
      </aside>
      <div class="boardwrap"><div class="board" id="bd"></div><div class="stormarrows" id="sa"></div></div>
      <aside class="side info" id="inf"></aside>
    </div>
    <footer class="bottom">
      <div class="cards" id="hd"></div>
      <button class="end big" id="ed">Завершить день ⏎</button>
    </footer>
  </section>`;
  $('#ed').onclick = () => { if (!L.won || L.day <= L.days) endDay(); };
  $('#mn').onclick = () => { saveRun(); showTitle(); };
  render();
}

function render() {
  if (!L) return;
  const { region, lv } = levelInfo(run.level);
  $('#rg').textContent = `${region.name} · оазис ${run.level % 5 + 1}/5`;
  $('#ln').textContent = lv.n + (lv.boss ? ' ★' : '');
  $('#lb').style.width = Math.min(100, L.life / L.target * 100) + '%';
  $('#lt').innerHTML = `<b>${L.life}</b> / ${L.target} жизни`;
  $('#dy').innerHTML = `День <b>${Math.min(L.day, L.days)}</b> из ${L.days}`;
  // прогноз
  const span = has('windmap') ? L.days : Math.min(L.days, L.day + 2);
  let fc = '';
  for (let d = L.day; d <= span; d++) { const f = L.fc[d] || {}; fc += `<div class="fd ${d === L.day ? 'now' : ''}" title="${f.storm ? 'Буря ' + dirName(f.storm) : f.heat ? 'Жара' : 'Тихо'}"><small>${d === L.day ? 'сегодня' : 'д.' + d}</small>${f.storm ? '<b class="st">⇶' + { N: '↓', S: '↑', W: '→', E: '←' }[f.storm] + '</b>' : f.heat ? '<b class="ht">☀</b>' : '<b>·</b>'}</div>`; }
  $('#fc').innerHTML = fc;
  $('#en').innerHTML = `<span class="lbl">Сила</span>` + Array.from({ length: Math.max(L.energy, 0) }, () => '<i class="pip"></i>').join('') + (L.energy === 0 ? '<span class="zero">0</span>' : '') + (L.rain ? '<span class="tagw">ливень ночью</span>' : '') + (L.freeCanal ? '<span class="tagw">канал бесплатно</span>' : '');
  $('#pl').innerHTML = `<div>Колода: <b>${L.draw.length}</b></div><div>Сброс: <b>${L.discard.length}</b></div>`;
  $('#rl').innerHTML = run.relics.map((r) => `<div class="relic" title="${RELICS[r].name}: ${RELICS[r].desc}">${relicArt(r)}</div>`).join('');
  $('#lg').innerHTML = L.log.map((l) => `<div>${l}</div>`).join('');
  // поле
  const W = computeWater();
  const f = L.fc[L.day] || {};
  const depth = has('windmap') ? 1 : region.depth;
  let h = '';
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const c = L.grid[y][x]; const t = c.t;
    let cls = 'cell ' + c.g;
    let over = '';
    if (t) {
      const T = TILES[t.id];
      if (T.plant) {
        const w = W.watered.get(t); const need = W.needs.get(t);
        if (need > 0) over += `<span class="drop ${w ? 'ok' : 'no'}" title="${w ? 'будет полито' : 'не хватит воды'}">${need}</span>`;
        if (T.needsShade && !isShaded(x, y)) over += '<span class="noshade" title="нужна тень">☀</span>';
        over += `<span class="pips">${'●'.repeat(t.stage)}${'○'.repeat(T.max - t.stage)}</span>`;
      }
      if (T.source) { const k = W.comp[y][x]; over += `<span class="cap" title="свободно воды в сети">${W.left[k]}/${W.cap[k]}</span>`; }
    }
    if (isShaded(x, y)) cls += ' shade';
    if (f.storm) { const inRow = (f.storm === 'N' && y < depth) || (f.storm === 'S' && y >= SIZE - depth) || (f.storm === 'W' && x < depth) || (f.storm === 'E' && x >= SIZE - depth); if (inRow) cls += ' stormzone'; }
    if (ui.sel !== null && ui.sel >= 0) { const id = L.hand[ui.sel]; if (CARDS[id].kind === 'tile' || CARDS[id].target) cls += canPlace(id, x, y) ? ' can' : ' cant'; }
    h += `<div class="${cls}" data-x="${x}" data-y="${y}">${t ? `<div class="tile t-${t.id}">${tileArt(t, x, y)}</div>` : ''}${over}</div>`;
  }
  $('#bd').innerHTML = h;
  const coach = coachText();
  const old = document.querySelector('.coach'); if (old) old.remove();
  if (coach) { const cdiv = document.createElement('div'); cdiv.className = 'coach'; cdiv.innerHTML = coach; $('#bd').parentElement.appendChild(cdiv); }
  $('#sa').innerHTML = f.storm ? `<div class="sarrow ${f.storm}">буря ${dirName(f.storm)} этой ночью</div>` : (heatToday() ? '<div class="sarrow heat">жара: растения без тени пьют +1</div>' : '');
  // рука
  $('#hd').innerHTML = L.hand.map((id, i) => cardHTML(id, i)).join('');
  const ed = $('#ed');
  if (L.won) { ed.textContent = L.day <= L.days ? 'Оазис ожил! Завершить ✓' : 'Дальше'; ed.classList.add('win'); }
  else { ed.textContent = L.day >= L.days ? 'Последняя ночь ⏎' : 'Завершить день ⏎'; ed.classList.remove('win'); }
  ed.onclick = () => { if (L.won) finishLevel(true); else endDay(); };
  infoPanel();
  bind();
}

function coachText() {
  if (!run || run.level !== 0) return '';
  let canals = 0, plants = 0, grown = 0;
  each((c) => { if (!c.t) return; if (c.t.id === 'canal') canals++; if (TILES[c.t.id].plant) { plants++; if (c.t.stage > 0) grown++; } });
  if (L.day === 1 && ui.sel === null && !canals && !plants) return 'Шаг 1. Выберите карту <b>Канал</b> и поставьте её вплотную к роднику в центре — так вода пойдёт дальше.';
  if (L.day === 1 && ui.sel !== null) return 'Зелёная рамка — сюда можно. Правая кнопка мыши или Esc — отмена.';
  if (!plants) return 'Шаг 2. Посадите <b>Злаки</b> рядом с каналом или родником. Синяя капля на растении = оно будет полито.';
  if (L.day === 1) return 'Шаг 3. Потратьте оставшуюся силу и нажмите <b>Завершить день</b>: ночью политые растения растут и дают жизнь.';
  if (L.day === 2) return 'Цифра под родником — сколько воды в сети осталось. Нужна ещё вода — ставьте <b>Колодец</b> и соединяйте каналами.';
  const f = L.fc[L.day] || {};
  if (f.storm) return 'Ночью буря: крайние клетки с этой стороны засыплет. <b>Стена</b> или <b>саксаул</b> на краю закроют свою линию.';
  if (L.day === 3) return 'Пальма растёт медленно, но взрослая даёт 4 жизни, тень и защиту от бури.';
  return '';
}

function infoPanel() {
  const el = $('#inf'); if (!el) return;
  let html = '';
  if (ui.sel !== null && ui.sel >= 0) {
    const id = L.hand[ui.sel];
    html += `<h4>${cardName(id)}</h4><p>${cardDesc(id)}</p><p class="hint">${CARDS[id].kind === 'tile' || CARDS[id].target ? 'Выберите подсвеченную клетку. Esc / правая кнопка — отмена.' : 'Нажмите карту ещё раз, чтобы сыграть.'}</p>`;
  } else if (ui.hover) {
    const [x, y] = ui.hover; const c = L.grid[y][x];
    if (c.t) {
      const T = TILES[c.t.id];
      html += `<h4>${T.name}</h4><p>${T.desc}</p>`;
      if (T.plant) html += `<p>Стадия ${c.t.stage} из ${T.max}. Сейчас даёт ${T.yield[c.t.stage] || 0} жизни за ночь.</p>`;
    } else html += c.g === 'salt' ? '<h4>Солончак</h4><p>Здесь растёт только саксаул. Каналы и постройки ставить можно.</p>' : '<h4>Песок</h4><p>Пустая клетка.</p>';
    if (isShaded(x, y)) html += '<p class="hint">В тени: жара не действует.</p>';
  } else {
    html += `<h4>Подсказка</h4><p>Наведите на клетку, чтобы узнать о ней. Выберите карту в руке, затем клетку.</p><p class="hint">Пробел или Enter — завершить день. 1–6 — выбрать карту.</p>`;
  }
  el.innerHTML = html;
}

function bind() {
  document.querySelectorAll('#hd .card').forEach((el) => {
    el.onclick = () => {
      const hi = +el.dataset.hi; const id = L.hand[hi]; const C = CARDS[id];
      if (cardCost(id) > L.energy) { flash('Не хватает силы'); return; }
      if (C.kind === 'action' && !C.target) { if (ui.sel === hi) playCard(hi); else { ui.sel = hi; render(); } return; }
      ui.sel = ui.sel === hi ? null : hi; render();
    };
  });
  document.querySelectorAll('#bd .cell').forEach((el) => {
    const x = +el.dataset.x, y = +el.dataset.y;
    el.onclick = () => { if (ui.sel !== null && ui.sel >= 0) { const id = L.hand[ui.sel]; if (canPlace(id, x, y)) playCard(ui.sel, x, y); else flash('Сюда нельзя'); } };
    el.onmouseenter = () => { ui.hover = [x, y]; infoPanel(); };
    el.oncontextmenu = (e) => { e.preventDefault(); ui.sel = null; render(); };
  });
}

function flash(t) { const d = document.createElement('div'); d.className = 'flash'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 900); }
function fx(x, y, kind) { setTimeout(() => { const el = document.querySelector(`#bd .cell[data-x="${x}"][data-y="${y}"]`); if (el) { el.classList.add('fx-' + kind); setTimeout(() => el.classList.remove('fx-' + kind), 500); } }, 0); }
function showPops(pops) {
  setTimeout(() => {
    pops.forEach(([x, y, txt, kind], i) => {
      const el = document.querySelector(`#bd .cell[data-x="${x}"][data-y="${y}"]`); if (!el) return;
      const p = document.createElement('span'); p.className = 'pop ' + kind; p.textContent = txt; p.style.animationDelay = (i * 40) + 'ms'; el.appendChild(p); setTimeout(() => p.remove(), 1600 + i * 40);
    });
  }, 30);
}

function showReward(lvIdx, spare) {
  const { lv } = levelInfo(lvIdx);
  const cards = rewardCards();
  const relicTurn = lvIdx % 5 === 1 || lvIdx % 5 === 4;
  const relics = relicTurn ? rewardRelics() : [];
  const removeTurn = lv.boss;
  app().innerHTML = `
  <section class="panel reward">
    <h2>Оазис «${lv.n}» ожил</h2>
    <p>Жизни: <b>${L.life}</b> из ${L.target}${spare ? ` · раньше срока на ${spare} дн.` : ''}. Капель памяти: ${meta.drops}.</p>
    <h3>Возьмите карту в колоду</h3>
    <div class="cards wrap" id="rc">${cards.map((id) => cardHTML(id, -1)).join('')}</div>
    <button class="ghost" id="skip">Пропустить карту</button>
    ${relics.length ? `<h3>Реликвия</h3><div class="relicpick" id="rr">${relics.map((r) => `<div class="rp" data-r="${r}"><div class="relic">${relicArt(r)}</div><b>${RELICS[r].name}</b><p>${RELICS[r].desc}</p></div>`).join('')}</div>` : ''}
    ${removeTurn ? `<h3>Облегчить колоду</h3><p class="hint">После бури можно убрать одну карту.</p><div class="cards wrap small" id="rm">${run.deck.map((id, i) => `<div class="mini" data-i="${i}">${cardName(id)}</div>`).join('')}</div>` : ''}
    <button class="big" id="next" disabled>Дальше</button>
  </section>`;
  let gotCard = false, gotRelic = !relics.length;
  const upd = () => { $('#next').disabled = !(gotCard && gotRelic); };
  document.querySelectorAll('#rc .card').forEach((el) => el.onclick = () => { if (gotCard) return; run.deck.push(el.dataset.id); gotCard = true; el.classList.add('sel'); document.querySelectorAll('#rc .card').forEach((o) => { if (o !== el) o.classList.add('dis'); }); $('#skip').disabled = true; upd(); });
  $('#skip').onclick = () => { gotCard = true; $('#skip').disabled = true; document.querySelectorAll('#rc .card').forEach((o) => o.classList.add('dis')); upd(); };
  document.querySelectorAll('#rr .rp').forEach((el) => el.onclick = () => { if (gotRelic) return; run.relics.push(el.dataset.r); gotRelic = true; el.classList.add('sel'); document.querySelectorAll('#rr .rp').forEach((o) => { if (o !== el) o.classList.add('dis'); }); upd(); });
  let removed = false;
  document.querySelectorAll('#rm .mini').forEach((el) => el.onclick = () => { if (removed || run.deck.length <= 6) return; run.deck.splice(+el.dataset.i, 1); removed = true; el.classList.add('gone'); document.querySelectorAll('#rm .mini').forEach((o) => o.onclick = null); });
  $('#next').onclick = () => { L = null; saveRun(); showMap(); };
  saveRun();
}

function showEnd(win, r, lvIdx) {
  app().innerHTML = win ? `
  <section class="panel end">
    <div class="logo">${tileArt({ id: 'fountain', stage: 0 }, 0, 0)}</div>
    <h2>Последний колодец ожил</h2>
    <p>Все 15 оазисов пройдены. Караванные пути снова открыты.</p>
    <p>Капель памяти: <b>${meta.drops}</b>. Новые карты в наградах ждут следующий поход.</p>
    <button class="big" id="t">В меню</button>
  </section>` : `
  <section class="panel end">
    <h2>Песок забрал оазис</h2>
    <p>Пройдено оазисов: <b>${lvIdx}</b> из 15. Капель памяти: <b>${meta.drops}</b>.</p>
    <p class="hint">Капли открывают новые карты: гранат, насос, фонтан, ливень, караван. Попробуйте другой путь — карты в наградах каждый раз другие.</p>
    <button class="big" id="again">Новый поход</button>
    <button class="ghost" id="t">В меню</button>
  </section>`;
  $('#t').onclick = showTitle;
  if (!win) $('#again').onclick = newRun;
}

// ---------- клавиатура ----------
document.addEventListener('keydown', (e) => {
  if (!L || !$('#bd')) return;
  if (e.key === 'Escape') { ui.sel = null; render(); }
  else if (e.key === ' ' || e.key === 'Enter') { if (e.target && e.target.tagName === 'BUTTON') return; e.preventDefault(); $('#ed').click(); }
  else if (/^[1-7]$/.test(e.key)) { const el = document.querySelectorAll('#hd .card')[+e.key - 1]; if (el) el.click(); }
});

// для автотестов и отладки
window.__oasis = { get L() { return L; }, get run() { return run; }, newRun, startLevel, endDay, playCard, computeWater, finishLevel, showMap, CARDS, TILES };

showTitle();

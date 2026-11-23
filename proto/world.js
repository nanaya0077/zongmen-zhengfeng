'use strict';
/* 世界模型：地图、宗门、修士
 * 仅为 AI 原型服务，先实现「招募 / 派遣」所需的最小状态。
 */

const W = 30, H = 20, NT = W * H;

const TERRAIN = {
  M: { key: 'M', name: '山', speed: 0.50, ch: '山' },
  H: { key: 'H', name: '丘', speed: 0.80, ch: '丘' },
  F: { key: 'F', name: '林', speed: 0.80, ch: '林' },
  P: { key: 'P', name: '原', speed: 1.00, ch: '原' },
  R: { key: 'R', name: '河', speed: 0.75, ch: '河' },
  L: { key: 'L', name: '湖', speed: 0.60, ch: '湖' },
  C: { key: 'C', name: '岸', speed: 0.90, ch: '岸' },
};

/* ---------- 随机 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 地图生成（与《地图生成》一致） ---------- */
function generateMap(seed) {
  const rnd = mulberry32(seed);
  const ph = Array.from({ length: 6 }, () => rnd() * 6.283);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function height(x, y) {
    let v = 0.50;
    v += 0.17 * Math.sin(x * 0.27 + ph[0]) * Math.cos(y * 0.21 + ph[1]);
    v += 0.10 * Math.sin((x + y) * 0.17 + ph[2]);
    v += 0.07 * Math.sin((x - y) * 0.33 + ph[3]);
    const cy = 5.0 + 2.4 * Math.sin(x * 0.19 + ph[4]);
    v += Math.max(0, 0.28 - Math.abs(y - cy) * 0.052);
    const d2 = Math.hypot(x - 9, y - 15);
    v += Math.max(0, 0.20 - d2 * 0.045);
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    v -= Math.max(0, 0.20 - d * 0.06);
    return clamp(v, 0, 1);
  }

  const h = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => height(x, y)));
  const T = Array.from({ length: H }, () => Array(W).fill(null));
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) T[y][x] = 'C';

  // 河流：Dijkstra 沿谷地入海
  function river(sx, sy, minLen, maxLen) {
    const D = Array.from({ length: H }, () => Array(W).fill(Infinity));
    const P = Array.from({ length: H }, () => Array(W).fill(null));
    const done = Array.from({ length: H }, () => Array(W).fill(false));
    D[sy][sx] = 0;
    const pq = [[0, sx, sy]];
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, x, y] = pq.shift();
      if (done[y][x]) continue;
      done[y][x] = true;
      if (T[y][x] === 'C') {
        const path = []; let cx = x, cy = y;
        while (P[cy][cx]) { path.push([cx, cy]); [cx, cy] = P[cy][cx]; }
        if (path.length < minLen || path.length > maxLen) return 0;
        for (const [px, py] of path) if (!T[py][px]) T[py][px] = 'R';
        return path.length;
      }
      for (const [dx, dy] of NB) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const c = d + h[ny][nx] + 0.02;
        if (c < D[ny][nx]) { D[ny][nx] = c; P[ny][nx] = [x, y]; pq.push([c, nx, ny]); }
      }
    }
    return 0;
  }

  const peaks = [];
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) peaks.push([h[y][x], x, y]);
  peaks.sort((a, b) => b[0] - a[0]);
  let made = 0;
  for (const [, px, py] of peaks) {
    if (made >= 3) break;
    if (T[py][px]) continue;
    if (river(px, py, 10, 34) > 0) made++;
  }

  // 湖泊
  const cand = [];
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    if (T[y][x]) continue;
    let free = true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (T[y + dy][x + dx]) free = false;
    if (free) cand.push([h[y][x], x, y]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  let lakes = 0;
  for (const [, lx, ly] of cand) {
    if (lakes >= 3) break;
    if (T[ly][lx] || T[ly][lx + 1] || T[ly + 1][lx] || T[ly + 1][lx + 1]) continue;
    T[ly][lx] = T[ly][lx + 1] = T[ly + 1][lx] = T[ly + 1][lx + 1] = 'L';
    lakes++;
  }

  // 湿度
  const dist = Array.from({ length: H }, () => Array(W).fill(999));
  const q = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (T[y][x]) { dist[y][x] = 0; q.push([x, y]); }
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (dist[ny][nx] > dist[y][x] + 1) { dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); }
    }
  }

  // 分位分配
  const land = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!T[y][x]) land.push([x, y]);
  land.sort((a, b) => h[b[1]][b[0]] - h[a[1]][a[0]]);
  const nM = Math.round(NT * 0.16), nH = Math.round(NT * 0.15), nF = Math.round(NT * 0.19);
  land.forEach(([x, y], i) => {
    if (i < nM) T[y][x] = 'M';
    else if (i < nM + nH) T[y][x] = 'H';
  });
  const rest = land.slice(nM + nH).sort((a, b) => dist[a[1]][a[0]] - dist[b[1]][b[0]]);
  rest.forEach(([x, y], i) => { T[y][x] = i < nF ? 'F' : 'P'; });

  // 多数滤波 ×2
  for (let pass = 0; pass < 2; pass++) {
    const S = T.map(r => r.slice());
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const c = T[y][x];
      if (c === 'C' || c === 'R' || c === 'L') continue;
      const v = { [c]: 1.2 };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const t = T[y + dy][x + dx];
        if (t === 'C' || t === 'R' || t === 'L') continue;
        v[t] = (v[t] || 0) + 1;
      }
      let best = c, bv = -1;
      for (const k in v) if (v[k] > bv) { bv = v[k]; best = k; }
      S[y][x] = best;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) T[y][x] = S[y][x];
  }

  return T;
}

/* ---------- 基础工具 ---------- */
const key = (x, y) => x + ',' + y;
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

/* ---------- 修士生成 ---------- */
const LINGGEN = [
  { n: 1, name: '天灵根', rate: 10.0, p: 0.005 },
  { n: 2, name: '地灵根', rate: 5.0, p: 0.04 },
  { n: 3, name: '真灵根', rate: 2.5, p: 0.155 },
  { n: 4, name: '伪灵根', rate: 1.5, p: 0.30 },
  { n: 5, name: '杂灵根', rate: 1.0, p: 0.50 },
];
const REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体'];
const REALM_MUL = [1, 3, 9, 27, 81, 243, 729];
const RATE_BASE = 30;

function pickLinggen(rnd) {
  let r = rnd();
  for (const l of LINGGEN) { if (r < l.p) return l; r -= l.p; }
  return LINGGEN[4];
}

const SURNAME = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜';
const GIVEN = '玄清云风尘霜雪月星尘虚真一凡尘心道明';

function makeCultivator(rnd, sectId, seq) {
  const lg = pickLinggen(rnd);
  // 属性：三次均匀和 -> 近似正态，均值 50
  const attr = () => Math.round(clamp01((rnd() + rnd() + rnd()) / 3) * 100);
  const a = { gen: attr(), li: attr(), nei: attr(), wu: attr(), shen: attr(), fa: attr() };
  // 境界分布：90% 练气，其余几何递减
  let realm = 0;
  if (rnd() > 0.90) {
    let r = rnd();
    for (let i = 1; i < REALMS.length; i++) {
      const w = 0.8 * Math.pow(0.2, i - 1);
      if (r < w) { realm = i; break; }
      r -= w;
    }
  }
  const name = SURNAME[(rnd() * SURNAME.length) | 0] + GIVEN[(rnd() * GIVEN.length) | 0] + GIVEN[(rnd() * GIVEN.length) | 0];
  return {
    id: sectId + '-' + seq,
    name, realm, linggen: lg,
    attrs: a,
    sect: sectId,
    power: calcPower(realm, lg, a),
    alive: true,
    pos: null,
  };
}
const clamp01 = v => Math.max(0, Math.min(1, v));

function calcPower(realm, lg, a) {
  return REALM_MUL[realm] * (0.5 * lg.n) * (a.nei / 50) * (a.li / 50) * 1.0;
}

/* ---------- 世界 ---------- */
const SECT_DEFS = [
  { id: 'A', name: '青云宗', color: '青' },
  { id: 'B', name: '血魔教', color: '血' },
  { id: 'C', name: '太一门', color: '太' },
  { id: 'D', name: '万兽谷', color: '兽' },
  { id: 'E', name: '玄天剑派', color: '剑' },
  { id: 'F', name: '幽冥谷', color: '幽' },
  { id: 'G', name: '丹霞派', color: '丹' },
  { id: 'H', name: '黄泉殿', color: '黄' },
  { id: 'I', name: '天机阁', color: '机' },
  { id: 'J', name: '星河宗', color: '星' },
];

function createWorld(seed) {
  const rnd = mulberry32(seed ^ 0x9e3779b9);
  const grid = generateMap(seed);

  const cells = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    cells.push({
      x, y, t: grid[y][x],
      owner: null,          // 宗门 id
      village: false,
      claimedYear: 0,
    });
  }
  const at = (x, y) => cells[y * W + x];

  // 村落
  for (const c of cells) {
    const p = c.t === 'P' || c.t === 'R' ? 0.12
      : c.t === 'F' || c.t === 'H' ? 0.05
      : c.t === 'M' || c.t === 'L' ? 0.02 : 0;
    if (rnd() < p) c.village = true;
  }

  const sects = {};
  for (const d of SECT_DEFS) {
    sects[d.id] = {
      id: d.id, name: d.name, color: d.color,
      level: 1, stones: 200, copper: 100, pop: 40, reputation: 0,
      wood: 0, ore: 0,
      housing: 10, home: null,
      cultivators: [],
      cells: new Set(),
      log: [],
    };
  }

  // 山门选址：平原/河流、彼此距离 >= 7、5 格内有山、不与村落重叠
  const starts = [];
  const order = SECT_DEFS.map(s => s.id);
  for (const id of order) {
    let best = null;
    const cands = cells.filter(c =>
      (c.t === 'P' || c.t === 'R') && !c.village &&
      !starts.some(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) < 7) &&
      hasMountainNear(cells, c.x, c.y, 5)
    );
    if (!cands.length) {
      // 放宽：只要求距离
      const c2 = cells.filter(c => (c.t === 'P' || c.t === 'R') &&
        !starts.some(s => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) < 6));
      best = c2[(rnd() * c2.length) | 0];
    } else {
      best = cands[(rnd() * cands.length) | 0];
    }
    if (!best) { best = cells.find(c => c.t === 'P' && !c.owner); }
    starts.push(best);
    best.owner = id;
    sects[id].home = { x: best.x, y: best.y };
    sects[id].cells.add(key(best.x, best.y));

    // 初始 3 名修士
    for (let i = 0; i < 3; i++) {
      const cu = makeCultivator(rnd, id, i + 1);
      cu.pos = { x: best.x, y: best.y };
      sects[id].cultivators.push(cu);
    }
  }

  return { seed, rnd, cells, at, sects, W, H, year: 0, events: [] };
}

function hasMountainNear(cells, x, y, r) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > r) continue;
    const nx = x + dx, ny = y + dy;
    if (!inMap(nx, ny)) continue;
    if (cells[ny * W + nx].t === 'M') return true;
  }
  return false;
}

/* ---------- 势力范围 ---------- */
function radiusOf(level) {
  // 1 级 1 格，满级 5 格：每两级 +1
  return Math.min(5, 1 + Math.floor((level - 1) / 2));
}

function cellsInRadius(world, cx, cy, r) {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) + Math.abs(dy) > r) continue;
    const nx = cx + dx, ny = cy + dy;
    if (!inMap(nx, ny)) continue;
    out.push(world.at(nx, ny));
  }
  return out;
}

module.exports = {
  W, H, NT, TERRAIN, REALMS, REALM_MUL, RATE_BASE, LINGGEN,
  generateMap, createWorld, makeCultivator, calcPower,
  radiusOf, cellsInRadius, hasMountainNear, key, inMap, NB4, mulberry32,
};

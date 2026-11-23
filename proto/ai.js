'use strict';
/* 简易 AI：只做两件事 —— 招募、派遣
 * 招募：每年 6 月，从候选池里按「成长潜力」挑人，受床位限制
 * 派遣：把闲置修士派去占领价值最高、且代价可接受的无主格，路上顺手占格
 */

const { W, H, TERRAIN, REALM_MUL, makeCultivator, key, inMap, NB4, radiusOf, cellsInRadius } = require('./world');

/* ---------- 招募 ---------- */
function genCandidates(world, sect) {
  const n = 2 + sect.level;
  const out = [];
  for (let i = 0; i < n; i++) out.push(makeCultivator(world.rnd, sect.id, 'y' + world.year + '_' + i));
  return out;
}

// AI 的估值：灵根成长潜力为主，已有境界为辅
function scoreCandidate(c) {
  const growth = c.linggen.rate;
  const immediate = Math.sqrt(REALM_MUL[c.realm]);
  return growth * 10 + immediate * 6;
}

function aiRecruit(world, sect) {
  const free = sect.housing - sect.cultivators.length;
  if (free <= 0) return [];

  const cands = genCandidates(world, sect);
  cands.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));

  const taken = cands.slice(0, Math.min(free, cands.length));
  for (const c of taken) {
    c.pos = { x: sect.home.x, y: sect.home.y };
    sect.cultivators.push(c);
  }
  return taken;
}

/* ---------- 寻路 ---------- */
function stepCost(cell) { return 1 / TERRAIN[cell.t].speed; }

class MinHeap {
  constructor() { this.a = []; }
  push(p) {
    const a = this.a; a.push(p); let i = a.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[j], a[i]] = [a[i], a[j]]; i = j; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

// 一次 Dijkstra 拿到到全图的代价，避免每个目标跑一遍
function dijkstra(world, from) {
  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const done = new Uint8Array(W * H);
  const start = from.y * W + from.x;
  dist[start] = 0;
  const pq = new MinHeap();
  pq.push([0, start]);

  while (pq.size) {
    const [d, idx] = pq.pop();
    if (done[idx]) continue;
    done[idx] = 1;
    const x = idx % W, y = (idx / W) | 0;
    for (const [dx, dy] of NB4) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const ni = ny * W + nx;
      if (done[ni]) continue;
      const c = d + stepCost(world.cells[ni]);
      if (c < dist[ni]) { dist[ni] = c; prev[ni] = idx; pq.push([c, ni]); }
    }
  }
  return { dist, prev, start };
}

function buildPath(world, prev, start, goalIdx) {
  if (goalIdx === start) return [];
  const path = [];
  let cur = goalIdx;
  while (cur !== start && cur !== -1) { path.push(world.cells[cur]); cur = prev[cur]; }
  if (cur === -1) return null;
  path.reverse();
  return path;
}

/* ---------- 派遣 ---------- */
const TERRAIN_VALUE = { M: 3.0, P: 2.0, R: 2.2, H: 1.5, F: 1.2, C: 1.0, L: 0.6 };

function cellValue(cell) {
  let v = TERRAIN_VALUE[cell.t];
  if (cell.village) v += 2.0;
  return v;
}

/* 每个修士找一个「驻守点」：价值高、距离可接受的无主格。
 * 找到就记住，之后每年朝它走，到了就扎根——驻守是钉子，能防住一年腐烂。 */
function ensurePost(world, sect, cult) {
  if (cult.post) return;
  const { dist } = dijkstra(world, cult.pos);
  let best = null, bestScore = -1;
  const taken = new Set(sect.cultivators.filter(c => c !== cult && c.post).map(c => c.post.y * W + c.post.x));

  for (const t of world.cells) {
    if (t.owner !== null) continue;
    const idx = t.y * W + t.x;
    if (taken.has(idx)) continue;
    const d = dist[idx];
    if (!isFinite(d) || d > 60) continue;
    const score = cellValue(t) / (d + 1);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (best) cult.post = { x: best.x, y: best.y, v: cellValue(best) };
}

function aiDispatch(world, sect) {
  const out = [];
  for (const cult of sect.cultivators) {
    if (!cult.alive || !cult.pos) continue;

    // 驻守点被别人占了，重新找
    if (cult.post) {
      const c = world.cells[cult.post.y * W + cult.post.x];
      if (c.owner && c.owner !== sect.id) cult.post = null;
    }
    if (!cult.post) ensurePost(world, sect, cult);
    if (!cult.post) continue;
    if (cult.pos.x === cult.post.x && cult.pos.y === cult.post.y) continue;

    const { dist, prev, start } = dijkstra(world, cult.pos);
    const idx = cult.post.y * W + cult.post.x;
    if (!isFinite(dist[idx])) continue;
    const path = buildPath(world, prev, start, idx);
    if (path && path.length) out.push({ cult, path });
  }
  return out;
}

/* ---------- 移动 ---------- */
const MOVE_BUDGET = 80; // 每年可走的「平原格」数

function moveCultivator(world, cult, path) {
  const sect = world.sects[cult.sect];
  let budget = MOVE_BUDGET;
  let claimed = 0;
  let blocked = false;

  for (const cell of path) {
    const cost = stepCost(cell);
    if (cost > budget) break;

    if (cell.owner && cell.owner !== sect.id) { blocked = true; break; }

    budget -= cost;
    cult.pos = { x: cell.x, y: cell.y };

    if (cell.owner === null) {
      cell.owner = sect.id;
      cell.claimedYear = world.year;
      sect.cells.add(key(cell.x, cell.y));
      claimed++;
    }
  }
  return { claimed, blocked };
}

/* ---------- 势力范围自动并入 ---------- */
function autoClaim(world, sect) {
  const r = radiusOf(sect.level);
  let n = 0;
  for (const cell of cellsInRadius(world, sect.home.x, sect.home.y, r)) {
    if (cell.owner === null) {
      cell.owner = sect.id;
      cell.claimedYear = world.year;
      sect.cells.add(key(cell.x, cell.y));
      n++;
    }
  }
  return n;
}

module.exports = {
  genCandidates, scoreCandidate, aiRecruit,
  dijkstra, buildPath, stepCost, aiDispatch, moveCultivator, autoClaim,
  cellValue, MOVE_BUDGET,
};

'use strict';
/* 无界面模拟：跑 N 年，看 AI 会不会招募、会不会派人出去占格
 * 用法：node run.js [seed] [years]
 */

const { createWorld, W, H, TERRAIN, REALMS, radiusOf, key } = require('./world');
const { aiRecruit, aiDispatch, moveCultivator, autoClaim } = require('./ai');

const SEED = Number(process.argv[2]) || 20261120;
const YEARS = Number(process.argv[3]) || 40;

const world = createWorld(SEED);
const ids = Object.keys(world.sects);

/* ---------- 统计 ---------- */
function countTerrain(sect, t) {
  let n = 0;
  for (const k of sect.cells) {
    const [x, y] = k.split(',').map(Number);
    if (world.cells[y * W + x].t === t) n++;
  }
  return n;
}
function countVillages(sect) {
  let n = 0;
  for (const k of sect.cells) {
    const [x, y] = k.split(',').map(Number);
    if (world.cells[y * W + x].village) n++;
  }
  return n;
}

/* ---------- 产出 ---------- */
function produce(sect) {
  const mountains = countTerrain(sect, 'M');
  sect.stones += mountains * 30;

  const villages = countVillages(sect);
  const cap = 200 + sect.level * 80 + villages * 20;
  sect.pop = Math.min(cap, Math.round(sect.pop * 1.08));

  const workers = Math.floor(sect.pop * 0.375);
  sect.copper += Math.round(sect.pop * 0.6);
  sect.wood += Math.floor(workers * 0.4) * 8;
  sect.ore += Math.floor(workers * 0.3) * 8;

  // 声望：靠地盘上的村落慢慢攒
  sect.reputation += 1 + villages * 2;
}

/* ---------- 宗门升级 ---------- */
const LEVEL_UP = {
  2: { pop: 30, rep: 50, wood: 200, ore: 100, stones: 300 },
  3: { pop: 60, rep: 150, wood: 600, ore: 300, stones: 800 },
  4: { pop: 120, rep: 300, wood: 1500, ore: 800, stones: 2000 },
  5: { pop: 200, rep: 600, wood: 4000, ore: 2000, stones: 5000 },
  6: { pop: 350, rep: 1000, wood: 9000, ore: 5000, stones: 12000 },
  7: { pop: 550, rep: 1600, wood: 22000, ore: 12000, stones: 28000 },
  8: { pop: 800, rep: 2500, wood: 50000, ore: 28000, stones: 65000 },
  9: { pop: 1200, rep: 4000, wood: 120000, ore: 65000, stones: 150000 },
  10: { pop: 1800, rep: 6000, wood: 280000, ore: 150000, stones: 350000 },
};

function tryLevelUp(sect) {
  const req = LEVEL_UP[sect.level + 1];
  if (!req) return false;
  if (sect.pop < req.pop || sect.reputation < req.rep) return false;
  if (sect.wood < req.wood || sect.ore < req.ore || sect.stones < req.stones) return false;
  sect.wood -= req.wood; sect.ore -= req.ore; sect.stones -= req.stones;
  sect.level++;
  return true;
}

/* ---------- 住房扩建 ---------- */
function buildHousing(sect) {
  let built = 0;
  while (sect.wood >= 300 && sect.housing < 160) {
    sect.wood -= 300;
    sect.housing += 10;
    built++;
  }
  return built;
}

/* ---------- 一年腐烂 ---------- */
function decay(world) {
  const occupied = new Set();
  for (const id of ids) {
    for (const c of world.sects[id].cultivators) {
      if (c.alive && c.pos) occupied.add(c.pos.y * W + c.pos.x);
    }
  }
  let lost = 0;
  for (const cell of world.cells) {
    if (!cell.owner) continue;
    const s = world.sects[cell.owner];
    const inR = Math.abs(cell.x - s.home.x) + Math.abs(cell.y - s.home.y) <= radiusOf(s.level);
    const held = inR || cell.village || occupied.has(cell.y * W + cell.x);
    if (held) { cell.outYears = 0; continue; }
    cell.outYears = (cell.outYears || 0) + 1;
    if (cell.outYears >= 1) {
      s.cells.delete(key(cell.x, cell.y));
      cell.owner = null;
      cell.outYears = 0;
      lost++;
    }
  }
  return lost;
}

/* ---------- 主循环 ---------- */
console.log(`种子 ${SEED}，模拟 ${YEARS} 年\n`);

for (let year = 1; year <= YEARS; year++) {
  world.year = year;

  decay(world);

  for (const id of ids) {
    const s = world.sects[id];
    produce(s);
    buildHousing(s);
    tryLevelUp(s);
  }

  for (const id of ids) autoClaim(world, world.sects[id]);

  let recruited = 0;
  for (const id of ids) recruited += aiRecruit(world, world.sects[id]).length;

  let moves = 0, claims = 0, posted = 0;
  for (const id of ids) {
    const s = world.sects[id];
    for (const m of aiDispatch(world, s)) {
      const r = moveCultivator(world, m.cult, m.path);
      moves++; claims += r.claimed;
      if (m.cult.post && m.cult.pos.x === m.cult.post.x && m.cult.pos.y === m.cult.post.y) posted++;
    }
  }

  if (year % 5 === 0 || year === 1) {
    const line = ids.map(id => {
      const s = world.sects[id];
      return `${s.name} Lv${s.level} ${String(s.cells.size).padStart(3)}格/${String(s.cultivators.length).padStart(2)}人`;
    }).join('  ');
    console.log(`第 ${String(year).padStart(2)} 年  ${line}   [本年 招募${recruited} 派遣${moves} 占格${claims}]`);
  }
}

/* ---------- 结果 ---------- */
let owned = 0;
for (const c of world.cells) if (c.owner) owned++;

console.log(`\n=== ${YEARS} 年后 ===`);
console.log(`已占领 ${owned} / ${W * H} 格（${(owned / (W * H) * 100).toFixed(1)}%），无主 ${W * H - owned} 格\n`);

console.log('宗门      领地  修士  灵石   人口  铜钱   木材  矿石  床位');
for (const id of ids) {
  const s = world.sects[id];
  console.log(
    `${s.name.padEnd(6, '　')} ${String(s.cells.size).padStart(4)} ${String(s.cultivators.length).padStart(5)} ` +
    `${String(Math.round(s.stones)).padStart(6)} ${String(s.pop).padStart(5)} ${String(Math.round(s.copper)).padStart(6)} ` +
    `${String(Math.round(s.wood)).padStart(6)} ${String(Math.round(s.ore)).padStart(5)} ${String(s.housing).padStart(5)}`
  );
}

/* ---------- 地图 ---------- */
console.log('\n地形图：');
for (let y = 0; y < H; y++) {
  console.log(world.cells.slice(y * W, y * W + W).map(c => TERRAIN[c.t].ch).join(''));
}

console.log('\n势力图（· = 无主）：');
for (let y = 0; y < H; y++) {
  console.log(world.cells.slice(y * W, y * W + W).map(c => c.owner || '·').join(''));
}

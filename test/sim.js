'use strict';
/* 核心逻辑冒烟测试：不开浏览器，直接跑 40 年，看会不会崩、AI 会不会动 */
const D = require('../js/data.js');
const Wd = require('../js/world.js');
const Ai = require('../js/ai.js');
const Sim = require('../js/sim.js');

const SEED = Number(process.argv[2]) || 20261120;
const YEARS = Number(process.argv[3]) || 40;

const t0 = Date.now();
const world = Wd.createWorld(SEED);

// 测试时让玩家宗也交给 AI，才能验证完整循环
world.sects.A.isPlayer = false;

const ids = Object.keys(world.sects);
let battles = 0;

for (let y = 1; y <= YEARS; y++) {
  const target = y * D.CFG.YEAR_SECONDS;
  let guard = 0;
  while (world.t < target && !world.over && guard++ < 2000) {
    Sim.tick(world, 1);
    world.paused = false;
  }
  if (world.over) break;

  if (y % 5 === 0 || y === 1) {
    const parts = ids.map(id => {
      const s = world.sects[id];
      return `${s.name} Lv${s.level} ${Wd.countOwned(world, s)}格/${s.cultivators.length}人`;
    });
    console.log(`第 ${String(y).padStart(2)} 年  ` + parts.join('  '));
  }
}

let owned = 0;
for (const c of world.cells) if (c.owner) owned++;

console.log(`\n用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`已占领 ${owned}/${600} 格`);
console.log('宗门      等级 领地 修士 灵石  人口 铜钱  木材 矿石');
for (const id of ids) {
  const s = world.sects[id];
  console.log(
    `${s.name.padEnd(6, '　')} Lv${String(s.level).padStart(2)} ${String(Wd.countOwned(world, s)).padStart(4)} ` +
    `${String(s.cultivators.length).padStart(4)} ${String(Math.round(s.stones)).padStart(5)} ` +
    `${String(s.pop).padStart(4)} ${String(Math.round(s.copper)).padStart(5)} ` +
    `${String(Math.round(s.wood)).padStart(5)} ${String(Math.round(s.ore)).padStart(4)}`
  );
}

const moving = ids.reduce((n, id) => n + world.sects[id].cultivators.filter(c => c.path && c.path.length).length, 0);
const posted = ids.reduce((n, id) => n + world.sects[id].cultivators.filter(c => c.post).length, 0);
console.log(`\n在途 ${moving} 人，已驻守 ${posted} 人`);
console.log(world.over ? `结局：${world.over}` : '结局：未分出胜负');

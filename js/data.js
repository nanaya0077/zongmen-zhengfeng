/* 修仙宗门 SLG —— 全局数据与常量 */
(function (global) {
  'use strict';

  var TERRAIN = {
    M: { k: 'M', name: '山地', speed: 0.50, color: '#7a6b52', yield: '矿石·灵石' },
    H: { k: 'H', name: '丘陵', speed: 0.80, color: '#8a8558', yield: '矿石·灵植' },
    F: { k: 'F', name: '森林', speed: 0.80, color: '#2f5539', yield: '木材·灵植' },
    P: { k: 'P', name: '平原', speed: 1.00, color: '#7f8f55', yield: '聚落·可建城' },
    R: { k: 'R', name: '河流', speed: 0.75, color: '#2f6480', yield: '聚落·可建城' },
    L: { k: 'L', name: '湖泊', speed: 0.60, color: '#27546e', yield: '渔业·灵植' },
    C: { k: 'C', name: '海岸', speed: 0.90, color: '#a3936a', yield: '渔业·贸易' }
  };

  var REALMS = ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体'];
  var REALM_MUL = [1, 3, 9, 27, 81, 243, 729];
  var REALM_NEED = [0, 1200, 3600, 9600, 24000, 60000, 144000];
  var REALM_LIFE = [120, 250, 500, 900, 1600, 3000, 6000];

  var LINGGEN = [
    { n: 1, name: '天灵根', rate: 10.0, p: 0.005 },
    { n: 2, name: '地灵根', rate: 5.0, p: 0.04 },
    { n: 3, name: '真灵根', rate: 2.5, p: 0.155 },
    { n: 4, name: '伪灵根', rate: 1.5, p: 0.30 },
    { n: 5, name: '杂灵根', rate: 1.0, p: 0.50 }
  ];

  var PHYSIQUE = [
    { p: 0.695, name: '凡体', atk: 0, spd: 0 },
    { p: 0.12, name: '灵体', atk: 0, spd: 0.20 },
    { p: 0.06, name: '剑骨', atk: 0.30, spd: -0.10 },
    { p: 0.04, name: '纯阳之体', atk: 0.10, spd: 0 },
    { p: 0.04, name: '玄阴之体', atk: 0.05, spd: 0 },
    { p: 0.03, name: '荒古圣体', atk: 0.60, spd: -0.30 },
    { p: 0.01, name: '道体天成', atk: 0.15, spd: 0.40 },
    { p: 0.005, name: '混沌道体', atk: 0.10, spd: 0.0, chaos: true }
  ];

  var SECT_DEFS = [
    { id: 'A', name: '青云宗', color: '#3fd0b0' },
    { id: 'B', name: '血魔教', color: '#e05252' },
    { id: 'C', name: '太一门', color: '#e0b64f' },
    { id: 'D', name: '万兽谷', color: '#a06fe0' },
    { id: 'E', name: '玄天剑派', color: '#5a8fe0' },
    { id: 'F', name: '幽冥谷', color: '#9aa6a0' },
    { id: 'G', name: '丹霞派', color: '#e07f4f' },
    { id: 'H', name: '黄泉殿', color: '#d0508a' },
    { id: 'I', name: '天机阁', color: '#8fc060' },
    { id: 'J', name: '星河宗', color: '#e8e4d0' }
  ];

  /* 等级要求：pop / rep / wood / ore / stones */
  var LEVEL_REQ = {
    2: { pop: 30, rep: 50, wood: 200, ore: 100, stones: 300 },
    3: { pop: 60, rep: 150, wood: 600, ore: 300, stones: 800 },
    4: { pop: 120, rep: 300, wood: 1500, ore: 800, stones: 2000 },
    5: { pop: 200, rep: 600, wood: 4000, ore: 2000, stones: 5000 },
    6: { pop: 350, rep: 1000, wood: 9000, ore: 5000, stones: 12000 },
    7: { pop: 550, rep: 1600, wood: 22000, ore: 12000, stones: 28000 },
    8: { pop: 800, rep: 2500, wood: 50000, ore: 28000, stones: 65000 },
    9: { pop: 1200, rep: 4000, wood: 120000, ore: 65000, stones: 150000 },
    10: { pop: 1800, rep: 6000, wood: 280000, ore: 150000, stones: 350000 }
  };

  var CFG = {
    W: 30, H: 20,
    YEAR_SECONDS: 300,     // 1× 下一秒 = 1 游戏秒；一年 5 分钟
    CELL_SECONDS: 15,      // 平原走一格 15 秒
    SPEEDS: [1, 2, 3, 5, 10],
    DEFAULT_SPEED: 5,
    WIN_RATIO: 0.6,
    HOUSING_WOOD: 300,
    HOUSING_BEDS: 10,
    CITY_WOOD: 400, CITY_ORE: 150, CITY_STONES: 300,
    CITY_RADIUS: 3,
    CITY_POP: 60,
    MOVE_COST: 1,
    BOOST_STONES: 100,
    BOOST_CULT: 220,
    TALISMAN_STONES: 150,
    TALISMAN_ORE: 80,
    LEVY_COPPER: 200,
    LEVY_POP: 35,
    MARKET_COPPER: 200,
    MARKET_WOOD: 140,
    MARKET_ORE: 90
  };

  var API = {
    TERRAIN: TERRAIN, REALMS: REALMS, REALM_MUL: REALM_MUL,
    REALM_NEED: REALM_NEED, REALM_LIFE: REALM_LIFE,
    LINGGEN: LINGGEN, PHYSIQUE: PHYSIQUE, SECT_DEFS: SECT_DEFS,
    LEVEL_REQ: LEVEL_REQ, CFG: CFG
  };

  global.SLGData = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

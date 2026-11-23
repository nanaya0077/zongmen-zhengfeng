'use strict';
/* DOM 桩：在 node 里跑几帧渲染，抓运行时错误（不验证像素） */
function mkEl(id) {
  return {
    id: id, textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {}, onclick: null, children: [],
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 720, height: 480 }; },
    getContext() {
      return new Proxy({}, {
        get(t, k) {
          if (k in t) return t[k];
          return function () {};
        },
        set(t, k, v) { t[k] = v; return true; }
      });
    }
  };
}
var els = {};
var spdButtons = [0, 1, 2, 5, 10].map(function (v) {
  var e = mkEl('spd' + v); e.dataset.spd = String(v); return e;
});

global.window = global;
global.location = { search: '' };
global.document = {
  getElementById(id) {
    if (!els[id]) els[id] = mkEl(id);
    return els[id];
  },
  createElement() { return mkEl('new'); },
  querySelectorAll(sel) { return sel === '.spd' ? spdButtons : []; },
  addEventListener() {}
};

var rafCb = null;
global.requestAnimationFrame = function (cb) { rafCb = cb; };

require('../js/data.js');
require('../js/world.js');
require('../js/ai.js');
require('../js/sim.js');
require('../js/game.js');

// 手动推进 600 帧（约 10 秒现实时间，默认 5× → 50 游戏秒）
var ts = 0;
for (var i = 0; i < 600; i++) {
  ts += 16.7;
  rafCb(ts);
}

console.log('渲染 600 帧无异常');
console.log('年份：', els.date.textContent);
console.log('HUD：', els.stats.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
console.log('面板：', els.panel.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));

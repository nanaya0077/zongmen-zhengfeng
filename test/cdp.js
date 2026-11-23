'use strict';
/* CDP 真机测试：启动 headless Chrome，模拟点击，验证玩家能不能操作 */
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;
const URL = 'file:///D:/ass/deepseek%20work/DIY/slg/index.html';

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const profile = path.join(os.tmpdir(), 'slg-cdp-' + Date.now());
  fs.mkdirSync(profile, { recursive: true });

  const child = spawn(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1280,760',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile,
    URL
  ], { stdio: 'ignore' });

  let list = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      list = await r.json();
      if (list.some(t => t.type === 'page' && t.url.startsWith('file:'))) break;
    } catch (e) { /* not ready */ }
  }
  const page = list && list.find(t => t.type === 'page' && t.url.startsWith('file:'));
  if (!page) { console.log('FAIL: 没找到页面'); child.kill(); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  const send = (method, params) => new Promise(res => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evalJs = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      return { error: r.result.exceptionDetails.text + ' ' + (r.result.result && r.result.result.description || '') };
    }
    return r.result && r.result.result ? r.result.result.value : null;
  };

  await sleep(800);

  console.log('1) 页面是否加载：', await evalJs('typeof window.__game'));
  console.log('2) 开局是否暂停：', await evalJs('__game().paused'));

  // 点击「入世」
  await evalJs("document.getElementById('startBtn').click()");
  await sleep(200);
  console.log('3) 入世后暂停：', await evalJs('__game().paused'));
  console.log('   遮罩是否关闭：', await evalJs("!document.getElementById('overlay').classList.contains('show')"));

  // 玩家山门
  const home = await evalJs('JSON.stringify(__game().sects.A.home)');
  console.log('4) 山门：', home);
  const h = JSON.parse(home);

  // 模拟点击 canvas 上的山门格
  const clickRes = await evalJs(`(function(){
    var cv = document.getElementById('map');
    var r = cv.getBoundingClientRect();
    var cell = 900/30;
    var cx = r.left + (${h.x} + 0.5) * (r.width/30);
    var cy = r.top + (${h.y} + 0.5) * (r.height/20);
    ['mousedown','mouseup','click'].forEach(function(t){
      cv.dispatchEvent(new MouseEvent(t, {bubbles:true, clientX:cx, clientY:cy, button:0}));
    });
    return document.getElementById('panel').textContent.slice(0, 120);
  })()`);
  console.log('5) 点山门后面板：', clickRes);

  // 找一个相邻无主格，左键点它派兵（新交互）
  const orderRes = await evalJs(`(function(){
    var g = __game();
    var home = g.sects.A.home;
    var tgt = null;
    for (var dy=-1; dy<=1 && !tgt; dy++) for (var dx=-1; dx<=1 && !tgt; dx++) {
      if (!dx && !dy) continue;
      var nx = home.x+dx, ny = home.y+dy;
      if (nx<0||ny<0||nx>=30||ny>=20) continue;
      if (!g.at(nx,ny).owner) tgt = {x:nx,y:ny};
    }
    if (!tgt) return '没有相邻空地';
    var cv = document.getElementById('map');
    var r = cv.getBoundingClientRect();
    var cx = r.left + (tgt.x + 0.5) * (r.width/30);
    var cy = r.top + (tgt.y + 0.5) * (r.height/20);
    ['mousedown','mouseup','click'].forEach(function(t){
      cv.dispatchEvent(new MouseEvent(t, {bubbles:true, clientX:cx, clientY:cy, button:0}));
    });
    var movers = g.sects.A.cultivators.filter(function(c){ return c.path && c.path.length; });
    return JSON.stringify({target: tgt, moving: movers.length});
  })()`);
  console.log('6) 左键点目标格派兵：', orderRes);

  // 推进 30 秒游戏时间，看有没有真的动
  await evalJs(`(function(){
    var g = __game(), S = window.__SLG.Sim;
    for (var i=0;i<30;i++){ g.paused=false; S.tick(g,1); }
    return true;
  })()`);
  console.log('7) 30 秒后位置：', await evalJs(`(function(){
    var g=__game();
    var c=g.sects.A.cultivators[0];
    return JSON.stringify({pos:c.pos, path:!!(c.path&&c.path.length)});
  })()`));

  console.log('8) 玩家领地：', await evalJs('window.__SLG.Wd.countOwned(__game(), __game().sects.A)'));

  ws.close();
  child.kill();
  await sleep(300);
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });

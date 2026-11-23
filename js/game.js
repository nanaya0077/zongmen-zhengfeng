/* 旧版 2D Canvas 主程序（保留供 test/dom.js 兼容性测试，同步修复 B7~B10） */
(function () {
  'use strict';
  var D = window.SLGData, Wd = window.SLGWorld, Ai = window.SLGAi, Sim = window.SLGSim;
  var CFG = D.CFG, W = CFG.W, H = CFG.H, CELL = 30;

  var cv = document.getElementById('map');
  var ctx = cv.getContext('2d');
  var world, player;
  var selected = null, hover = null;
  var lastTs = 0, recruitOpen = false, endShown = false, modalOpen = false, rafId = 0;
  var lastPanelKey = '', lastLogSeq = -1;

  function init(seed) {
    if (rafId) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
      rafId = 0;
    }
    world = Wd.createWorld(seed);
    player = world.sects.A;
    selected = null;
    recruitOpen = false;
    endShown = false;
    modalOpen = false;
    lastPanelKey = '';
    lastLogSeq = -1;
    Wd.addLog(world, '青云宗立派于 (' + player.home.x + ',' + player.home.y + ')，志在九州', 'good');
    lastTs = 0;
    player.auto = false;
    if (typeof autoBtn !== 'undefined' && autoBtn) {
      autoBtn.textContent = '托管：关';
      autoBtn.classList.remove('on');
    }

    var q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    var skip = Number(q.get('skip') || 0);
    if (skip > 0) {
      var wasPlayer = world.sects.A.isPlayer;
      world.sects.A.isPlayer = false;
      for (var i = 0; i < skip * CFG.YEAR_SECONDS; i++) {
        world.recruitPending = null;
        world.paused = false;
        Sim.tick(world, 1);
        if (world.over) break;
      }
      world.sects.A.isPlayer = wasPlayer;
      world.paused = false;
    } else {
      world.paused = true;
      showIntro();
    }
    rafId = requestAnimationFrame(frame);
  }

  function showIntro() {
    modalOpen = true;
    var modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>宗 门 争 锋</h2>' +
      '<p class="sub">你是青云宗宗主。十家宗门分据九州，灵脉有限。</p>' +
      '<div style="font-size:13px;line-height:2;color:#a8bdb8">' +
      '· <b style="color:#dff">左键</b>点自己的修士选中，<b style="color:#dff">再点任意格子</b>派兵<br>' +
      '· 修士走过即占地；不在势力范围内又无人驻守的地，累计一年后会荒废<br>' +
      '· 每年六月开招募大会，在平原或河流上建城可扩大势力范围<br>' +
      '· 占下天下六成，或灭尽诸宗，即为一统' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
      '<button class="btn" id="startBtn">入 世</button></div>';
    document.getElementById('overlay').classList.add('show');
    document.getElementById('startBtn').onclick = function () {
      document.getElementById('overlay').classList.remove('show');
      modalOpen = false;
      world.paused = false;
    };
  }

  function frame(ts) {
    if (!lastTs) lastTs = ts;
    var dtReal = Math.min(0.08, (ts - lastTs) / 1000);
    lastTs = ts;

    if (!world.paused && !world.over) {
      var dtGame = dtReal * world.speed;
      Sim.tick(world, dtGame);
      if (player.auto) Ai.aiThink(world, player, dtGame);
    }

    if (world.recruitPending && !recruitOpen) openRecruit();
    if (world.over && !recruitOpen && !endShown) showEnd();

    render();
    updateHud();
    rafId = requestAnimationFrame(frame);
  }

  function render() {
    ctx.clearRect(0, 0, W * CELL, H * CELL);
    for (var i = 0; i < world.cells.length; i++) {
      var c = world.cells[i];
      ctx.fillStyle = D.TERRAIN[c.t].color;
      ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
      if (c.owner) {
        var s = world.sects[c.owner];
        ctx.fillStyle = hexA(s.color, 0.16);
        ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
      }
    }
  }

  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function updateHud() {
    var s = player;
    document.getElementById('lv').textContent = 'Lv.' + s.level;
    var month = Sim.monthOf(world.t) + 1;
    document.getElementById('date').textContent = '第 ' + world.year + ' 年 ' + month + ' 月';

    var stats = [
      ['灵石', Math.round(s.stones)],
      ['木材', Math.round(s.wood)],
      ['矿石', Math.round(s.ore)],
      ['铜钱', Math.round(s.copper)],
      ['人口', s.pop],
      ['修士', s.cultivators.length + '/' + s.housing],
      ['声望', Math.round(s.rep)],
      ['领地', Wd.countOwned(world, s)]
    ];
    document.getElementById('stats').innerHTML = stats.map(function (p) {
      return '<div class="chip"><span>' + p[0] + '</span><b>' + p[1] + '</b></div>';
    }).join('');

    document.querySelectorAll('.spd[data-spd]').forEach(function (b) {
      var sp = Number(b.dataset.spd);
      var on = world.paused ? sp === 0 : sp === world.speed;
      b.classList.toggle('on', on);
    });

    renderPanel();
    renderLog();
  }

  function renderPanel() {
    var el = document.getElementById('panel');
    var s = player;
    var sig = (selected ? selected.x + ',' + selected.y : 'home') + '|' + Math.round(s.wood) + '|' +
      Math.round(s.ore) + '|' + Math.round(s.stones) + '|' + s.cultivators.length + '|' + s.level;
    if (sig === lastPanelKey) return;
    lastPanelKey = sig;

    if (selected) {
      var c = world.at(selected.x, selected.y);
      var owner = c.owner ? world.sects[c.owner] : null;
      var html = '<div class="name">' + D.TERRAIN[c.t].name + ' (' + c.x + ',' + c.y + ')</div>';
      html += '<div class="row"><span>归属</span><b>' + (owner ? owner.name : '无主') + '</b></div>';
      if (c.owner === 'A' && !c.city && (c.t === 'P' || c.t === 'R')) {
        var can = player.wood >= CFG.CITY_WOOD && player.ore >= CFG.CITY_ORE && player.stones >= CFG.CITY_STONES && player.cities.length < player.level * 2;
        html += '<button class="btn wide" id="buildCity" ' + (can ? '' : 'disabled') + '>建城（木' +
          CFG.CITY_WOOD + ' 矿' + CFG.CITY_ORE + ' 石' + CFG.CITY_STONES + '）</button>';
      }
      el.innerHTML = html;
      var btn = document.getElementById('buildCity');
      if (btn) btn.onclick = function () {
        var err = Wd.buildCity(world, player, c);
        if (err) Wd.addLog(world, err, 'bad');
        lastPanelKey = '';
        renderPanel();
      };
      return;
    }

    var req = D.LEVEL_REQ[s.level + 1];
    var html2 = '<div class="name">' + s.name + '<span class="tag">' + s.level + ' 级</span></div>';
    html2 += '<div class="row"><span>势力半径</span><b>' + Wd.radiusOf(s.level) + ' 格</b></div>';
    html2 += '<div class="row"><span>城池</span><b>' + s.cities.length + ' / ' + (s.level * 2) + '</b></div>';
    html2 += '<div class="row"><span>修士</span><b>' + s.cultivators.length + ' / ' + s.housing + ' 床位</b></div>';
    if (req) {
      html2 += '<div style="margin-top:8px;color:#7f9793;font-size:11.5px">升级条件</div>';
      html2 += '<div class="row"><span>人口</span><b>' + s.pop + ' / ' + req.pop + '</b></div>';
      html2 += '<div class="row"><span>声望</span><b>' + Math.round(s.rep) + ' / ' + req.rep + '</b></div>';
      html2 += '<div class="row"><span>木 / 矿 / 石</span><b>' + Math.round(s.wood) + '/' + req.wood + ' · ' + Math.round(s.ore) + '/' + req.ore + ' · ' + Math.round(s.stones) + '/' + req.stones + '</b></div>';
    }
    html2 += '<div class="hint">左键点自己的修士选中，再点任意格派兵<br>空格暂停</div>';
    el.innerHTML = html2;
  }

  function renderLog() {
    if (lastLogSeq === (world.logSeq || 0)) return;
    lastLogSeq = world.logSeq || 0;
    var el = document.getElementById('log');
    var lines = world.log.slice(-30).reverse().map(function (e) {
      return '<div class="log-line ' + e.kind + '"><em>第' + e.year + '年</em>' + e.text + '</div>';
    }).join('');
    el.innerHTML = lines || '<div class="log-line">——</div>';
  }

  function openRecruit() {
    recruitOpen = true;
    modalOpen = true;
    world.paused = true;
    var cands = world.recruitPending;
    var free = player.housing - player.cultivators.length;
    var picked = new Set();

    var modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>六 月 · 招 募 大 会</h2>' +
      '<p class="sub">可收 ' + free + ' 人。点击卡片选择，资质与属性均已测灵。</p>' +
      '<div class="cands" id="cands"></div>' +
      '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="btn" id="skipBtn">全部不收</button>' +
      '<button class="btn" id="okBtn">收入门中</button></div>';

    var box = document.getElementById('cands');
    cands.forEach(function (c, i) {
      var d = document.createElement('div');
      d.className = 'cand';
      d.innerHTML = '<div class="cn">' + c.name + ' <span class="tag">' + D.REALMS[c.realm] + '</span></div>';
      d.onclick = function () {
        if (picked.has(i)) { picked.delete(i); d.classList.remove('on'); }
        else if (picked.size < free) { picked.add(i); d.classList.add('on'); }
      };
      box.appendChild(d);
    });
    document.getElementById('skipBtn').onclick = function () { closeRecruit([]); };
    document.getElementById('okBtn').onclick = function () {
      closeRecruit(Array.from(picked).map(function (i) { return cands[i]; }));
    };
    document.getElementById('overlay').classList.add('show');
  }

  function closeRecruit(take) {
    take.forEach(function (c) {
      c.pos = { x: player.home.x, y: player.home.y };
      c.prevPos = { x: player.home.x, y: player.home.y };
      player.cultivators.push(c);
      Wd.addLog(world, c.name + ' 入门（' + c.lg.name + '）', 'good');
    });
    world.recruitPending = null;
    recruitOpen = false;
    modalOpen = false;
    document.getElementById('overlay').classList.remove('show');
    world.paused = false;
  }

  function showEnd() {
    endShown = true;
    modalOpen = true;
    var win = world.over === 'win';
    var modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>' + (win ? '一 统 九 州' : '宗 门 倾 覆') + '</h2>' +
      '<p class="sub">' + (win ? '诸宗俯首，灵脉尽归青云。' : '山门破败，道统断绝。') + '</p>' +
      '<div style="display:flex;justify-content:flex-end"><button class="btn" id="againBtn">重开一世</button></div>';
    document.getElementById('overlay').classList.add('show');
    document.getElementById('againBtn').onclick = function () {
      document.getElementById('overlay').classList.remove('show');
      modalOpen = false;
      init((Math.random() * 1e9) | 0);
    };
  }

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      if (modalOpen) return;
      e.preventDefault();
      world.paused = !world.paused;
    }
    if (e.code === 'Escape') { selected = null; lastPanelKey = ''; renderPanel(); }
  });

  document.querySelectorAll('.spd[data-spd]').forEach(function (b) {
    b.onclick = function () {
      var sp = Number(b.dataset.spd);
      if (sp === 0) world.paused = true;
      else { world.paused = false; world.speed = sp; }
    };
  });

  var autoBtn = document.getElementById('autoBtn');
  autoBtn.onclick = function () {
    player.auto = !player.auto;
    autoBtn.textContent = '托管：' + (player.auto ? '开' : '关');
    autoBtn.classList.toggle('on', !!player.auto);
  };

  if (typeof window !== 'undefined') {
    window.__game = function () { return world; };
    window.__SLG = { Sim: Sim, Ai: Ai, Wd: Wd, D: D };
  }
  init(20261120);
})();

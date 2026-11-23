/* 主程序：渲染、输入、面板、招募弹窗 */
(function () {
  'use strict';
  var D = window.SLGData, Wd = window.SLGWorld, Ai = window.SLGAi, Sim = window.SLGSim;
  var CFG = D.CFG, W = CFG.W, H = CFG.H, CELL = 30;

  var cv = document.getElementById('map');
  var ctx = cv.getContext('2d');
  var world, player;
  var selected = null, hover = null;
  var lastTs = 0, recruitOpen = false, introShown = false;

  /* ---------- 初始化 ---------- */
  function init(seed) {
    world = Wd.createWorld(seed);
    player = world.sects.A;
    selected = null;
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
      world.sects.A.isPlayer = false;      // 快进时让 AI 代打，否则玩家宗会被打爆
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
    requestAnimationFrame(frame);
  }

  function showIntro() {
    var modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>宗 门 争 锋</h2>' +
      '<p class="sub">你是青云宗宗主。十家宗门分据九州，灵脉有限。</p>' +
      '<div style="font-size:13px;line-height:2;color:#a8bdb8">' +
      '· <b style="color:#dff">左键</b>点自己的修士（带圆点）选中，<b style="color:#dff">再点任意格子</b>派兵<br>' +
      '· 修士走过即占地；不在势力范围内又无人驻守的地，一年后会荒废<br>' +
      '· 每年六月开招募大会，招到的人越多，能占的地越多<br>' +
      '· 在平原或河流上建城，可以把势力范围推出去<br>' +
      '· 占下天下六成，或灭尽诸宗，即为一统' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
      '<button class="btn" id="startBtn">入 世</button></div>';
    document.getElementById('overlay').classList.add('show');
    document.getElementById('startBtn').onclick = function () {
      document.getElementById('overlay').classList.remove('show');
      world.paused = false;
    };
  }

  /* ---------- 主循环 ---------- */
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
    if (world.over && !recruitOpen) showEnd();

    render();
    updateHud();
    requestAnimationFrame(frame);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    ctx.clearRect(0, 0, W * CELL, H * CELL);

    // 地形
    for (var i = 0; i < world.cells.length; i++) {
      var c = world.cells[i];
      ctx.fillStyle = D.TERRAIN[c.t].color;
      ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
      ctx.strokeStyle = 'rgba(0,0,0,.13)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x * CELL + .5, c.y * CELL + .5, CELL - 1, CELL - 1);

      if (c.owner) {
        var s = world.sects[c.owner];
        ctx.fillStyle = hexA(s.color, 0.16);
        ctx.fillRect(c.x * CELL, c.y * CELL, CELL, CELL);
        ctx.strokeStyle = hexA(s.color, 0.85);
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x * CELL + 1, c.y * CELL + 1, CELL - 2, CELL - 2);
      }

      if (c.village) {
        ctx.fillStyle = 'rgba(245,240,215,.9)';
        ctx.beginPath();
        ctx.arc(c.x * CELL + CELL / 2, c.y * CELL + CELL / 2, 2.6, 0, 6.284);
        ctx.fill();
      }
      if (c.city) {
        ctx.strokeStyle = '#ffe9a8';
        ctx.lineWidth = 2;
        ctx.strokeRect(c.x * CELL + 6, c.y * CELL + 6, CELL - 12, CELL - 12);
      }
      if (c.battle) {
        ctx.fillStyle = 'rgba(255,90,90,.85)';
        ctx.beginPath();
        ctx.arc(c.x * CELL + CELL / 2, c.y * CELL + CELL / 2, 4.2, 0, 6.284);
        ctx.fill();
      }
    }

    // 山门标记
    Object.keys(world.sects).forEach(function (id) {
      var s = world.sects[id];
      var hx = s.home.x * CELL, hy = s.home.y * CELL;
      ctx.beginPath();
      ctx.arc(hx + CELL / 2, hy + CELL / 2, 6, 0, 6.284);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    });

    // 修士
    var counts = new Map();
    Object.keys(world.sects).forEach(function (id) {
      world.sects[id].cultivators.forEach(function (cu) {
        if (!cu.alive || !cu.pos) return;
        var k = cu.pos.y * W + cu.pos.x;
        if (!counts.has(k)) counts.set(k, []);
        counts.get(k).push(cu);
      });
    });

    counts.forEach(function (list, k) {
      var x = (k % W) * CELL, y = ((k / W) | 0) * CELL;
      var draw = Math.min(list.length, 4);
      for (var j = 0; j < draw; j++) {
        var s = world.sects[list[j].sect];
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(x + 9 + (j % 2) * 12, y + 10 + ((j / 2) | 0) * 12, 4.4, 0, 6.284);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
      }
      if (list.length > 4) {
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(String(list.length), x + 18, y + CELL - 3);
      }
    });

    // 选中格与路径
    if (selected) {
      var sc = world.at(selected.x, selected.y);
      ctx.fillStyle = 'rgba(255,233,168,.22)';
      ctx.fillRect(sc.x * CELL, sc.y * CELL, CELL, CELL);
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
      ctx.strokeRect(sc.x * CELL + 1.5, sc.y * CELL + 1.5, CELL - 3, CELL - 3);
      player.cultivators.forEach(function (cu) {
        if (!cu.alive || !cu.pos || !cu.path || !cu.path.length) return;
        if (cu.pos.x !== sc.x || cu.pos.y !== sc.y) return;
        ctx.strokeStyle = 'rgba(255,233,168,.62)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cu.pos.x * CELL + CELL / 2, cu.pos.y * CELL + CELL / 2);
        for (var p = cu.step || 0; p < cu.path.length; p++) {
          var idx = cu.path[p];
          ctx.lineTo((idx % W) * CELL + CELL / 2, ((idx / W) | 0) * CELL + CELL / 2);
        }
        ctx.stroke();
      });
    }

    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
    }

    // 新手引导：还没派过兵时，山门脉冲高亮
    if (!world.movedOnce && !world.over) {
      var t = (Date.now() % 1400) / 1400;
      var rad = CELL * (0.9 + t * 0.9);
      ctx.beginPath();
      ctx.arc(player.home.x * CELL + CELL / 2, player.home.y * CELL + CELL / 2, rad, 0, 6.284);
      ctx.strokeStyle = 'rgba(255,233,168,' + (1 - t).toFixed(2) + ')';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // 暂停提示
    if (world.paused && !world.over) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(0, 0, W * CELL, 34);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = '15px "Noto Serif SC",serif';
      ctx.textAlign = 'center';
      ctx.fillText('已暂停 · 空格继续', W * CELL / 2, 23);
      ctx.textAlign = 'start';
    }
  }

  function hexA(hex, a) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ---------- HUD ---------- */
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

    document.querySelectorAll('.spd').forEach(function (b) {
      var sp = Number(b.dataset.spd);
      var on = world.paused ? sp === 0 : sp === world.speed;
      b.classList.toggle('on', on);
    });

    renderPanel();
    renderLog();
  }

  /* ---------- 面板 ---------- */
  function renderPanel() {
    var el = document.getElementById('panel');
    var s = player;

    if (selected) {
      var c = world.at(selected.x, selected.y);
      var owner = c.owner ? world.sects[c.owner] : null;
      var here = [];
      Object.keys(world.sects).forEach(function (id) {
        world.sects[id].cultivators.forEach(function (cu) {
          if (cu.alive && cu.pos && cu.pos.x === c.x && cu.pos.y === c.y) here.push(cu);
        });
      });
      var mine = here.filter(function (cu) { return cu.sect === 'A'; });

      var html = '<div class="name">' + D.TERRAIN[c.t].name + ' (' + c.x + ',' + c.y + ')</div>';
      html += '<div class="row"><span>归属</span><b style="color:' + (owner ? owner.color : '#8b9a97') + '">' +
        (owner ? owner.name : '无主') + '</b></div>';
      html += '<div class="row"><span>产出</span><b>' + D.TERRAIN[c.t].yield + '</b></div>';
      if (c.village) html += '<div class="row"><span>村落</span><b>是</b></div>';
      if (c.city) html += '<div class="row"><span>城池</span><b>是</b></div>';
      html += '<div class="row"><span>在场修士</span><b>' + here.length + '</b></div>';

      if (mine.length) {
        html += '<div class="cults">' + mine.map(function (cu) {
          return '<span class="cult">' + cu.name + ' ' + D.REALMS[cu.realm] + '</span>';
        }).join('') + '</div>';
        html += '<div class="hint">再点任意格子：派出此处全部修士（右键同样可以）</div>';
      }
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
        else Wd.addLog(world, '建成城池', 'good');
        renderPanel();
      };
      return;
    }

    // 未选中：宗门总览
    var req = D.LEVEL_REQ[s.level + 1];
    var html2 = '<div class="name">' + s.name + '<span class="tag">' + s.level + ' 级</span></div>';
    html2 += '<div class="row"><span>势力半径</span><b>' + Wd.radiusOf(s.level) + ' 格</b></div>';
    html2 += '<div class="row"><span>城池</span><b>' + s.cities.length + ' / ' + (s.level * 2) + '</b></div>';
    html2 += '<div class="row"><span>修士</span><b>' + s.cultivators.length + ' / ' + s.housing + ' 床位</b></div>';
    if (req) {
      html2 += '<div style="margin-top:8px;color:#7f9793;font-size:11.5px">升级条件</div>';
      html2 += '<div class="row"><span>人口</span><b>' + s.pop + ' / ' + req.pop + '</b></div>';
      html2 += '<div class="row"><span>声望</span><b>' + Math.round(s.rep) + ' / ' + req.rep + '</b></div>';
      html2 += '<div class="row"><span>木 / 矿 / 石</span><b>' + Math.round(s.wood) + ' / ' + Math.round(s.ore) + ' / ' + Math.round(s.stones) + '</b></div>';
    }
    html2 += '<div class="hint">左键点自己的修士选中，再点任意格派兵<br>空格暂停</div>';
    el.innerHTML = html2;
  }

  function renderLog() {
    var el = document.getElementById('log');
    var lines = world.log.slice(-30).reverse().map(function (e) {
      return '<div class="log-line ' + e.kind + '"><em>第' + e.year + '年</em>' + e.text + '</div>';
    }).join('');
    el.innerHTML = lines || '<div class="log-line">——</div>';
  }

  /* ---------- 招募弹窗 ---------- */
  function openRecruit() {
    recruitOpen = true;
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
      d.innerHTML =
        '<div class="cn">' + c.name + ' <span class="tag">' + D.REALMS[c.realm] + '</span></div>' +
        '<div class="cs">' + c.lg.name + ' · ' + c.phys.name + ' · ' + c.age + ' 岁</div>' +
        '<div class="cu">根骨' + c.attrs.gen + ' 力道' + c.attrs.li + ' 内息' + c.attrs.nei +
        '<br>悟性' + c.attrs.wu + ' 神识' + c.attrs.shen + ' 身法' + c.attrs.fa + '</div>';
      d.onclick = function () {
        if (picked.has(i)) { picked.delete(i); d.classList.remove('on'); }
        else if (picked.size < free) { picked.add(i); d.classList.add('on'); }
        else Wd.addLog(world, '床位不足', 'bad');
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
      player.cultivators.push(c);
      Wd.addLog(world, c.name + ' 入门（' + c.lg.name + '）', 'good');
    });
    world.recruitPending = null;
    recruitOpen = false;
    document.getElementById('overlay').classList.remove('show');
    world.paused = false;
  }

  /* ---------- 结局 ---------- */
  function showEnd() {
    var win = world.over === 'win';
    var modal = document.getElementById('modal');
    modal.innerHTML =
      '<h2>' + (win ? '一 统 九 州' : '宗 门 倾 覆') + '</h2>' +
      '<p class="sub">' + (win ? '诸宗俯首，灵脉尽归青云。' : '山门破败，道统断绝。') + '</p>' +
      '<p class="sub">共历 ' + world.year + ' 年，据 ' + Wd.countOwned(world, player) + ' 域。</p>' +
      '<div style="display:flex;justify-content:flex-end"><button class="btn" id="againBtn">重开一世</button></div>';
    document.getElementById('overlay').classList.add('show');
    document.getElementById('againBtn').onclick = function () {
      document.getElementById('overlay').classList.remove('show');
      init((Math.random() * 1e9) | 0);
    };
  }

  /* ---------- 输入 ---------- */
  function cellFromEvent(e) {
    var r = cv.getBoundingClientRect();
    var x = Math.floor((e.clientX - r.left) / r.width * W);
    var y = Math.floor((e.clientY - r.top) / r.height * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return { x: x, y: y };
  }

  cv.addEventListener('mousemove', function (e) { hover = cellFromEvent(e); });
  cv.addEventListener('mouseleave', function () { hover = null; });

  cv.addEventListener('click', function (e) {
    var p = cellFromEvent(e);
    if (!p) return;

    // 再点一次已选中的格子 = 取消
    if (selected && p.x === selected.x && p.y === selected.y) {
      selected = null; renderPanel(); return;
    }

    // 点到自己的队伍 = 选中
    var own = player.cultivators.filter(function (c) {
      return c.alive && c.pos && c.pos.x === p.x && c.pos.y === p.y;
    });
    if (own.length) { selected = p; renderPanel(); return; }

    // 已有选中队伍，点其它格子 = 派兵
    if (selected) {
      var from = world.at(selected.x, selected.y);
      var target = world.at(p.x, p.y);
      var squad = player.cultivators.filter(function (c) {
        return c.alive && c.pos && c.pos.x === from.x && c.pos.y === from.y;
      });
      if (squad.length) {
        var n = 0;
        squad.forEach(function (c) { if (Ai.orderMove(world, c, target)) n++; });
        if (n) {
          world.movedOnce = true;
          Wd.addLog(world, '派出 ' + n + ' 名修士前往 (' + p.x + ',' + p.y + ')', 'war');
          renderPanel();
          return;
        }
      }
    }

    selected = p;
    renderPanel();
  });

  cv.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var p = cellFromEvent(e);
    if (!p || !selected) return;
    var from = world.at(selected.x, selected.y);
    var target = world.at(p.x, p.y);
    var squad = player.cultivators.filter(function (c) {
      return c.alive && c.pos && c.pos.x === from.x && c.pos.y === from.y;
    });
    if (!squad.length) return;
    var n = 0;
    squad.forEach(function (c) { if (Ai.orderMove(world, c, target)) n++; });
    if (n) {
      world.movedOnce = true;
      Wd.addLog(world, '派出 ' + n + ' 名修士前往 (' + p.x + ',' + p.y + ')', 'war');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space') {
      e.preventDefault();
      world.paused = !world.paused;
    }
    if (e.code === 'Escape') { selected = null; renderPanel(); }
  });

  document.querySelectorAll('.spd').forEach(function (b) {
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

  /* ---------- 启动 ---------- */
  if (typeof window !== 'undefined') {
    window.__game = function () { return world; };
    window.__SLG = { Sim: Sim, Ai: Ai, Wd: Wd, D: D };
  }
  init(20261120);
})();

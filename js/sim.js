/* 模拟：移动、战斗、年度与月度事件 */
(function (global) {
  'use strict';
  var D = global.SLGData;
  var Wd = global.SLGWorld;
  var Ai = global.SLGAi;
  var CFG = D.CFG, W = CFG.W, H = CFG.H;

  var monthOf = function (t) { return Math.floor(((t % CFG.YEAR_SECONDS) / CFG.YEAR_SECONDS) * 12); };

  /* 每帧建一次占位索引：idx -> [修士] */
  function buildOcc(world) {
    var m = new Map();
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var list = world.sects[ids[i]].cultivators;
      for (var j = 0; j < list.length; j++) {
        var c = list[j];
        if (!c.alive || !c.pos) continue;
        var k = c.pos.y * W + c.pos.x;
        var arr = m.get(k);
        if (!arr) { arr = []; m.set(k, arr); }
        arr.push(c);
      }
    }
    return m;
  }

  function firstEnemyAt(occ, idx, sectId) {
    var arr = occ.get(idx);
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i].sect !== sectId) return arr[i];
    return null;
  }

  /* ---------- 移动 ---------- */
  function advance(world, dt, occ) {
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      for (var j = 0; j < s.cultivators.length; j++) {
        var c = s.cultivators[j];
        if (!c.alive || !c.path || !c.path.length) continue;

        var guard = 0;
        while (c.step < c.path.length && guard++ < 16) {
          var nextIdx = c.path[c.step];
          var cell = world.cells[nextIdx];
          var cellSpeed = D.TERRAIN[cell.t].speed * (c.speed || 1);
          var stepTime = CFG.CELL_SECONDS / Math.max(0.2, cellSpeed);

          c.progress = (c.progress || 0) + dt / stepTime;
          if (c.progress < 1) break;
          c.progress -= 1;

          // 到达：有敌人就停下开打
          var enemy = firstEnemyAt(occ, nextIdx, c.sect);
          if (enemy && enemy.pos && enemy.pos.x === cell.x && enemy.pos.y === cell.y) {
            c.pos = { x: cell.x, y: cell.y };
            c.path = null; c.step = 0; c.progress = 0;
            c.state = 'fighting';
            cell.battle = true;
            break;
          }

          c.pos = { x: cell.x, y: cell.y };
          if (cell.owner !== c.sect) {
            cell.owner = c.sect; cell.outYears = 0;
            if (cell.village && s.isPlayer) Wd.addLog(world, '占得 (' + cell.x + ',' + cell.y + ') 的村落', 'good');
          }
          c.step++;
        }

        if (c.path && c.step >= c.path.length) {
          c.path = null; c.step = 0; c.state = 'idle'; c.progress = 0;
        }
      }
    }
  }

  /* ---------- 战斗 ---------- */
  function damageSide(list, dmg) {
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i].hp;
    if (total <= 0) return;
    var scale = Math.max(0, (total - dmg) / total);
    for (var j = 0; j < list.length; j++) list[j].hp = list[j].hp * scale;
  }

  function deathRoll(world, side, enemyMax, won, isPlayer) {
    if (!side.length) return 0;
    var myMax = 0, i;
    for (i = 0; i < side.length; i++) if (side[i].realm > myMax) myMax = side[i].realm;
    var ratio = enemyMax > myMax ? Math.pow(D.REALM_MUL[enemyMax] / D.REALM_MUL[myMax], 1.5) : 1;
    var rate = 0.05 * ratio * (won ? 0.5 : 1.6);
    rate = Math.max(0.005, Math.min(0.6, rate));

    // 用小数名额 + 概率进位，避免「每战必死一人」把小宗门钉死
    var exact = side.length * rate;
    var deaths = Math.floor(exact);
    if (world.rnd() < exact - deaths) deaths++;
    deaths = Math.min(side.length, deaths);

    side.sort(function (a, b) { return a.realm - b.realm; });
    for (i = 0; i < deaths; i++) {
      side[i].alive = false;
      if (isPlayer) Wd.addLog(world, side[i].name + ' 战死', 'bad');
    }
    return deaths;
  }

  function rout(world, losers, winners, cell) {
    var winMax = 0, loseMax = 0, i;
    for (i = 0; i < winners.length; i++) if (winners[i].realm > winMax) winMax = winners[i].realm;
    for (i = 0; i < losers.length; i++) if (losers[i].realm > loseMax) loseMax = losers[i].realm;

    deathRoll(world, losers, winMax, false, world.sects[losers[0].sect].isPlayer);
    deathRoll(world, winners, loseMax, true, world.sects[winners[0].sect].isPlayer);

    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    losers.forEach(function (c) {
      if (!c.alive) return;
      c.hp = Math.round(c.maxHp * 0.3);
      c.path = null; c.step = 0; c.state = 'idle'; c.progress = 0;
      for (i = 0; i < dirs.length; i++) {
        var nx = cell.x + dirs[i][0], ny = cell.y + dirs[i][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var t = world.at(nx, ny);
        if (t.owner === c.sect || t.owner === null) { c.pos = { x: nx, y: ny }; break; }
      }
    });

    cell.battle = null;
  }

  function combatTick(world, dt, occ) {
    occ.forEach(function (list) {
      var groups = {};
      var ids = [];
      for (var i = 0; i < list.length; i++) {
        var sid = list[i].sect;
        if (!groups[sid]) { groups[sid] = []; ids.push(sid); }
        groups[sid].push(list[i]);
      }
      if (ids.length < 2) return;

      var cell = world.cells[list[0].pos.y * W + list[0].pos.x];
      cell.battle = true;

      ids.sort(function (a, b) { return groups[b].length - groups[a].length; });
      var A = groups[ids[0]], B = groups[ids[1]];
      var hpA = 0, hpB = 0, powA = 0, powB = 0;
      for (i = 0; i < A.length; i++) { hpA += A[i].hp; powA += A[i].power; }
      for (i = 0; i < B.length; i++) { hpB += B[i].hp; powB += B[i].power; }

      var dmgA = powB * 2 * dt;
      var dmgB = powA * 2 * dt;

      damageSide(A, dmgA);
      damageSide(B, dmgB);

      if (hpA - dmgA <= 0 && hpB - dmgB <= 0) rout(world, A.slice(), B.slice(), cell);
      else if (hpA - dmgA <= 0) rout(world, A.slice(), B.slice(), cell);
      else if (hpB - dmgB <= 0) rout(world, B.slice(), A.slice(), cell);
    });
  }

  /* ---------- 主循环 ---------- */
  function tick(world, dt) {
    if (world.paused || world.over) return;

    world.t += dt;

    var occ = buildOcc(world);
    world._occ = occ;

    advance(world, dt, occ);
    combatTick(world, dt, occ);

    // 月度：6 月招募
    if (monthOf(world.t) >= 6 && world.lastRecruitYear !== world.year) {
      world.lastRecruitYear = world.year;
      doRecruit(world);
    }

    // 年度
    var yNow = Math.floor(world.t / CFG.YEAR_SECONDS) + 1;
    var guard = 0;
    while (world.year < yNow && guard++ < 5) {
      Wd.tickYear(world);
      checkEnd(world);
    }

    // AI
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.isPlayer) continue;
      Ai.aiThink(world, s, dt);
    }
  }

  function doRecruit(world) {
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.isPlayer) {
        var free = s.housing - s.cultivators.length;
        if (free > 0) {
          world.recruitPending = Ai.genCandidates(world, s);
          world.paused = true;
        }
      } else {
        Ai.aiRecruit(world, s);
      }
    }
  }

  function checkEnd(world) {
    var p = world.sects.A;
    var mine = Wd.countOwned(world, p);
    if (mine === 0) { world.over = 'lose'; return; }
    if (mine / (W * H) >= CFG.WIN_RATIO) { world.over = 'win'; return; }
    var aliveRivals = 0;
    Object.keys(world.sects).forEach(function (id) {
      if (id !== 'A' && Wd.countOwned(world, world.sects[id]) > 0) aliveRivals++;
    });
    if (aliveRivals === 0) world.over = 'win';
  }

  var API = {
    tick: tick, advance: advance, combatTick: combatTick, buildOcc: buildOcc,
    occupantsAt: function (world, x, y) {
      var out = [], k = y * W + x;
      Object.keys(world.sects).forEach(function (id) {
        world.sects[id].cultivators.forEach(function (c) {
          if (c.alive && c.pos && c.pos.x === x && c.pos.y === y) out.push(c);
        });
      });
      return out;
    },
    checkEnd: checkEnd, monthOf: monthOf, doRecruit: doRecruit
  };
  global.SLGSim = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

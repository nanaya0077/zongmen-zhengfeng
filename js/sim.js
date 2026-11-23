/* 模拟：移动、战斗、回血、腐坏倒计时、招募与胜负判定 */
(function (global) {
  'use strict';
  var D = global.SLGData;
  var Wd = global.SLGWorld;
  var CFG = D.CFG, W = CFG.W, H = CFG.H;

  var monthOf = function (t) { return Math.floor(((t % CFG.YEAR_SECONDS) / CFG.YEAR_SECONDS) * 12); };

  /* 每帧建一次占位索引：idx -> [修士] */
  function buildOcc(world) {
    var m = new Map();
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.dead) continue;
      var list = s.cultivators;
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

  function moveOcc(occ, c, ox, oy, nx, ny) {
    var oldIdx = oy * W + ox;
    var oldArr = occ.get(oldIdx);
    if (oldArr) {
      var pos = oldArr.indexOf(c);
      if (pos !== -1) oldArr.splice(pos, 1);
      if (oldArr.length === 0) occ.delete(oldIdx);
    }
    var newIdx = ny * W + nx;
    var newArr = occ.get(newIdx);
    if (!newArr) { newArr = []; occ.set(newIdx, newArr); }
    newArr.push(c);
  }

  function firstEnemyAt(occ, idx, sectId) {
    var arr = occ.get(idx);
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].alive && arr[i].sect !== sectId) return arr[i];
    }
    return null;
  }

  /* ---------- 移动（同步维护 occ 与 prevPos） ---------- */
  function advance(world, dt, occ) {
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.dead) continue;
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

          var ox = c.pos.x, oy = c.pos.y;
          var enemy = firstEnemyAt(occ, nextIdx, c.sect);
          c.prevPos = { x: ox, y: oy };
          c.pos = { x: cell.x, y: cell.y };
          moveOcc(occ, c, ox, oy, cell.x, cell.y);

          // 到达：有敌人就停下开打
          if (enemy && enemy.pos && enemy.pos.x === cell.x && enemy.pos.y === cell.y) {
            c.path = null; c.step = 0; c.progress = 0;
            c.state = 'fighting';
            cell.battle = true;
            break;
          }

          if (cell.owner !== c.sect) {
            var hadVillage = cell.village;
            Wd.setCellOwner(world, cell, c.sect);
            if (hadVillage && s.isPlayer) Wd.addLog(world, '占得 (' + cell.x + ',' + cell.y + ') 的村落', 'good');
          }
          c.step++;
        }

        if (c.path && c.step >= c.path.length) {
          c.path = null; c.step = 0; c.state = 'idle'; c.progress = 0;
          if (c.pos) c.prevPos = { x: c.pos.x, y: c.pos.y };
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

    var exact = side.length * rate;
    var deaths = Math.floor(exact);
    if (world.rnd() < exact - deaths) deaths++;
    deaths = Math.min(side.length, deaths);

    side.sort(function (a, b) { return a.realm - b.realm; });
    var actual = 0;
    for (i = 0; i < deaths; i++) {
      var victim = side[i];
      if ((victim.talisman || 0) > 0) {
        victim.talisman--;
        if (isPlayer) Wd.addLog(world, victim.name + ' 的护身符碎裂，逃过一劫', 'war');
        continue;
      }
      victim.alive = false;
      actual++;
      if (isPlayer) Wd.addLog(world, victim.name + ' 战死', 'bad');
    }
    return actual;
  }

  function findRetreatCell(world, sectId, fromCell, occ) {
    var sect = world.sects[sectId];
    var home = sect && sect.home ? sect.home : fromCell;
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var adj = [];
    for (var i = 0; i < dirs.length; i++) {
      var nx = fromCell.x + dirs[i][0], ny = fromCell.y + dirs[i][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      var idx = ny * W + nx;
      var t = world.cells[idx];
      if ((t.owner === sectId || t.owner === null) && !firstEnemyAt(occ, idx, sectId)) {
        adj.push({ cell: t, score: Math.abs(t.x - home.x) + Math.abs(t.y - home.y) });
      }
    }
    if (adj.length) {
      adj.sort(function (a, b) { return a.score - b.score; });
      return adj[0].cell;
    }

    // 四邻皆敌：向己方山门方向 BFS 寻最近安全格
    var startIdx = fromCell.y * W + fromCell.x;
    var visited = new Uint8Array(W * H);
    var queue = [startIdx];
    var dist = new Int16Array(W * H);
    visited[startIdx] = 1;
    var bestCell = null, bestScore = Infinity;

    for (var head = 0; head < queue.length; head++) {
      var cur = queue[head];
      var d = dist[cur];
      if (bestCell && d > dist[bestCell.y * W + bestCell.x] + 3) break;
      var cx = cur % W, cy = (cur / W) | 0;
      for (var k = 0; k < dirs.length; k++) {
        var nx2 = cx + dirs[k][0], ny2 = cy + dirs[k][1];
        if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
        var ni = ny2 * W + nx2;
        if (visited[ni]) continue;
        visited[ni] = 1;
        dist[ni] = d + 1;
        queue.push(ni);
        var tc = world.cells[ni];
        if ((tc.owner === sectId || tc.owner === null) && !firstEnemyAt(occ, ni, sectId)) {
          var sc = (d + 1) * 2 + Math.abs(tc.x - home.x) + Math.abs(tc.y - home.y);
          if (sc < bestScore) { bestScore = sc; bestCell = tc; }
        }
      }
    }
    if (bestCell) return bestCell;

    if (sect && sect.home && (sect.home.x !== fromCell.x || sect.home.y !== fromCell.y)) {
      var hIdx = sect.home.y * W + sect.home.x;
      if (!firstEnemyAt(occ, hIdx, sectId)) return world.cells[hIdx];
    }
    return null;
  }

  function retreatGroup(world, group, cell, occ) {
    if (!group.length) return;
    var sectId = group[0].sect;
    var dest = findRetreatCell(world, sectId, cell, occ);
    for (var i = 0; i < group.length; i++) {
      var c = group[i];
      if (!c.alive) continue;
      if (!dest) {
        c.alive = false;
        continue;
      }
      c.hp = Math.max(1, Math.round(c.maxHp * 0.3));
      c.path = null; c.step = 0; c.state = 'idle'; c.progress = 0; c.post = null;
      var ox = c.pos ? c.pos.x : cell.x, oy = c.pos ? c.pos.y : cell.y;
      c.prevPos = { x: ox, y: oy };
      c.pos = { x: dest.x, y: dest.y };
      moveOcc(occ, c, ox, oy, dest.x, dest.y);
    }
  }

  function combatTick(world, dt, occ) {
    var keys = Array.from(occ.keys());
    for (var kIdx = 0; kIdx < keys.length; kIdx++) {
      var cellIdx = keys[kIdx];
      var list = occ.get(cellIdx);
      if (!list || list.length < 2) continue;

      var groups = {};
      var ids = [];
      for (var i = 0; i < list.length; i++) {
        var cu = list[i];
        if (!cu.alive) continue;
        var sid = cu.sect;
        if (!groups[sid]) { groups[sid] = []; ids.push(sid); }
        groups[sid].push(cu);
      }
      if (ids.length < 2) continue;

      var cell = world.cells[cellIdx];
      cell.battle = true;

      var hp = {}, pow = {}, maxR = {}, defScale = {};
      for (var g = 0; g < ids.length; g++) {
        var id = ids[g], grp = groups[id];
        var hSum = 0, pSum = 0, mr = 0, hasXuanYin = false;
        for (var j = 0; j < grp.length; j++) {
          grp[j].state = 'fighting';
          hSum += grp[j].hp;
          pSum += grp[j].power;
          if (grp[j].realm > mr) mr = grp[j].realm;
          if (grp[j].phys && grp[j].phys.name === '玄阴之体') hasXuanYin = true;
        }
        hp[id] = hSum;
        pow[id] = pSum;
        maxR[id] = mr;

        var defBonus = 0;
        var sect = world.sects[id];
        if (cell.owner === id) {
          if ((sect && sect.home && sect.home.x === cell.x && sect.home.y === cell.y) || cell.city > 0) {
            defBonus += 0.25;
          }
          if (hasXuanYin) defBonus += 0.25;
        }
        defScale[id] = 1 / (1 + defBonus);
      }

      // 交战特效节流触发
      cell._fxT = (cell._fxT || 0) + dt;
      if (cell._fxT >= 0.45) {
        cell._fxT = 0;
        Wd.pushFx(world, {
          type: 'clash',
          x: cell.x, y: cell.y,
          colorA: world.sects[ids[0]].color,
          colorB: world.sects[ids[1]].color
        });
      }

      // 全宗门多方混战互伤
      var dmgIn = {};
      for (g = 0; g < ids.length; g++) dmgIn[ids[g]] = 0;
      for (g = 0; g < ids.length; g++) {
        var attId = ids[g];
        var splitDmg = (pow[attId] * 2 * dt) / (ids.length - 1);
        for (var t = 0; t < ids.length; t++) {
          if (t === g) continue;
          var defId = ids[t];
          dmgIn[defId] += splitDmg * defScale[defId];
        }
      }

      var losers = [], survivors = [];
      for (g = 0; g < ids.length; g++) {
        var curId = ids[g];
        damageSide(groups[curId], dmgIn[curId]);
        if (hp[curId] - dmgIn[curId] <= 0) losers.push(curId);
        else survivors.push(curId);
      }

      if (losers.length > 0) {
        if (survivors.length === 0) {
          // 同归于尽：所有方均按败方对称结算
          var totalDeathsAll = 0;
          for (g = 0; g < losers.length; g++) {
            var lid = losers[g];
            var bestOtherR = 0;
            for (var o = 0; o < ids.length; o++) {
              if (ids[o] !== lid && maxR[ids[o]] > bestOtherR) bestOtherR = maxR[ids[o]];
            }
            totalDeathsAll += deathRoll(world, groups[lid].slice(), bestOtherR, false, world.sects[lid].isPlayer);
            retreatGroup(world, groups[lid].slice(), cell, occ);
          }
          Wd.pushFx(world, {
            type: 'rout', x: cell.x, y: cell.y,
            winnerColor: '#d9e6e2', loserColor: world.sects[losers[0]].color,
            deaths: totalDeathsAll
          });
          cell.battle = null;
        } else {
          // 败方结算与溃退
          var topSurvR = 0;
          for (var sv = 0; sv < survivors.length; sv++) {
            if (maxR[survivors[sv]] > topSurvR) topSurvR = maxR[survivors[sv]];
          }
          var totalDeaths = 0;
          for (g = 0; g < losers.length; g++) {
            var lSid = losers[g];
            totalDeaths += deathRoll(world, groups[lSid].slice(), topSurvR, false, world.sects[lSid].isPlayer);
            retreatGroup(world, groups[lSid].slice(), cell, occ);
          }

          if (survivors.length === 1) {
            var winId = survivors[0];
            var winGroup = groups[winId];
            var topLoseR = 0;
            for (g = 0; g < losers.length; g++) {
              if (maxR[losers[g]] > topLoseR) topLoseR = maxR[losers[g]];
            }
            totalDeaths += deathRoll(world, winGroup.slice(), topLoseR, true, world.sects[winId].isPlayer);

            var aliveWinners = winGroup.filter(function (c) { return c.alive; });
            for (var aw = 0; aw < aliveWinners.length; aw++) {
              aliveWinners[aw].state = 'idle';
            }
            if (aliveWinners.length > 0 && cell.owner !== winId) {
              Wd.setCellOwner(world, cell, winId);
            }
            Wd.pushFx(world, {
              type: 'rout', x: cell.x, y: cell.y,
              winnerColor: world.sects[winId].color,
              loserColor: world.sects[losers[0]].color,
              deaths: totalDeaths
            });
            cell.battle = null;
          }
        }
      }
    }
  }

  /* ---------- 自然回血与按秒腐坏倒计时 ---------- */
  function recoverAndDecayTick(world, dt, occ) {
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.dead) continue;
      for (var j = 0; j < s.cultivators.length; j++) {
        var c = s.cultivators[j];
        if (!c.alive || !c.pos || c.hp >= c.maxHp) continue;
        var cell = world.cells[c.pos.y * W + c.pos.x];
        if (cell.battle) continue;
        var rate = 0.005;
        if (cell.owner === c.sect) {
          var isHub = (s.home && s.home.x === cell.x && s.home.y === cell.y) || cell.city > 0;
          rate = isHub ? 0.03 : 0.015;
        }
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * rate * dt);
      }
    }

    world._decayAcc = (world._decayAcc || 0) + dt;
    if (world._decayAcc >= 1) {
      var stepSec = world._decayAcc;
      world._decayAcc = 0;

      var heldCache = {};
      for (i = 0; i < ids.length; i++) {
        var sid = ids[i];
        if (!world.sects[sid].dead) heldCache[sid] = Wd.heldSet(world, world.sects[sid]);
      }

      for (var idx = 0; idx < world.cells.length; idx++) {
        var cell2 = world.cells[idx];
        if (!cell2.owner) {
          cell2.outSec = 0;
          cell2.outYears = 0;
          continue;
        }
        var set = heldCache[cell2.owner];
        var hasFriendly = false;
        var arr = occ.get(idx);
        if (arr) {
          for (var a = 0; a < arr.length; a++) {
            if (arr[a].alive && arr[a].sect === cell2.owner) { hasFriendly = true; break; }
          }
        }
        var held = (set && set.has(idx)) || cell2.village || cell2.city > 0 || hasFriendly || cell2.battle;
        if (held) {
          cell2.outSec = 0;
          cell2.outYears = 0;
        } else {
          cell2.outSec = (cell2.outSec || 0) + stepSec;
          cell2.outYears = cell2.outSec / CFG.YEAR_SECONDS;
          if (cell2.outSec >= CFG.YEAR_SECONDS) {
            Wd.setCellOwner(world, cell2, null);
            cell2.battle = null;
          }
        }
      }
    }
  }

  /* ---------- 主循环 ---------- */
  function tick(world, dt) {
    if (world.paused || world.over) return;

    world.t += dt;

    var occ = buildOcc(world);
    world._occ = occ;

    advance(world, dt, occ);
    occ = buildOcc(world);
    world._occ = occ;

    combatTick(world, dt, occ);
    occ = buildOcc(world);
    world._occ = occ;

    recoverAndDecayTick(world, dt, occ);

    // 清理残余空战标记
    for (var ci = 0; ci < world.cells.length; ci++) {
      var c = world.cells[ci];
      if (c.battle) {
        var arr = occ.get(ci);
        var seen = null, multi = false;
        if (arr) {
          for (var k = 0; k < arr.length; k++) {
            if (!arr[k].alive) continue;
            if (!seen) seen = arr[k].sect;
            else if (seen !== arr[k].sect) { multi = true; break; }
          }
        }
        if (!multi) c.battle = null;
      }
    }

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
    var Ai = global.SLGAi;
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.isPlayer || s.dead) continue;
      Ai.aiThink(world, s, dt);
    }
  }

  function doRecruit(world) {
    var Ai = global.SLGAi;
    var ids = Object.keys(world.sects);
    for (var i = 0; i < ids.length; i++) {
      var s = world.sects[ids[i]];
      if (s.dead) continue;
      if (s.isPlayer) {
        var free = s.housing - s.cultivators.length;
        if (free > 0) {
          if (s.auto && world.autoRecruit) {
            var taken = Ai.aiRecruit(world, s);
            if (taken.length) Wd.addLog(world, '托管自动收入 ' + taken.length + ' 名弟子', 'good');
          } else {
            world.recruitPending = Ai.genCandidates(world, s);
            world.paused = true;
          }
        }
      } else {
        Ai.aiRecruit(world, s);
      }
    }
  }

  function checkEnd(world) {
    var p = world.sects.A;
    var mine = Wd.countOwned(world, p);
    if (p.dead || mine === 0) { world.over = 'lose'; return; }
    if (mine / (W * H) >= CFG.WIN_RATIO) { world.over = 'win'; return; }
    var aliveRivals = 0;
    Object.keys(world.sects).forEach(function (id) {
      if (id !== 'A' && !world.sects[id].dead && Wd.countOwned(world, world.sects[id]) > 0) aliveRivals++;
    });
    if (aliveRivals === 0) world.over = 'win';
  }

  var API = {
    tick: tick, advance: advance, combatTick: combatTick, buildOcc: buildOcc,
    occupantsAt: function (world, x, y) {
      var out = [];
      Object.keys(world.sects).forEach(function (id) {
        if (world.sects[id].dead) return;
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

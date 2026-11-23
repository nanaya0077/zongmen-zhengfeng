/* AI 与寻路：招募、回防、分队评估与扩张 */
(function (global) {
  'use strict';
  var D = global.SLGData;
  var Wd = global.SLGWorld;
  var W = D.CFG.W, H = D.CFG.H;

  var NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var inMap = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H; };

  function stepCost(cell) { return 1 / D.TERRAIN[cell.t].speed; }

  function MinHeap() { this.a = []; }
  MinHeap.prototype.push = function (p) {
    var a = this.a; a.push(p); var i = a.length - 1;
    while (i > 0) { var j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; var t = a[j]; a[j] = a[i]; a[i] = t; i = j; }
  };
  MinHeap.prototype.pop = function () {
    var a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (var i = 0; ;) {
        var l = 2 * i + 1, r = l + 1, m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        var t = a[m]; a[m] = a[i]; a[i] = t; i = m;
      }
    }
    return top;
  };
  Object.defineProperty(MinHeap.prototype, 'size', { get: function () { return this.a.length; } });

  function dijkstra(world, from) {
    var n = W * H;
    var dist = new Float64Array(n).fill(Infinity);
    var prev = new Int32Array(n).fill(-1);
    var done = new Uint8Array(n);
    var start = from.y * W + from.x;
    dist[start] = 0;
    var pq = new MinHeap(); pq.push([0, start]);
    while (pq.size) {
      var cur = pq.pop(), d = cur[0], idx = cur[1];
      if (done[idx]) continue;
      done[idx] = 1;
      var x = idx % W, y = (idx / W) | 0;
      for (var k = 0; k < 4; k++) {
        var nx = x + NB4[k][0], ny = y + NB4[k][1];
        if (!inMap(nx, ny)) continue;
        var ni = ny * W + nx;
        if (done[ni]) continue;
        var c = d + stepCost(world.cells[ni]);
        if (c < dist[ni]) { dist[ni] = c; prev[ni] = idx; pq.push([c, ni]); }
      }
    }
    return { dist: dist, prev: prev, start: start };
  }

  function buildPath(world, prev, start, goalIdx) {
    if (goalIdx === start) return [];
    var path = [], cur = goalIdx, guard = 0;
    while (cur !== start && cur !== -1 && guard++ < 5000) { path.push(cur); cur = prev[cur]; }
    if (cur === -1) return null;
    path.reverse();
    return path;
  }

  function orderMove(world, cult, cell) {
    if (!cult || !cult.alive || !cult.pos) return false;
    var r = dijkstra(world, cult.pos);
    var idx = cell.y * W + cell.x;
    if (!isFinite(r.dist[idx])) return false;
    var path = buildPath(world, r.prev, r.start, idx);
    if (!path) return false;
    cult.path = path; cult.step = 0; cult.state = 'moving';
    cult.target = { x: cell.x, y: cell.y };
    return true;
  }

  /* ---------- 招募（境界受宗门等级限制） ---------- */
  function genCandidates(world, sect) {
    var n = 2 + sect.level, out = [];
    var maxR = Wd.levelMaxRealm(sect.level);
    for (var i = 0; i < n; i++) {
      out.push(Wd.makeCultivator(world.rnd, sect.id, 'y' + world.year + '_' + i, maxR));
    }
    return out;
  }

  function scoreCandidate(c) {
    return c.lg.rate * 10 + Math.sqrt(D.REALM_MUL[c.realm]) * 6 + c.power * 2;
  }

  function aiRecruit(world, sect) {
    if (sect.dead || !sect.home) return [];
    var free = sect.housing - sect.cultivators.length;
    if (free <= 0) return [];
    var cands = genCandidates(world, sect).sort(function (a, b) { return scoreCandidate(b) - scoreCandidate(a); });
    var take = cands.slice(0, Math.min(free, cands.length));
    take.forEach(function (c) {
      c.pos = { x: sect.home.x, y: sect.home.y };
      c.prevPos = { x: sect.home.x, y: sect.home.y };
      sect.cultivators.push(c);
    });
    return take;
  }

  /* ---------- 派遣、回防与进攻 ---------- */
  var TV = { M: 3.0, P: 2.0, R: 2.2, H: 1.5, F: 1.4, C: 1.0, L: 0.6 };
  function cellValue(c) { return TV[c.t] + (c.village ? 2.0 : 0) + (c.city ? 4.0 : 0); }

  function occupants(world) {
    var m = new Map();
    Object.keys(world.sects).forEach(function (id) {
      if (world.sects[id].dead) return;
      world.sects[id].cultivators.forEach(function (c) {
        if (!c.alive || !c.pos) return;
        var k = c.pos.y * W + c.pos.x;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(c);
      });
    });
    return m;
  }

  function aiBuildCity(world, sect) {
    if (sect.cities.length >= sect.level * 2) return;
    if (sect.wood < D.CFG.CITY_WOOD || sect.ore < D.CFG.CITY_ORE || sect.stones < D.CFG.CITY_STONES) return;
    var best = null, bestD = -1;
    for (var i = 0; i < world.cells.length; i++) {
      var c = world.cells[i];
      if (c.owner !== sect.id || c.city) continue;
      if (c.t !== 'P' && c.t !== 'R') continue;
      if (c.x === sect.home.x && c.y === sect.home.y) continue;
      var d = Math.abs(c.x - sect.home.x) + Math.abs(c.y - sect.home.y);
      if (d > bestD) { bestD = d; best = c; }
    }
    if (best) Wd.buildCity(world, sect, best);
  }

  function aiDevelopResources(world, sect) {
    var nextReq = D.LEVEL_REQ[sect.level + 1];
    var reserveStones = nextReq && sect.pop >= nextReq.pop * 0.7 && sect.rep >= nextReq.rep * 0.6 ? nextReq.stones : 0;
    var spareStones = sect.stones - reserveStones;
    // 灵石消耗：预留升级灵石后，培养高资质弟子或炼制护身符
    if (spareStones >= 360 && sect.cultivators.length) {
      var bestCult = null, bestScore = -1;
      for (var i = 0; i < sect.cultivators.length; i++) {
        var c = sect.cultivators[i];
        if (!c.alive || c.realm >= 6) continue;
        var sc = c.lg.rate + c.power;
        if (sc > bestScore) { bestScore = sc; bestCult = c; }
      }
      if (bestCult) Wd.boostCultivator(world, sect, bestCult);
    }
    if (sect.stones - reserveStones >= 450 && sect.ore >= 160 && sect.cultivators.length) {
      var ace = null, maxP = -1;
      for (var j = 0; j < sect.cultivators.length; j++) {
        var c2 = sect.cultivators[j];
        if (!c2.alive || c2.talisman > 0) continue;
        if (c2.power > maxP) { maxP = c2.power; ace = c2; }
      }
      if (ace) Wd.craftTalisman(world, sect, ace);
    }
    // 铜钱消耗：补缺木材/矿石或招流民
    if (sect.copper >= 450) {
      if (sect.wood < 250) Wd.spendCopper(world, sect, 'wood');
      else if (sect.ore < 200) Wd.spendCopper(world, sect, 'ore');
      else Wd.spendCopper(world, sect, 'pop');
    }
  }

  function enemyPowerAt(occ, idx, myId) {
    var list = occ.get(idx);
    if (!list) return 0;
    var p = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].alive && list[i].sect !== myId) p += list[i].power;
    }
    return p;
  }

  function findThreatenedHub(world, sect, occ) {
    var hubs = [sect.home].concat(sect.cities || []);
    for (var h = 0; h < hubs.length; h++) {
      var hb = hubs[h];
      if (!hb) continue;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 1) continue;
        var nx = hb.x + dx, ny = hb.y + dy;
        if (!inMap(nx, ny)) continue;
        var ePow = enemyPowerAt(occ, ny * W + nx, sect.id);
        if (ePow > 0) {
          var hIdx = hb.y * W + hb.x;
          var list = occ.get(hIdx) || [];
          var defPow = 0;
          for (var i = 0; i < list.length; i++) {
            if (list[i].alive && list[i].sect === sect.id) defPow += list[i].power;
          }
          if (defPow < ePow * 1.1) return world.at(hb.x, hb.y);
        }
      }
    }
    return null;
  }

  function aiThink(world, sect, dt) {
    if (sect.dead || !sect.home) return;
    sect.aiTimer = (sect.aiTimer || 0) + dt;
    if (sect.aiTimer < 6) return;
    sect.aiTimer = 0;

    aiBuildCity(world, sect);
    aiDevelopResources(world, sect);

    var occ = world._occ || new Map();

    // 驻守点丢了或正在战斗完成后重置无效驻守
    sect.cultivators.forEach(function (c) {
      if (!c.post) return;
      var cell = world.cells[c.post.y * W + c.post.x];
      if (cell.owner !== null && cell.owner !== sect.id) c.post = null;
    });

    // 1) 山门/城池遇袭回防
    var threatened = findThreatenedHub(world, sect, occ);
    if (threatened) {
      var defenders = sect.cultivators.filter(function (c) {
        return c.alive && c.pos && c.state !== 'fighting' &&
          (c.pos.x !== threatened.x || c.pos.y !== threatened.y);
      });
      defenders.sort(function (a, b) {
        var da = Math.abs(a.pos.x - threatened.x) + Math.abs(a.pos.y - threatened.y);
        var db = Math.abs(b.pos.x - threatened.x) + Math.abs(b.pos.y - threatened.y);
        return da - db;
      });
      var sent = 0;
      for (var dIdx = 0; dIdx < defenders.length && sent < 3; dIdx++) {
        defenders[dIdx].post = { x: threatened.x, y: threatened.y };
        if (orderMove(world, defenders[dIdx], threatened)) sent++;
      }
      if (sent > 0) return;
    }

    // 2) 收集已被本宗锁定的目标格，避免扎堆选中同一格
    var claimed = new Set();
    sect.cultivators.forEach(function (c) {
      if (!c.alive) return;
      if (c.post) claimed.add(c.post.y * W + c.post.x);
      if (c.path && c.path.length && c.target) claimed.add(c.target.y * W + c.target.x);
    });

    // 3) 筛选闲置修士并按所在格编组（以真实小队战力评估敌方目标）
    var free = sect.cultivators.filter(function (c) {
      return c.alive && c.pos && c.state !== 'fighting' && !c.post && (!c.path || !c.path.length);
    });
    if (!free.length) return;

    var groups = new Map();
    for (var fi = 0; fi < free.length; fi++) {
      var fc = free[fi];
      var fk = fc.pos.y * W + fc.pos.x;
      if (!groups.has(fk)) groups.set(fk, []);
      groups.get(fk).push(fc);
    }

    var ordersLeft = 2;
    groups.forEach(function (squad) {
      if (ordersLeft <= 0 || !squad.length) return;
      var anchor = squad[0];
      var r = dijkstra(world, anchor.pos);
      var squadPower = 0;
      for (var si = 0; si < squad.length; si++) squadPower += squad[si].power;

      // 从小队里派单兵扩荒或整队出击
      var bestExpand = null, bestExpandScore = -1;
      var bestAttack = null, bestAttackScore = -1;

      for (var idx = 0; idx < world.cells.length; idx++) {
        var c = world.cells[idx];
        if (c.owner === sect.id || claimed.has(idx)) continue;
        var d = r.dist[idx];
        if (!isFinite(d) || d > 25) continue;

        if (c.owner === null) {
          var es = cellValue(c) / (d + 1);
          if (es > bestExpandScore) { bestExpandScore = es; bestExpand = c; }
        } else if (world.year >= 8) {
          var def = enemyPowerAt(occ, idx, sect.id);
          if (squadPower > def * 1.25) {
            var isTargetHub = (world.sects[c.owner] && world.sects[c.owner].home &&
              world.sects[c.owner].home.x === c.x && world.sects[c.owner].home.y === c.y) || c.city > 0;
            var as = (cellValue(c) + (isTargetHub ? 6 : 3)) / (d + 1);
            if (as > bestAttackScore) { bestAttackScore = as; bestAttack = c; }
          }
        }
      }

      if (bestAttack && (!bestExpand || bestAttackScore >= bestExpandScore * 1.15)) {
        var attIdx = bestAttack.y * W + bestAttack.x;
        claimed.add(attIdx);
        squad.forEach(function (cu) {
          cu.post = { x: bestAttack.x, y: bestAttack.y };
          orderMove(world, cu, bestAttack);
        });
        ordersLeft--;
      } else if (bestExpand) {
        var expIdx = bestExpand.y * W + bestExpand.x;
        claimed.add(expIdx);
        anchor.post = { x: bestExpand.x, y: bestExpand.y };
        orderMove(world, anchor, bestExpand);
        ordersLeft--;
      }
    });
  }

  var API = {
    dijkstra: dijkstra, buildPath: buildPath, orderMove: orderMove,
    genCandidates: genCandidates, scoreCandidate: scoreCandidate,
    aiRecruit: aiRecruit, aiThink: aiThink, cellValue: cellValue, occupants: occupants,
    stepCost: stepCost
  };
  global.SLGAi = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

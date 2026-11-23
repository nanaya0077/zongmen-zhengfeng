/* AI 与寻路：招募、派遣、进攻 */
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
    if (!cult || !cult.alive) return false;
    var r = dijkstra(world, cult.pos);
    var idx = cell.y * W + cell.x;
    if (!isFinite(r.dist[idx])) return false;
    var path = buildPath(world, r.prev, r.start, idx);
    if (!path) return false;
    cult.path = path; cult.step = 0; cult.state = 'moving';
    cult.target = { x: cell.x, y: cell.y };
    return true;
  }

  /* ---------- 招募 ---------- */
  function genCandidates(world, sect) {
    var n = 2 + sect.level, out = [];
    for (var i = 0; i < n; i++) out.push(Wd.makeCultivator(world.rnd, sect.id, 'y' + world.year + '_' + i));
    return out;
  }

  function scoreCandidate(c) {
    return c.lg.rate * 10 + Math.sqrt(D.REALM_MUL[c.realm]) * 6;
  }

  function aiRecruit(world, sect) {
    var free = sect.housing - sect.cultivators.length;
    if (free <= 0) return [];
    var cands = genCandidates(world, sect).sort(function (a, b) { return scoreCandidate(b) - scoreCandidate(a); });
    var take = cands.slice(0, Math.min(free, cands.length));
    take.forEach(function (c) { c.pos = { x: sect.home.x, y: sect.home.y }; sect.cultivators.push(c); });
    return take;
  }

  /* ---------- 派遣与进攻 ---------- */
  var TV = { M: 3.0, P: 2.0, R: 2.2, H: 1.5, F: 1.2, C: 1.0, L: 0.6 };
  function cellValue(c) { return TV[c.t] + (c.village ? 2.0 : 0); }

  function occupants(world) {
    var m = new Map();
    Object.keys(world.sects).forEach(function (id) {
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
      // 优先建在离山门最远的地盘上，把势力范围往外推
      var d = Math.abs(c.x - sect.home.x) + Math.abs(c.y - sect.home.y);
      if (d > bestD) { bestD = d; best = c; }
    }
    if (best) Wd.buildCity(world, sect, best);
  }

  function aiThink(world, sect, dt) {
    sect.aiTimer = (sect.aiTimer || 0) + dt;
    if (sect.aiTimer < 6) return;
    sect.aiTimer = 0;

    aiBuildCity(world, sect);

    var occ = world._occ || new Map();

    // 驻守点丢了就重新找
    sect.cultivators.forEach(function (c) {
      if (!c.post) return;
      var cell = world.cells[c.post.y * W + c.post.x];
      if (cell.owner !== null && cell.owner !== sect.id) c.post = null;
    });

    var free = sect.cultivators.filter(function (c) {
      return c.alive && c.pos && !c.post && (!c.path || !c.path.length);
    });
    if (!free.length) return;

    var maxPower = 0;
    sect.cultivators.forEach(function (c) { if (c.alive && c.power > maxPower) maxPower = c.power; });

    var batch = free.slice(0, 2);
    batch.forEach(function (cult) {
      var r = dijkstra(world, cult.pos);
      var best = null, bestScore = -1;

      for (var idx = 0; idx < world.cells.length; idx++) {
        var c = world.cells[idx];
        if (c.owner === sect.id) continue;
        var d = r.dist[idx];
        if (!isFinite(d) || d > 25) continue;

        var score = 0;
        if (c.owner === null) {
          score = cellValue(c) / (d + 1);
        } else if (world.year >= 8) {          // 前八年休战，只占地不打人
          var def = 0;
          var list = occ.get(idx);
          if (list) for (var i = 0; i < list.length; i++) def += list[i].power;
          if (maxPower > def * 1.4) score = (cellValue(c) + 3) / (d + 1);
        }
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (best) {
        cult.post = { x: best.x, y: best.y };
        orderMove(world, cult, best);
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

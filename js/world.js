/* 世界：地图生成、宗门、修士、产出与年度结算 */
(function (global) {
  'use strict';
  var D = global.SLGData;
  var CFG = D.CFG, TERRAIN = D.TERRAIN;

  var W = CFG.W, H = CFG.H, NT = W * H;

  /* ---------- 随机 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var key = function (x, y) { return x + ',' + y; };

  /* ---------- 地图生成 ---------- */
  function generateMap(seed) {
    var rnd = mulberry32(seed);
    var ph = [], i;
    for (i = 0; i < 6; i++) ph.push(rnd() * 6.283);

    function height(x, y) {
      var v = 0.50;
      v += 0.17 * Math.sin(x * 0.27 + ph[0]) * Math.cos(y * 0.21 + ph[1]);
      v += 0.10 * Math.sin((x + y) * 0.17 + ph[2]);
      v += 0.07 * Math.sin((x - y) * 0.33 + ph[3]);
      var cy = 5.0 + 2.4 * Math.sin(x * 0.19 + ph[4]);
      v += Math.max(0, 0.28 - Math.abs(y - cy) * 0.052);
      var d2 = Math.hypot(x - 9, y - 15);
      v += Math.max(0, 0.20 - d2 * 0.045);
      var d = Math.min(x, y, W - 1 - x, H - 1 - y);
      v -= Math.max(0, 0.20 - d * 0.06);
      return clamp(v, 0, 1);
    }

    var h = [], y, x;
    for (y = 0; y < H; y++) { h.push([]); for (x = 0; x < W; x++) h[y].push(height(x, y)); }

    var T = [], NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (y = 0; y < H; y++) { T.push([]); for (x = 0; x < W; x++) T[y].push(null); }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++)
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) T[y][x] = 'C';

    function river(sx, sy, minLen, maxLen) {
      var dist = [], prev = [], done = [], yy, xx;
      for (yy = 0; yy < H; yy++) { dist.push(new Array(W).fill(Infinity)); prev.push(new Array(W).fill(null)); done.push(new Array(W).fill(false)); }
      dist[sy][sx] = 0;
      var pq = [[0, sx, sy]];
      while (pq.length) {
        pq.sort(function (a, b) { return a[0] - b[0]; });
        var cur = pq.shift(), d = cur[0], cx = cur[1], cy = cur[2];
        if (done[cy][cx]) continue;
        done[cy][cx] = true;
        if (T[cy][cx] === 'C') {
          var path = [], px = cx, py = cy;
          while (prev[py][px]) { path.push([px, py]); var p = prev[py][px]; px = p[0]; py = p[1]; }
          if (path.length < minLen || path.length > maxLen) return 0;
          for (var k = 0; k < path.length; k++) { var q = path[k]; if (!T[q[1]][q[0]]) T[q[1]][q[0]] = 'R'; }
          return path.length;
        }
        for (var n = 0; n < 4; n++) {
          var nx = cx + NB[n][0], ny = cy + NB[n][1];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          var c = d + h[ny][nx] + 0.02;
          if (c < dist[ny][nx]) { dist[ny][nx] = c; prev[ny][nx] = [cx, cy]; pq.push([c, nx, ny]); }
        }
      }
      return 0;
    }

    var peaks = [];
    for (y = 2; y < H - 2; y++) for (x = 2; x < W - 2; x++) peaks.push([h[y][x], x, y]);
    peaks.sort(function (a, b) { return b[0] - a[0]; });
    var made = 0;
    for (i = 0; i < peaks.length && made < 3; i++) {
      var pk = peaks[i];
      if (T[pk[2]][pk[1]]) continue;
      if (river(pk[1], pk[2], 10, 34) > 0) made++;
    }

    var cand = [];
    for (y = 3; y < H - 3; y++) for (x = 3; x < W - 3; x++) {
      if (T[y][x]) continue;
      var free = true;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (T[y + dy][x + dx]) free = false;
      if (free) cand.push([h[y][x], x, y]);
    }
    cand.sort(function (a, b) { return a[0] - b[0]; });
    var lakes = 0;
    for (i = 0; i < cand.length && lakes < 3; i++) {
      var lx = cand[i][1], ly = cand[i][2];
      if (T[ly][lx] || T[ly][lx + 1] || T[ly + 1][lx] || T[ly + 1][lx + 1]) continue;
      T[ly][lx] = T[ly][lx + 1] = T[ly + 1][lx] = T[ly + 1][lx + 1] = 'L';
      lakes++;
    }

    var dist2 = [], q = [];
    for (y = 0; y < H; y++) { dist2.push(new Array(W).fill(999)); }
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (T[y][x]) { dist2[y][x] = 0; q.push([x, y]); }
    for (i = 0; i < q.length; i++) {
      var cx2 = q[i][0], cy2 = q[i][1];
      for (var n2 = 0; n2 < 4; n2++) {
        var nx2 = cx2 + NB[n2][0], ny2 = cy2 + NB[n2][1];
        if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
        if (dist2[ny2][nx2] > dist2[cy2][cx2] + 1) { dist2[ny2][nx2] = dist2[cy2][cx2] + 1; q.push([nx2, ny2]); }
      }
    }

    var land = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (!T[y][x]) land.push([x, y]);
    land.sort(function (a, b) { return h[b[1]][b[0]] - h[a[1]][a[0]]; });
    var nM = Math.round(NT * 0.16), nH = Math.round(NT * 0.15), nF = Math.round(NT * 0.19);
    land.forEach(function (p, idx) {
      if (idx < nM) T[p[1]][p[0]] = 'M';
      else if (idx < nM + nH) T[p[1]][p[0]] = 'H';
    });
    var rest = land.slice(nM + nH).sort(function (a, b) { return dist2[a[1]][a[0]] - dist2[b[1]][b[0]]; });
    rest.forEach(function (p, idx) { T[p[1]][p[0]] = idx < nF ? 'F' : 'P'; });

    for (var pass = 0; pass < 2; pass++) {
      var S = T.map(function (r) { return r.slice(); });
      for (y = 1; y < H - 1; y++) for (x = 1; x < W - 1; x++) {
        var c0 = T[y][x];
        if (c0 === 'C' || c0 === 'R' || c0 === 'L') continue;
        var v = {}; v[c0] = 1.2;
        for (var ddy = -1; ddy <= 1; ddy++) for (var ddx = -1; ddx <= 1; ddx++) {
          if (!ddx && !ddy) continue;
          var tt = T[y + ddy][x + ddx];
          if (tt === 'C' || tt === 'R' || tt === 'L') continue;
          v[tt] = (v[tt] || 0) + 1;
        }
        var best = c0, bv = -1;
        for (var k2 in v) if (v[k2] > bv) { bv = v[k2]; best = k2; }
        S[y][x] = best;
      }
      T = S;
    }
    return T;
  }

  /* ---------- 修士 ---------- */
  var SURNAME = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜';
  var GIVEN = '玄清云风尘霜雪月星辰虚真一凡心道明';

  function pickWeighted(rnd, arr) {
    var r = rnd(), acc = 0;
    for (var i = 0; i < arr.length; i++) { acc += arr[i].p; if (r < acc) return arr[i]; }
    return arr[arr.length - 1];
  }

  function makeCultivator(rnd, sectId, seq) {
    var lg = pickWeighted(rnd, D.LINGGEN);
    var ph = pickWeighted(rnd, D.PHYSIQUE);
    var at = function () { return Math.round(clamp((rnd() + rnd() + rnd()) / 3, 0, 1) * 100); };
    var attrs = { gen: at(), li: at(), nei: at(), wu: at(), shen: at(), fa: at() };

    var realm = 0;
    if (rnd() > 0.90) {
      var r = rnd();
      for (var i = 1; i < D.REALMS.length; i++) {
        var w = 0.8 * Math.pow(0.2, i - 1);
        if (r < w) { realm = i; break; }
        r -= w;
      }
    }

    var c = {
      id: sectId + '-' + (seq || 0),
      name: SURNAME[(rnd() * SURNAME.length) | 0] + GIVEN[(rnd() * GIVEN.length) | 0] + GIVEN[(rnd() * GIVEN.length) | 0],
      sect: sectId, realm: realm, lg: lg, phys: ph, attrs: attrs,
      age: 16 + Math.floor(rnd() * 10),
      cult: 0,
      pos: null, path: null, step: 0, state: 'idle',
      post: null, alive: true
    };
    recalc(c);
    c.hp = c.maxHp;
    return c;
  }

  function recalc(c) {
    var lgMul = 0.5 * c.lg.n;
    c.maxHp = Math.round(D.REALM_MUL[c.realm] * c.attrs.gen * 2);
    c.power = D.REALM_MUL[c.realm] * lgMul * (c.attrs.nei / 50) * (c.attrs.li / 50) * (1 + c.phys.atk);
    c.speed = 0.7 + c.attrs.fa / 167;
  }

  function cultivationRate(c, level) {
    var chaos = c.phys.chaos ? c.lg.n : 1;
    return 30 * c.lg.rate * (1 + c.phys.spd) * chaos * (1 + 0.05 * level);
  }

  /* ---------- 世界 ---------- */
  function createWorld(seed) {
    var rnd = mulberry32(seed ^ 0x9e3779b9);
    var grid = generateMap(seed);
    var cells = [], y, x;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      cells.push({ x: x, y: y, t: grid[y][x], owner: null, village: false, city: 0, outYears: 0, battle: null });
    }
    var at = function (x2, y2) { return cells[y2 * W + x2]; };

    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var p = (c.t === 'P' || c.t === 'R') ? 0.12 : (c.t === 'F' || c.t === 'H') ? 0.05 : (c.t === 'M' || c.t === 'L') ? 0.02 : 0;
      if (rnd() < p) c.village = true;
    }

    var sects = {};
    D.SECT_DEFS.forEach(function (d) {
      sects[d.id] = {
        id: d.id, name: d.name, color: d.color,
        level: 1, stones: 200, copper: 100, pop: 40, rep: 0,
        wood: 0, ore: 0, housing: 10,
        home: null, cultivators: [], cities: [],
        isPlayer: d.id === 'A'
      };
    });

    var starts = [];
    D.SECT_DEFS.forEach(function (d) {
      var cands = cells.filter(function (c) {
        if (c.t !== 'P' && c.t !== 'R') return false;
        if (c.village) return false;
        for (var j = 0; j < starts.length; j++) {
          if (Math.abs(starts[j].x - c.x) + Math.abs(starts[j].y - c.y) < 7) return false;
        }
        return hasMountainNear(cells, c.x, c.y, 5);
      });
      if (!cands.length) {
        cands = cells.filter(function (c) {
          if (c.t !== 'P' && c.t !== 'R') return false;
          for (var j = 0; j < starts.length; j++) {
            if (Math.abs(starts[j].x - c.x) + Math.abs(starts[j].y - c.y) < 5) return false;
          }
          return true;
        });
      }
      var pick = cands[(rnd() * cands.length) | 0] || cells.filter(function (c) { return c.t === 'P'; })[0];
      starts.push(pick);
      pick.owner = d.id;
      sects[d.id].home = { x: pick.x, y: pick.y };

      for (var k = 0; k < 3; k++) {
        var cu = makeCultivator(rnd, d.id, k + 1);
        cu.pos = { x: pick.x, y: pick.y };
        sects[d.id].cultivators.push(cu);
      }
    });

    var world = {
      seed: seed, rnd: rnd, cells: cells, at: at, sects: sects,
      year: 1, t: 0, speed: CFG.DEFAULT_SPEED, paused: false,
      log: [], recruitPending: null, over: null, selected: null, hover: null
    };
    return world;
  }

  function hasMountainNear(cells, x, y, r) {
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (cells[ny * W + nx].t === 'M') return true;
    }
    return false;
  }

  function radiusOf(level) { return Math.min(5, 1 + Math.floor((level - 1) / 2)); }

  function addLog(world, text, kind) {
    world.log.push({ text: text, kind: kind || 'info', year: world.year });
    if (world.log.length > 200) world.log.shift();
  }

  /* 势力范围：山门半径 + 每座城 3 格 */
  function heldSet(world, sect) {
    var set = new Set();
    var r = radiusOf(sect.level);
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      var nx = sect.home.x + dx, ny = sect.home.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      set.add(ny * W + nx);
    }
    sect.cities.forEach(function (c) {
      var cr = CFG.CITY_RADIUS;
      for (var dy2 = -cr; dy2 <= cr; dy2++) for (var dx2 = -cr; dx2 <= cr; dx2++) {
        if (Math.abs(dx2) + Math.abs(dy2) > cr) continue;
        var nx2 = c.x + dx2, ny2 = c.y + dy2;
        if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
        set.add(ny2 * W + nx2);
      }
    });
    return set;
  }

  function countTerrain(world, sect, t) {
    var n = 0;
    for (var i = 0; i < world.cells.length; i++) {
      var c = world.cells[i];
      if (c.owner === sect.id && c.t === t) n++;
    }
    return n;
  }
  function countOwned(world, sect) {
    var n = 0;
    for (var i = 0; i < world.cells.length; i++) if (world.cells[i].owner === sect.id) n++;
    return n;
  }
  function countVillages(world, sect) {
    var n = 0;
    for (var i = 0; i < world.cells.length; i++) {
      var c = world.cells[i];
      if (c.owner === sect.id && c.village) n++;
    }
    return n;
  }

  /* 年度结算 */
  function tickYear(world) {
    var ids = Object.keys(world.sects);

    ids.forEach(function (id) {
      var s = world.sects[id];
      var mountains = countTerrain(world, s, 'M');
      var villages = countVillages(world, s);
      var cities = s.cities.length;

      // 山门自带一处灵脉：否则没占到山的宗门会永久卡死在 1 级
      s.stones += 30 + mountains * 30;
      var cap = 200 + s.level * 80 + villages * 20 + cities * CFG.CITY_POP;
      s.pop = Math.min(cap, Math.round(s.pop * 1.08));
      var workers = Math.floor(s.pop * 0.375);
      s.copper += Math.round(s.pop * 0.6);
      s.wood += Math.floor(workers * 0.4) * 8;
      s.ore += Math.floor(workers * 0.3) * 8;
      s.rep += 1 + villages * 2;

      // 住房
      while (s.wood >= CFG.HOUSING_WOOD && s.housing < 160) {
        s.wood -= CFG.HOUSING_WOOD; s.housing += CFG.HOUSING_BEDS;
      }
      // 升级
      var req = D.LEVEL_REQ[s.level + 1];
      if (req && s.pop >= req.pop && s.rep >= req.rep &&
        s.wood >= req.wood && s.ore >= req.ore && s.stones >= req.stones) {
        s.wood -= req.wood; s.ore -= req.ore; s.stones -= req.stones;
        s.level++;
        addLog(world, s.name + ' 晋为 ' + s.level + ' 级宗门', 'good');
      }
    });

    // 修士：修炼、衰老
    ids.forEach(function (id) {
      var s = world.sects[id];
      for (var i = s.cultivators.length - 1; i >= 0; i--) {
        var c = s.cultivators[i];
        if (!c.alive) { s.cultivators.splice(i, 1); continue; }
        c.age++;
        if (c.age > D.REALM_LIFE[c.realm]) {
          c.alive = false; s.cultivators.splice(i, 1);
          if (s.isPlayer) addLog(world, c.name + ' 寿元耗尽，坐化', 'bad');
          continue;
        }
        c.cult += cultivationRate(c, s.level);
        var need = D.REALM_NEED[c.realm + 1];
        if (need && c.cult >= need && c.realm < 6) {
          c.realm++; c.cult = 0; recalc(c); c.hp = c.maxHp;
          if (s.isPlayer) addLog(world, c.name + ' 突破至 ' + D.REALMS[c.realm], 'good');
        }
      }
    });

    // 自动并入 + 腐烂
    ids.forEach(function (id) {
      var s = world.sects[id];
      var set = heldSet(world, s);
      set.forEach(function (idx) {
        var c = world.cells[idx];
        if (c.owner === null) { c.owner = id; c.outYears = 0; }
      });
    });

    var occupied = new Set();
    ids.forEach(function (id) {
      world.sects[id].cultivators.forEach(function (c) {
        if (c.alive && c.pos) occupied.add(c.pos.y * W + c.pos.x);
      });
    });

    var heldCache = {};
    ids.forEach(function (id) { heldCache[id] = heldSet(world, world.sects[id]); });

    world.cells.forEach(function (c) {
      if (!c.owner) return;
      var set = heldCache[c.owner];
      var held = set.has(c.y * W + c.x) || c.village || c.city > 0 || occupied.has(c.y * W + c.x);
      if (held) { c.outYears = 0; return; }
      c.outYears++;
      if (c.outYears >= 1) {
        c.owner = null; c.outYears = 0; c.battle = null;
      }
    });

    world.year++;
  }

  function buildCity(world, sect, cell) {
    if (sect.cities.length >= sect.level * 2) return '城池已达上限';
    if (cell.owner !== sect.id) return '不是自己的地';
    if (cell.city) return '已有城池';
    if (cell.t !== 'P' && cell.t !== 'R') return '只能建在平原或河流';
    if (sect.wood < CFG.CITY_WOOD || sect.ore < CFG.CITY_ORE || sect.stones < CFG.CITY_STONES) return '材料不足';
    sect.wood -= CFG.CITY_WOOD; sect.ore -= CFG.CITY_ORE; sect.stones -= CFG.CITY_STONES;
    cell.city = 1;
    sect.cities.push({ x: cell.x, y: cell.y });
    if (sect.isPlayer) addLog(world, '在 (' + cell.x + ',' + cell.y + ') 建成城池', 'good');
    return null;
  }

  var API = {
    W: W, H: H, NT: NT,
    generateMap: generateMap, createWorld: createWorld,
    makeCultivator: makeCultivator, recalc: recalc, cultivationRate: cultivationRate,
    radiusOf: radiusOf, heldSet: heldSet, hasMountainNear: hasMountainNear,
    countTerrain: countTerrain, countOwned: countOwned, countVillages: countVillages,
    tickYear: tickYear, addLog: addLog, buildCity: buildCity, key: key, mulberry32: mulberry32
  };
  global.SLGWorld = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

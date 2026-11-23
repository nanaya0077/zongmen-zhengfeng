/* 世界：地图生成、宗门、修士、产出、领地易主与年度结算 */
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

    T.heights = h;
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

  function levelMaxRealm(level) {
    return Math.min(4, Math.floor((Math.max(1, level) - 1) / 2));
  }

  function makeCultivator(rnd, sectId, seq, maxRealm) {
    var lg = pickWeighted(rnd, D.LINGGEN);
    var ph = pickWeighted(rnd, D.PHYSIQUE);
    var at = function () { return Math.round(clamp((rnd() + rnd() + rnd()) / 3, 0, 1) * 100); };
    var attrs = { gen: at(), li: at(), nei: at(), wu: at(), shen: at(), fa: at() };

    var capRealm = (maxRealm === undefined || maxRealm === null) ? 6 : maxRealm;
    var realm = 0;
    if (capRealm > 0 && rnd() > 0.90) {
      var r = rnd();
      for (var i = 1; i <= capRealm && i < D.REALMS.length; i++) {
        var w = 0.8 * Math.pow(0.2, i - 1);
        if (r < w) { realm = i; break; }
        r -= w;
      }
      if (realm === 0 && rnd() < 0.08) realm = Math.min(1, capRealm);
    }

    var c = {
      id: sectId + '-' + (seq || 0),
      name: SURNAME[(rnd() * SURNAME.length) | 0] + GIVEN[(rnd() * GIVEN.length) | 0] + GIVEN[(rnd() * GIVEN.length) | 0],
      sect: sectId, realm: realm, lg: lg, phys: ph, attrs: attrs,
      age: 16 + Math.floor(rnd() * 10),
      cult: 0,
      pos: null, prevPos: null, path: null, step: 0, state: 'idle',
      post: null, alive: true, talisman: 0
    };
    recalc(c);
    c.hp = c.maxHp;
    return c;
  }

  function recalc(c) {
    var lgMul = 0.5 * c.lg.n;
    var shenMul = 0.9 + (c.attrs.shen / 50) * 0.1;
    c.maxHp = Math.round(D.REALM_MUL[c.realm] * c.attrs.gen * 2);
    c.power = D.REALM_MUL[c.realm] * lgMul * (c.attrs.nei / 50) * (c.attrs.li / 50) * (1 + c.phys.atk) * shenMul;
    c.speed = 0.7 + c.attrs.fa / 167;
    c.sight = 2 + Math.floor(c.realm * 0.5 + c.attrs.shen / 35);
  }

  function cultivationRate(c, level) {
    var chaos = c.phys.chaos ? c.lg.n : 1;
    var wuMul = 0.8 + (c.attrs.wu / 50) * 0.2;
    return 30 * c.lg.rate * (1 + c.phys.spd) * chaos * (1 + 0.05 * level) * wuMul;
  }

  /* ---------- 特效与日志 ---------- */
  function addLog(world, text, kind) {
    world.logSeq = (world.logSeq || 0) + 1;
    world.log.push({ id: world.logSeq, text: text, kind: kind || 'info', year: world.year });
    if (world.log.length > 200) world.log.shift();
  }

  function pushFx(world, evt) {
    if (!world.fxEvents) world.fxEvents = [];
    world.fxEvents.push(evt);
    if (world.fxEvents.length > 250) world.fxEvents.shift();
  }

  /* ---------- 世界 ---------- */
  function createWorld(seed) {
    var rnd = mulberry32(seed ^ 0x9e3779b9);
    var grid = generateMap(seed);
    var heights = grid.heights;
    var cells = [], y, x;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      cells.push({
        x: x, y: y, t: grid[y][x], h: heights ? heights[y][x] : 0.5,
        owner: null, village: false, city: 0, outYears: 0, outSec: 0, battle: null
      });
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
        isPlayer: d.id === 'A', dead: false
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
        var cu = makeCultivator(rnd, d.id, k + 1, 0);
        cu.pos = { x: pick.x, y: pick.y };
        cu.prevPos = { x: pick.x, y: pick.y };
        sects[d.id].cultivators.push(cu);
      }
    });

    var world = {
      seed: seed, rnd: rnd, cells: cells, at: at, sects: sects,
      year: 1, t: 0, speed: CFG.DEFAULT_SPEED, paused: false,
      log: [], logSeq: 0, fxEvents: [], recruitPending: null,
      over: null, selected: null, hover: null, autoRecruit: false
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

  /* 势力范围：山门半径 + 每座城 3 格 */
  function heldSet(world, sect) {
    var set = new Set();
    if (!sect || sect.dead || !sect.home) return set;
    var r = radiusOf(sect.level);
    for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      var nx = sect.home.x + dx, ny = sect.home.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      set.add(ny * W + nx);
    }
    sect.cities.forEach(function (c) {
      var cell = world.at(c.x, c.y);
      if (!cell || cell.owner !== sect.id || !cell.city) return;
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

  function popCapOf(world, s) {
    var villages = countVillages(world, s);
    var plains = countTerrain(world, s, 'P');
    var rivers = countTerrain(world, s, 'R');
    return 120 + s.level * 80 + villages * 35 + s.cities.length * CFG.CITY_POP + (plains + rivers) * 4;
  }

  /* ---------- 领地、城池与山门易主统一入口 ---------- */
  function eliminateSect(world, oldSect, winner, cell) {
    if (!oldSect || oldSect.dead) return;
    oldSect.dead = true;
    oldSect.cities = [];

    var recruited = 0;
    if (winner && !winner.dead) {
      winner.rep += 50;
      ['stones', 'wood', 'ore', 'copper'].forEach(function (k) {
        var loot = Math.round((oldSect[k] || 0) * 0.4);
        winner[k] += loot;
        oldSect[k] = Math.max(0, (oldSect[k] || 0) - loot);
      });

      var winMax = 0;
      for (var w = 0; w < winner.cultivators.length; w++) {
        if (winner.cultivators[w].alive && winner.cultivators[w].realm > winMax) {
          winMax = winner.cultivators[w].realm;
        }
      }

      for (var i = 0; i < oldSect.cultivators.length; i++) {
        var cu = oldSect.cultivators[i];
        if (!cu.alive) continue;
        var free = winner.housing - winner.cultivators.length;
        var rate = clamp(0.75 - 0.12 * cu.realm + (winMax - cu.realm) * 0.10, 0.10, 0.85);
        if (free > 0 && world.rnd() < rate) {
          cu.sect = winner.id;
          cu.path = null;
          cu.step = 0;
          cu.progress = 0;
          cu.post = null;
          cu.state = 'idle';
          if (!cu.pos) cu.pos = { x: cell.x, y: cell.y };
          cu.prevPos = { x: cu.pos.x, y: cu.pos.y };
          winner.cultivators.push(cu);
          recruited++;
        } else {
          cu.alive = false;
        }
      }
    } else {
      for (var j = 0; j < oldSect.cultivators.length; j++) oldSect.cultivators[j].alive = false;
    }
    oldSect.cultivators = [];

    for (var k2 = 0; k2 < world.cells.length; k2++) {
      var c = world.cells[k2];
      if (c.owner !== oldSect.id) continue;
      if (winner && !winner.dead && Math.abs(c.x - cell.x) + Math.abs(c.y - cell.y) <= 2) {
        c.owner = winner.id;
        c.outYears = 0;
        c.outSec = 0;
      } else {
        c.owner = null;
        c.city = 0;
        c.outYears = 0;
        c.outSec = 0;
        c.battle = null;
      }
    }

    var msg = (winner ? winner.name : '天劫') + ' 攻破 (' + cell.x + ',' + cell.y + ')，灭门 ' + oldSect.name;
    if (recruited > 0) msg += '，收编 ' + recruited + ' 人';
    addLog(world, msg, oldSect.isPlayer ? 'bad' : (winner && winner.isPlayer ? 'good' : 'war'));
    pushFx(world, {
      type: 'sectDestroyed',
      x: cell.x,
      y: cell.y,
      color: winner ? winner.color : '#e05252',
      name: oldSect.name
    });
  }

  function setCellOwner(world, cell, newOwner) {
    if (!cell) return;
    var oldOwner = cell.owner;
    if (oldOwner === newOwner) {
      cell.outYears = 0;
      cell.outSec = 0;
      return;
    }

    // 同步城池归属与声望
    if (cell.city > 0) {
      if (oldOwner && world.sects[oldOwner]) {
        var oldS = world.sects[oldOwner];
        oldS.cities = oldS.cities.filter(function (ct) { return ct.x !== cell.x || ct.y !== cell.y; });
        oldS.rep = Math.max(0, oldS.rep - 10);
      }
      if (newOwner && world.sects[newOwner] && !world.sects[newOwner].dead) {
        var newS = world.sects[newOwner];
        var exists = newS.cities.some(function (ct) { return ct.x === cell.x && ct.y === cell.y; });
        if (!exists) newS.cities.push({ x: cell.x, y: cell.y });
        newS.rep += 20;
        if (newS.isPlayer) addLog(world, '攻占 (' + cell.x + ',' + cell.y + ') 城池，声望 +20', 'good');
      } else {
        cell.city = 0;
      }
    }

    cell.owner = newOwner;
    cell.outYears = 0;
    cell.outSec = 0;

    // 同步山门失守：迁都或灭门收编
    if (oldOwner && world.sects[oldOwner] && !world.sects[oldOwner].dead) {
      var oldSect = world.sects[oldOwner];
      oldSect.cities = oldSect.cities.filter(function (ct) {
        var cc = world.at(ct.x, ct.y);
        return cc && cc.owner === oldOwner && cc.city > 0;
      });
      if (oldSect.home && oldSect.home.x === cell.x && oldSect.home.y === cell.y) {
        if (oldSect.cities.length > 0) {
          var nextHome = oldSect.cities[0];
          oldSect.home = { x: nextHome.x, y: nextHome.y };
          addLog(world, oldSect.name + ' 山门失守，迁都至 (' + nextHome.x + ',' + nextHome.y + ')', oldSect.isPlayer ? 'bad' : 'war');
        } else {
          var winner = (newOwner && world.sects[newOwner] && !world.sects[newOwner].dead) ? world.sects[newOwner] : null;
          eliminateSect(world, oldSect, winner, cell);
        }
      }
    }
  }

  /* ---------- 年度结算 ---------- */
  function tickYear(world) {
    var ids = Object.keys(world.sects);

    ids.forEach(function (id) {
      var s = world.sects[id];
      if (s.dead) return;

      var mountains = countTerrain(world, s, 'M');
      var hills = countTerrain(world, s, 'H');
      var forests = countTerrain(world, s, 'F');
      var lakes = countTerrain(world, s, 'L');
      var coasts = countTerrain(world, s, 'C');
      var villages = countVillages(world, s);
      var cities = s.cities.length;
      var owned = countOwned(world, s);

      // 地形产出与领地挂钩，山门仅留基础低保
      s.stones += 15 + mountains * 32 + hills * 10 + cities * 12;
      var cap = popCapOf(world, s);
      s.pop = Math.min(cap, Math.round(s.pop * 1.08));
      s.copper += Math.round(s.pop * 0.45 + cities * 40 + villages * 15 + (lakes + coasts) * 8);
      s.wood += 25 + forests * 30 + villages * 8 + Math.floor(s.pop * 0.10);
      s.ore += 15 + mountains * 28 + hills * 18 + Math.floor(s.pop * 0.08);
      s.rep += 2 + villages * 3 + cities * 5 + Math.floor(owned * 0.15);

      // 床位上限与领地、城池和等级挂钩，抑制小宗无限爆兵
      var maxBeds = Math.min(160, 10 + s.level * 12 + cities * 10 + Math.floor(owned * 0.6));
      while (s.wood >= CFG.HOUSING_WOOD && s.housing < maxBeds) {
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

    // 修士：修炼、衰老、跨年疗伤
    ids.forEach(function (id) {
      var s = world.sects[id];
      if (s.dead) return;
      for (var i = s.cultivators.length - 1; i >= 0; i--) {
        var c = s.cultivators[i];
        if (!c.alive) { s.cultivators.splice(i, 1); continue; }
        c.age++;
        if (c.age > D.REALM_LIFE[c.realm]) {
          c.alive = false; s.cultivators.splice(i, 1);
          if (s.isPlayer) addLog(world, c.name + ' 寿元耗尽，坐化', 'bad');
          continue;
        }
        if (c.state !== 'fighting') {
          c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.25);
        }
        c.cult += cultivationRate(c, s.level);
        var need = D.REALM_NEED[c.realm + 1];
        if (need && c.cult >= need && c.realm < 6) {
          c.realm++; c.cult = 0; recalc(c); c.hp = c.maxHp;
          if (s.isPlayer) addLog(world, c.name + ' 突破至 ' + D.REALMS[c.realm], 'good');
          pushFx(world, {
            type: 'breakthrough',
            x: c.pos ? c.pos.x : s.home.x,
            y: c.pos ? c.pos.y : s.home.y,
            color: s.color,
            name: c.name,
            realm: D.REALMS[c.realm]
          });
        }
      }
    });

    // 势力范围内无主格自动并入（腐烂改为按秒倒计时，在 sim.js 推进）
    ids.forEach(function (id) {
      var s = world.sects[id];
      if (s.dead) return;
      var set = heldSet(world, s);
      set.forEach(function (idx) {
        var c = world.cells[idx];
        if (c.owner === null) {
          c.owner = id;
          c.outYears = 0;
          c.outSec = 0;
        }
      });
    });

    world.year++;
  }

  /* ---------- 玩家/AI 建设与养成动作 ---------- */
  function buildCity(world, sect, cell) {
    if (!sect || sect.dead) return '宗门已灭';
    if (sect.cities.length >= sect.level * 2) return '城池已达上限';
    if (cell.owner !== sect.id) return '不是自己的地';
    if (cell.city) return '已有城池';
    if (cell.t !== 'P' && cell.t !== 'R') return '只能建在平原或河流';
    if (sect.wood < CFG.CITY_WOOD || sect.ore < CFG.CITY_ORE || sect.stones < CFG.CITY_STONES) return '材料不足';
    sect.wood -= CFG.CITY_WOOD; sect.ore -= CFG.CITY_ORE; sect.stones -= CFG.CITY_STONES;
    cell.city = 1;
    sect.cities.push({ x: cell.x, y: cell.y });
    if (sect.isPlayer) addLog(world, '在 (' + cell.x + ',' + cell.y + ') 建成城池', 'good');
    pushFx(world, { type: 'cityBuilt', x: cell.x, y: cell.y, color: sect.color });
    return null;
  }

  function boostCultivator(world, sect, cult) {
    if (!sect || sect.dead || !cult || !cult.alive || cult.sect !== sect.id) return '目标无效';
    if (cult.realm >= 6) return '已达合体巅峰';
    if (sect.stones < CFG.BOOST_STONES) return '灵石不足';
    sect.stones -= CFG.BOOST_STONES;
    cult.cult += Math.round(CFG.BOOST_CULT * (1 + 0.05 * sect.level));
    var broke = false;
    while (cult.realm < 6) {
      var need = D.REALM_NEED[cult.realm + 1];
      if (!need || cult.cult < need) break;
      cult.realm++;
      cult.cult -= need;
      recalc(cult);
      cult.hp = cult.maxHp;
      broke = true;
      pushFx(world, {
        type: 'breakthrough',
        x: cult.pos ? cult.pos.x : sect.home.x,
        y: cult.pos ? cult.pos.y : sect.home.y,
        color: sect.color,
        name: cult.name,
        realm: D.REALMS[cult.realm]
      });
    }
    if (sect.isPlayer) {
      if (broke) addLog(world, cult.name + ' 借灵石闭关突破至 ' + D.REALMS[cult.realm], 'good');
      else addLog(world, '为 ' + cult.name + ' 灵石灌顶，修为精进', 'good');
    }
    return null;
  }

  function craftTalisman(world, sect, cult) {
    if (!sect || sect.dead || !cult || !cult.alive || cult.sect !== sect.id) return '目标无效';
    if ((cult.talisman || 0) > 0) return '已佩戴护身符';
    if (sect.stones < CFG.TALISMAN_STONES || sect.ore < CFG.TALISMAN_ORE) return '灵石或矿石不足';
    sect.stones -= CFG.TALISMAN_STONES;
    sect.ore -= CFG.TALISMAN_ORE;
    cult.talisman = 1;
    if (sect.isPlayer) addLog(world, '为 ' + cult.name + ' 炼制护身符', 'good');
    return null;
  }

  function spendCopper(world, sect, mode) {
    if (!sect || sect.dead) return '宗门已灭';
    if (mode === 'pop') {
      if (sect.copper < CFG.LEVY_COPPER) return '铜钱不足';
      var cap = popCapOf(world, sect);
      if (sect.pop >= cap) return '人口已达上限';
      sect.copper -= CFG.LEVY_COPPER;
      sect.pop = Math.min(cap, sect.pop + CFG.LEVY_POP);
      if (sect.isPlayer) addLog(world, '散财招徕流民，人口增至 ' + sect.pop, 'good');
      return null;
    }
    if (mode === 'wood') {
      if (sect.copper < CFG.MARKET_COPPER) return '铜钱不足';
      sect.copper -= CFG.MARKET_COPPER;
      sect.wood += CFG.MARKET_WOOD;
      if (sect.isPlayer) addLog(world, '坊市采买木材 +' + CFG.MARKET_WOOD, 'good');
      return null;
    }
    if (mode === 'ore') {
      if (sect.copper < CFG.MARKET_COPPER) return '铜钱不足';
      sect.copper -= CFG.MARKET_COPPER;
      sect.ore += CFG.MARKET_ORE;
      if (sect.isPlayer) addLog(world, '坊市采买矿石 +' + CFG.MARKET_ORE, 'good');
      return null;
    }
    return '未知操作';
  }

  function dismissCultivator(world, sect, cult) {
    if (!sect || sect.dead || !cult || !cult.alive || cult.sect !== sect.id) return '目标无效';
    if (sect.cultivators.length <= 1) return '不可遣散最后一名弟子';
    cult.alive = false;
    sect.cultivators = sect.cultivators.filter(function (c) { return c.id !== cult.id && c.alive; });
    sect.rep = Math.max(0, sect.rep - 5);
    if (sect.isPlayer) addLog(world, '遣散 ' + cult.name + '，声望 -5', 'bad');
    return null;
  }

  var API = {
    W: W, H: H, NT: NT,
    generateMap: generateMap, createWorld: createWorld,
    levelMaxRealm: levelMaxRealm,
    makeCultivator: makeCultivator, recalc: recalc, cultivationRate: cultivationRate,
    radiusOf: radiusOf, heldSet: heldSet, hasMountainNear: hasMountainNear,
    countTerrain: countTerrain, countOwned: countOwned, countVillages: countVillages,
    popCapOf: popCapOf,
    setCellOwner: setCellOwner, eliminateSect: eliminateSect,
    tickYear: tickYear, addLog: addLog, pushFx: pushFx,
    buildCity: buildCity, boostCultivator: boostCultivator,
    craftTalisman: craftTalisman, spendCopper: spendCopper, dismissCultivator: dismissCultivator,
    key: key, mulberry32: mulberry32
  };
  global.SLGWorld = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

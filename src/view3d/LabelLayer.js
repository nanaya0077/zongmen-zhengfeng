import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { getTileTopY } from './TerrainLayer.js';

const W = 30;

export class LabelLayer {
  constructor() {
    this.group = new THREE.Group();
    this.gateLabels = new Map();
    this.countBadges = new Map();
    this.battleBars = new Map();
    this.popups = [];
  }

  _makeGateEl(sect) {
    const el = document.createElement('div');
    el.className = 'lbl-gate';
    el.style.borderLeftColor = sect.color;
    el.innerHTML = `<span class="lbl-name">${sect.name}</span><span class="lbl-lv">Lv.${sect.level}</span>`;
    return el;
  }

  _makeBadgeEl(count) {
    const el = document.createElement('div');
    el.className = 'lbl-count';
    el.textContent = `×${count}`;
    return el;
  }

  _makeBattleEl() {
    const el = document.createElement('div');
    el.className = 'lbl-battle';
    el.innerHTML = '<div class="hp-a"></div><div class="hp-b"></div>';
    return el;
  }

  spawnBatch(events, world) {
    if (!events || !events.length || typeof document === 'undefined') return;
    const recent = events.slice(-8);
    for (let i = 0; i < recent.length; i++) {
      const e = recent[i];
      let text = '';
      let color = '#ffe9a8';
      if (e.type === 'breakthrough') {
        text = `✦ ${e.name} 破境 ${e.realm}`;
        color = e.color || '#ffe9a8';
      } else if (e.type === 'rout') {
        text = e.deaths > 0 ? `⚔ 溃退 · 战死${e.deaths}` : '⚔ 击溃敌军';
        color = '#f09999';
      } else if (e.type === 'sectDestroyed') {
        text = `☠ ${e.name} 灭门`;
        color = '#ff7d7d';
      } else if (e.type === 'cityBuilt') {
        text = '🏯 新城落成';
        color = '#7fe7c8';
      }
      if (!text) continue;

      const cell = world.at(e.x, e.y);
      const topY = cell ? (cell._topY ?? getTileTopY(cell)) : 0.4;
      const el = document.createElement('div');
      el.className = 'lbl-popup';
      el.style.color = color;
      el.textContent = text;
      const obj = new CSS2DObject(el);
      obj.position.set(e.x + 0.5, topY + 0.9, e.y + 0.5);
      this.group.add(obj);
      this.popups.push({ obj, el, age: 0, life: 1.5, baseY: topY + 0.9 });
    }
  }

  sync(world, dtReal) {
    if (typeof document === 'undefined') return;

    // 1. Update sect home nameplates
    const aliveSects = new Set();
    Object.keys(world.sects).forEach(id => {
      const s = world.sects[id];
      if (s.dead || !s.home) return;
      aliveSects.add(id);
      let rec = this.gateLabels.get(id);
      if (!rec) {
        const el = this._makeGateEl(s);
        const obj = new CSS2DObject(el);
        this.group.add(obj);
        rec = { obj, el, lvText: '' };
        this.gateLabels.set(id, rec);
      }
      const cell = world.at(s.home.x, s.home.y);
      const topY = cell ? (cell._topY ?? getTileTopY(cell)) : 0.4;
      rec.obj.position.set(s.home.x + 0.5, topY + 0.88, s.home.y + 0.5);
      const lvText = `Lv.${s.level}`;
      if (rec.lvText !== lvText) {
        rec.lvText = lvText;
        const span = rec.el.querySelector('.lbl-lv');
        if (span) span.textContent = lvText;
      }
    });
    this.gateLabels.forEach((rec, id) => {
      if (!aliveSects.has(id)) {
        this.group.remove(rec.obj);
        this.gateLabels.delete(id);
      }
    });

    // 2. Unit stack badges (>4 cultivators on one tile) & battle HP bars
    const byCell = new Map();
    Object.keys(world.sects).forEach(id => {
      const s = world.sects[id];
      if (s.dead) return;
      for (let i = 0; i < s.cultivators.length; i++) {
        const c = s.cultivators[i];
        if (!c.alive || !c.pos) continue;
        const k = c.pos.y * W + c.pos.x;
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push(c);
      }
    });

    const activeBadges = new Set();
    const activeBattles = new Set();

    byCell.forEach((list, k) => {
      const cell = world.cells[k];
      const topY = cell._topY ?? getTileTopY(cell);

      if (list.length > 4) {
        activeBadges.add(k);
        let bRec = this.countBadges.get(k);
        if (!bRec) {
          const el = this._makeBadgeEl(list.length);
          const obj = new CSS2DObject(el);
          this.group.add(obj);
          bRec = { obj, el, n: 0 };
          this.countBadges.set(k, bRec);
        }
        bRec.obj.position.set(cell.x + 0.5, topY + 0.62, cell.y + 0.5);
        if (bRec.n !== list.length) {
          bRec.n = list.length;
          bRec.el.textContent = `×${list.length}`;
        }
      }

      if (cell.battle) {
        const groups = {};
        const ids = [];
        for (let i = 0; i < list.length; i++) {
          const sid = list[i].sect;
          if (!groups[sid]) { groups[sid] = []; ids.push(sid); }
          groups[sid].push(list[i]);
        }
        if (ids.length >= 2) {
          activeBattles.add(k);
          let hRec = this.battleBars.get(k);
          if (!hRec) {
            const el = this._makeBattleEl();
            const obj = new CSS2DObject(el);
            this.group.add(obj);
            hRec = { obj, el };
            this.battleBars.set(k, hRec);
          }
          hRec.obj.position.set(cell.x + 0.5, topY + 0.78, cell.y + 0.5);

          const ratioOf = (arr) => {
            let hp = 0, max = 0;
            for (let j = 0; j < arr.length; j++) { hp += arr[j].hp; max += arr[j].maxHp; }
            return max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0;
          };
          const barA = hRec.el.querySelector('.hp-a');
          const barB = hRec.el.querySelector('.hp-b');
          if (barA) {
            barA.style.width = `${ratioOf(groups[ids[0]]).toFixed(0)}%`;
            barA.style.backgroundColor = world.sects[ids[0]].color;
          }
          if (barB) {
            barB.style.width = `${ratioOf(groups[ids[1]]).toFixed(0)}%`;
            barB.style.backgroundColor = world.sects[ids[1]].color;
          }
        }
      }
    });

    this.countBadges.forEach((rec, k) => {
      if (!activeBadges.has(k)) {
        this.group.remove(rec.obj);
        this.countBadges.delete(k);
      }
    });
    this.battleBars.forEach((rec, k) => {
      if (!activeBattles.has(k)) {
        this.group.remove(rec.obj);
        this.battleBars.delete(k);
      }
    });

    // 3. Animate popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dtReal;
      const ratio = p.age / p.life;
      if (ratio >= 1) {
        this.group.remove(p.obj);
        this.popups.splice(i, 1);
        continue;
      }
      p.obj.position.y = p.baseY + ratio * 0.75;
      p.el.style.opacity = String(Math.max(0, 1 - ratio * ratio));
    }
  }

  dispose() {
    this.gateLabels.forEach(r => this.group.remove(r.obj));
    this.countBadges.forEach(r => this.group.remove(r.obj));
    this.battleBars.forEach(r => this.group.remove(r.obj));
    this.popups.forEach(r => this.group.remove(r.obj));
    this.gateLabels.clear();
    this.countBadges.clear();
    this.battleBars.clear();
    this.popups.length = 0;
  }
}

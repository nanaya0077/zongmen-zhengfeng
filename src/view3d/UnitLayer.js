import * as THREE from 'three';
import { getTileTopY } from './TerrainLayer.js';

const W = 30;
const RING_OFFSETS = [
  [0, 0],
  [-0.20, -0.17],
  [0.20, 0.17],
  [-0.20, 0.17],
  [0.20, -0.17]
];
const HUB_OFFSETS = [
  [0, 0.36],
  [-0.36, 0],
  [0.36, 0],
  [0, -0.36]
];

export class UnitLayer {
  constructor() {
    this.group = new THREE.Group();
    this.unitGroup = new THREE.Group();
    this.pathGroup = new THREE.Group();
    this.group.add(this.pathGroup, this.unitGroup);

    this.models = new Map(); // cult.id -> { root, halo, sword, pearl, disc }
    this.pathDots = [];
    this.beacons = [];
    this._shared = this._createShared();
    this._sectMats = new Map();
  }

  _createShared() {
    const geos = {
      robe: new THREE.ConeGeometry(0.11, 0.30, 7),
      head: new THREE.SphereGeometry(0.068, 8, 8),
      bun: new THREE.SphereGeometry(0.032, 6, 6),
      disc: new THREE.RingGeometry(0.10, 0.145, 16),
      sword: new THREE.BoxGeometry(0.045, 0.016, 0.34),
      halo: new THREE.TorusGeometry(0.17, 0.014, 6, 20),
      pearl: new THREE.SphereGeometry(0.03, 6, 6),
      dot: new THREE.SphereGeometry(0.042, 6, 6),
      beacon: new THREE.CylinderGeometry(0.04, 0.14, 0.85, 10, 1, true)
    };
    geos.robe.translate(0, 0.15, 0);
    geos.disc.rotateX(-Math.PI / 2);
    geos.halo.rotateX(Math.PI / 2);
    geos.beacon.translate(0, 0.425, 0);

    const mats = {
      skin: new THREE.MeshStandardMaterial({ color: 0xf2d9c2, roughness: 0.7 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x1e242b, roughness: 0.85 }),
      sword: new THREE.MeshStandardMaterial({
        color: 0xbefcf0,
        emissive: 0x5eead4,
        emissiveIntensity: 0.8,
        metalness: 0.7,
        roughness: 0.2
      }),
      halo: new THREE.MeshBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        opacity: 0.85
      }),
      pearl: new THREE.MeshStandardMaterial({
        color: 0xffe9a8,
        emissive: 0xffc857,
        emissiveIntensity: 1.3
      }),
      dotSel: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
      dotAll: new THREE.MeshBasicMaterial({ color: 0x5eead4, transparent: true, opacity: 0.65 }),
      beacon: new THREE.MeshBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    };

    return { geos, mats };
  }

  _getSectMat(sectColor) {
    if (this._sectMats.has(sectColor)) return this._sectMats.get(sectColor);
    const robeMat = new THREE.MeshStandardMaterial({
      color: sectColor,
      roughness: 0.62,
      metalness: 0.12
    });
    const discMat = new THREE.MeshBasicMaterial({
      color: sectColor,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const pair = { robeMat, discMat };
    this._sectMats.set(sectColor, pair);
    return pair;
  }

  _createModel(c, sectColor) {
    const { geos, mats } = this._shared;
    const { robeMat, discMat } = this._getSectMat(sectColor);

    const root = new THREE.Group();

    const robe = new THREE.Mesh(geos.robe, robeMat);
    robe.castShadow = true;

    const head = new THREE.Mesh(geos.head, mats.skin);
    head.position.y = 0.34;
    head.castShadow = true;

    const bun = new THREE.Mesh(geos.bun, mats.hair);
    bun.position.y = 0.415;

    const disc = new THREE.Mesh(geos.disc, discMat);
    disc.position.y = 0.02;

    const sword = new THREE.Mesh(geos.sword, mats.sword);
    sword.position.y = -0.02;
    sword.visible = false;

    const halo = new THREE.Mesh(geos.halo, mats.halo);
    halo.position.y = 0.22;
    halo.visible = false;

    const pearl = new THREE.Mesh(geos.pearl, mats.pearl);
    pearl.position.set(0.14, 0.28, 0);
    pearl.visible = false;

    root.add(robe, head, bun, disc, sword, halo, pearl);
    this.unitGroup.add(root);

    const rec = { root, robe, robeMat, disc, sword, halo, pearl, sectColor };
    this.models.set(c.id, rec);
    return rec;
  }

  _syncPaths(world, uiState, time) {
    const player = world.sects.A;
    if (!player || player.dead) {
      this.pathDots.forEach(d => (d.visible = false));
      this.beacons.forEach(b => (b.visible = false));
      return;
    }

    const sel = uiState.selectedCell;
    const selSet = uiState.selectedCultIds;
    const targets = new Map();
    let dotIdx = 0;

    const ensureDot = () => {
      if (dotIdx < this.pathDots.length) return this.pathDots[dotIdx++];
      const m = new THREE.Mesh(this._shared.geos.dot, this._shared.mats.dotAll);
      this.pathGroup.add(m);
      this.pathDots.push(m);
      dotIdx++;
      return m;
    };

    for (let i = 0; i < player.cultivators.length; i++) {
      const c = player.cultivators[i];
      if (!c.alive || !c.pos || !c.path || c.step >= c.path.length) continue;

      const isFromSelCell = sel && c.pos.x === sel.x && c.pos.y === sel.y;
      const isPicked = !selSet || selSet.size === 0 || selSet.has(c.id);
      const isHighlighted = isFromSelCell && isPicked;

      const endIdx = c.path[c.path.length - 1];
      targets.set(endIdx, isHighlighted || targets.get(endIdx));

      // Draw sparse step beads along path
      const startStep = Math.max(0, c.step);
      for (let s = startStep; s < c.path.length; s++) {
        const cell = world.cells[c.path[s]];
        const dot = ensureDot();
        const topY = cell._topY ?? getTileTopY(cell);
        dot.position.set(cell.x + 0.5, topY + 0.14 + Math.sin(time * 4 + s) * 0.02, cell.y + 0.5);
        dot.material = isHighlighted ? this._shared.mats.dotSel : this._shared.mats.dotAll;
        dot.scale.setScalar(isHighlighted ? 1.15 : 0.78);
        dot.visible = true;
      }
    }

    for (let d = dotIdx; d < this.pathDots.length; d++) {
      this.pathDots[d].visible = false;
    }

    let bIdx = 0;
    targets.forEach((hl, idx) => {
      let b;
      if (bIdx < this.beacons.length) b = this.beacons[bIdx];
      else {
        b = new THREE.Mesh(this._shared.geos.beacon, this._shared.mats.beacon);
        this.pathGroup.add(b);
        this.beacons.push(b);
      }
      bIdx++;
      const cell = world.cells[idx];
      const topY = cell._topY ?? getTileTopY(cell);
      b.position.set(cell.x + 0.5, topY + 0.02, cell.y + 0.5);
      b.scale.set(1, hl ? 1.1 : 0.65, 1);
      b.visible = true;
    });
    for (let k = bIdx; k < this.beacons.length; k++) {
      this.beacons[k].visible = false;
    }
  }

  sync(world, uiState, time) {
    const aliveIds = new Set();
    const byCell = new Map();

    Object.keys(world.sects).forEach(id => {
      const s = world.sects[id];
      if (s.dead) return;
      for (let i = 0; i < s.cultivators.length; i++) {
        const c = s.cultivators[i];
        if (!c.alive || !c.pos) continue;
        aliveIds.add(c.id);
        const k = c.pos.y * W + c.pos.x;
        if (!byCell.has(k)) byCell.set(k, []);
        byCell.get(k).push({ cult: c, sect: s });
      }
    });

    // Remove dead models
    this.models.forEach((rec, id) => {
      if (!aliveIds.has(id)) {
        this.unitGroup.remove(rec.root);
        this.models.delete(id);
      }
    });

    const visibleIds = new Set();

    byCell.forEach((entries, cellIdx) => {
      // Prioritize highest realm & player units so representatives stand out
      entries.sort((a, b) => {
        if (b.cult.realm !== a.cult.realm) return b.cult.realm - a.cult.realm;
        if (a.sect.isPlayer !== b.sect.isPlayer) return a.sect.isPlayer ? -1 : 1;
        return 0;
      });

      const cell = world.cells[cellIdx];
      const baseTopY = cell._topY ?? getTileTopY(cell);
      const shownCount = Math.min(4, entries.length);

      for (let i = 0; i < shownCount; i++) {
        const { cult: c, sect: s } = entries[i];
        visibleIds.add(c.id);

        let rec = this.models.get(c.id);
        if (!rec) rec = this._createModel(c, s.color);
        if (rec.sectColor !== s.color) {
          const { robeMat, discMat } = this._getSectMat(s.color);
          rec.robe.material = robeMat;
          rec.disc.material = discMat;
          rec.sectColor = s.color;
        }

        rec.root.visible = true;

        // Calculate interpolated world position along current step
        let wx = c.pos.x + 0.5;
        let wz = c.pos.y + 0.5;
        let wy = baseTopY;

        const isMoving = c.path && c.step < c.path.length;
        if (isMoving) {
          const nextCell = world.cells[c.path[c.step]];
          const nextTopY = nextCell._topY ?? getTileTopY(nextCell);
          const p = THREE.MathUtils.clamp(c.progress || 0, 0, 1);
          const nx = nextCell.x + 0.5;
          const nz = nextCell.y + 0.5;
          const dx = nx - wx;
          const dz = nz - wz;
          wx += dx * p;
          wz += dz * p;
          wy = THREE.MathUtils.lerp(baseTopY, nextTopY, p);
          if (Math.abs(dx) + Math.abs(dz) > 0.001) {
            rec.root.rotation.y = Math.atan2(dx, dz);
          }
        }

        // Ring offset when multiple units share the same cell or stand at a gate/city hub
        const isHub = cell.city > 0 || Object.keys(world.sects).some(sid => {
          const hs = world.sects[sid];
          return !hs.dead && hs.home && hs.home.x === cell.x && hs.home.y === cell.y;
        });
        if (!isMoving && isHub) {
          const hoff = HUB_OFFSETS[i % HUB_OFFSETS.length];
          wx += hoff[0];
          wz += hoff[1];
        } else if (shownCount > 1) {
          const off = RING_OFFSETS[i + 1];
          wx += off[0];
          wz += off[1];
        }

        // Realm visual tiering
        const realmScale = c.realm >= 2 ? 1.12 + Math.min(4, c.realm - 2) * 0.07 : 1.0;
        rec.root.scale.setScalar(realmScale);

        let hoverOffset = 0.015;
        if (c.realm >= 1) {
          hoverOffset = 0.14 + Math.sin(time * 3.2 + i * 1.3 + c.pos.x) * 0.035;
          rec.sword.visible = true;
          rec.disc.visible = false;
        } else {
          if (isMoving) hoverOffset += Math.abs(Math.sin(time * 9 + i)) * 0.03;
          rec.sword.visible = false;
          rec.disc.visible = true;
        }

        if (c.realm >= 2) {
          rec.halo.visible = true;
          rec.halo.rotation.z = time * 2.2 + i;
        } else {
          rec.halo.visible = false;
        }

        if ((c.talisman || 0) > 0) {
          rec.pearl.visible = true;
          const pa = time * 3.5 + i;
          rec.pearl.position.set(Math.cos(pa) * 0.15, 0.28, Math.sin(pa) * 0.15);
        } else {
          rec.pearl.visible = false;
        }

        // Combat vibration
        if (c.state === 'fighting') {
          const jolt = Math.sin(time * 18 + i * 2.1) * 0.04;
          wx += jolt;
          wz -= jolt;
        }

        rec.root.position.set(wx, wy + hoverOffset, wz);
      }
    });

    // Hide excess occupants (>4 per cell)
    this.models.forEach((rec, id) => {
      if (!visibleIds.has(id)) rec.root.visible = false;
    });

    this._syncPaths(world, uiState, time);
  }

  dispose() {
    Object.values(this._shared.geos).forEach(g => g.dispose());
    Object.values(this._shared.mats).forEach(m => m.dispose());
    this._sectMats.forEach(({ robeMat, discMat }) => {
      robeMat.dispose();
      discMat.dispose();
    });
    this._sectMats.clear();
  }
}

import * as THREE from 'three';

const W = 30;
const H = 20;
const NT = W * H;

function hash2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967296;
}

export function getTileTopY(cell) {
  const h = typeof cell.h === 'number' ? cell.h : 0.5;
  switch (cell.t) {
    case 'M': return 0.78 + h * 0.48;
    case 'H': return 0.52 + h * 0.34;
    case 'F': return 0.38 + h * 0.18;
    case 'P': return 0.32 + h * 0.14;
    case 'R': return 0.26;
    case 'L': return 0.26;
    case 'C': return 0.22 + h * 0.05;
    default: return 0.34;
  }
}

function getBedY(cell) {
  if (cell.t === 'R') return 0.12;
  if (cell.t === 'L') return 0.10;
  return getTileTopY(cell);
}

const CAP_COLORS = {
  M: [0x4c5e56, 0x5d7064],
  H: [0x6e8254, 0x7e8f5e],
  F: [0x265239, 0x2f6043],
  P: [0x5d8450, 0x6e945a],
  R: [0x1c4552, 0x204d5c],
  L: [0x173a48, 0x1a4252],
  C: [0x9b8f68, 0xa89b72]
};

export class TerrainLayer {
  constructor(world) {
    this.group = new THREE.Group();
    this.world = world;
    this.waterMeshes = [];
    this._seed = -1;
    this._geometries = [];
    this._materials = [];

    this._buildStaticFrame();
    this.rebuild(world);
  }

  _trackGeo(g) { this._geometries.push(g); return g; }
  _trackMat(m) { this._materials.push(m); return m; }

  _buildStaticFrame() {
    // Expansive deep cyan-jade outer sea
    const seaGeo = this._trackGeo(new THREE.PlaneGeometry(160, 140));
    seaGeo.rotateX(-Math.PI / 2);
    const seaMat = this._trackMat(new THREE.MeshStandardMaterial({
      color: 0x0b212a,
      roughness: 0.28,
      metalness: 0.22,
      emissive: 0x041218,
      emissiveIntensity: 0.5
    }));
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.position.set(W * 0.5, 0.17, H * 0.5);
    sea.receiveShadow = true;
    this.group.add(sea);
    this.outerSea = sea;

    // Sandbox ebony/bronze plinth framing the 30x20 board
    const frameGeo = this._trackGeo(new THREE.BoxGeometry(W + 0.7, 0.36, H + 0.7));
    const frameMat = this._trackMat(new THREE.MeshStandardMaterial({
      color: 0x141d22,
      roughness: 0.72,
      metalness: 0.25
    }));
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(W * 0.5, -0.14, H * 0.5);
    frame.receiveShadow = true;
    this.group.add(frame);

    const rimGeo = this._trackGeo(new THREE.BoxGeometry(W + 0.36, 0.08, H + 0.36));
    const rimMat = this._trackMat(new THREE.MeshStandardMaterial({
      color: 0x2c4a46,
      roughness: 0.45,
      metalness: 0.45
    }));
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(W * 0.5, 0.06, H * 0.5);
    this.group.add(rim);
  }

  rebuild(world) {
    this._clearDynamic();
    this._seed = world.seed;
    this.world = world;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // 1. Invisible 1:1 Raycast Pick Mesh
    const pickGeo = this._trackGeo(new THREE.BoxGeometry(1.0, 1.0, 1.0));
    const pickMat = this._trackMat(new THREE.MeshBasicMaterial({ visible: false }));
    const pickMesh = new THREE.InstancedMesh(pickGeo, pickMat, NT);
    pickMesh.name = 'terrainPick';

    // 2. Dark plinth base per tile (creates micro-grid seams)
    const baseGeo = this._trackGeo(new THREE.BoxGeometry(0.98, 1.0, 0.98));
    const baseMat = this._trackMat(new THREE.MeshStandardMaterial({
      color: 0x243336,
      roughness: 0.85,
      metalness: 0.08
    }));
    const baseInst = new THREE.InstancedMesh(baseGeo, baseMat, NT);
    baseInst.castShadow = true;
    baseInst.receiveShadow = true;

    // 3. Colored top cap slab per tile
    const capGeo = this._trackGeo(new THREE.BoxGeometry(0.93, 0.09, 0.93));
    const capMat = this._trackMat(new THREE.MeshStandardMaterial({
      roughness: 0.78,
      metalness: 0.05
    }));
    const capInst = new THREE.InstancedMesh(capGeo, capMat, NT);
    capInst.castShadow = true;
    capInst.receiveShadow = true;

    const waterCells = [];
    const peaks = [];
    const snows = [];
    const rocks = [];
    const trees = [];

    for (let i = 0; i < world.cells.length; i++) {
      const c = world.cells[i];
      const topY = getTileTopY(c);
      const bedY = getBedY(c);
      c._topY = topY;

      const wx = c.x + 0.5;
      const wz = c.y + 0.5;

      // Pick column
      dummy.position.set(wx, topY * 0.5, wz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, Math.max(0.05, topY), 1);
      dummy.updateMatrix();
      pickMesh.setMatrixAt(i, dummy.matrix);

      // Base column
      const baseH = Math.max(0.05, bedY - 0.04);
      dummy.position.set(wx, baseH * 0.5, wz);
      dummy.scale.set(1, baseH, 1);
      dummy.updateMatrix();
      baseInst.setMatrixAt(i, dummy.matrix);

      // Top cap slab
      dummy.position.set(wx, bedY - 0.02, wz);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      capInst.setMatrixAt(i, dummy.matrix);

      const palette = CAP_COLORS[c.t] || CAP_COLORS.P;
      const rHash = hash2(c.x, c.y);
      color.setHex(palette[0]).lerp(new THREE.Color(palette[1]), rHash);
      capInst.setColorAt(i, color);

      if (c.t === 'R' || c.t === 'L') {
        waterCells.push(c);
      } else if (c.t === 'M') {
        // Two off-center low-poly peaks leaving center pass clear for units
        const offsets = [[-0.22, -0.20, 0.29, 0.42 + c.h * 0.55], [0.22, 0.18, 0.24, 0.30 + c.h * 0.42]];
        offsets.forEach(([ox, oz, rad, ph], kIdx) => {
          const rot = hash2(c.x + kIdx * 13, c.y + kIdx * 7) * Math.PI * 2;
          peaks.push({ x: wx + ox, y: topY, z: wz + oz, rad, h: ph, rot, isHigh: c.h > 0.68 && kIdx === 0 });
          if (c.h > 0.68 && kIdx === 0) {
            snows.push({ x: wx + ox, y: topY + ph * 0.62, z: wz + oz, rad: rad * 0.42, h: ph * 0.40, rot });
          }
        });
        if (rHash > 0.45) {
          rocks.push({ x: wx + 0.24, y: topY + 0.04, z: wz - 0.24, s: 0.09, rot: rHash * 6.28 });
        }
      } else if (c.t === 'H') {
        const count = rHash > 0.4 ? 2 : 1;
        for (let r = 0; r < count; r++) {
          const a = hash2(c.x * 3 + r, c.y * 5 + r) * Math.PI * 2;
          rocks.push({
            x: wx + Math.cos(a) * 0.24,
            y: topY + 0.04,
            z: wz + Math.sin(a) * 0.24,
            s: 0.08 + r * 0.04,
            rot: a
          });
        }
      } else if (c.t === 'F') {
        // 3~4 pine trees placed around corners/edges so tile center remains clear
        const spots = [[-0.26, -0.24], [0.26, -0.22], [-0.23, 0.25], [0.24, 0.24]];
        const nTrees = rHash > 0.45 ? 4 : 3;
        for (let t = 0; t < nTrees; t++) {
          const jx = (hash2(c.x + t * 11, c.y) - 0.5) * 0.08;
          const jz = (hash2(c.x, c.y + t * 17) - 0.5) * 0.08;
          const sc = 0.82 + hash2(c.x + t, c.y + t) * 0.38;
          trees.push({ x: wx + spots[t][0] + jx, y: topY + 0.02, z: wz + spots[t][1] + jz, sc });
        }
      }
    }

    pickMesh.instanceMatrix.needsUpdate = true;
    baseInst.instanceMatrix.needsUpdate = true;
    capInst.instanceMatrix.needsUpdate = true;
    if (capInst.instanceColor) capInst.instanceColor.needsUpdate = true;

    this.pickMesh = pickMesh;
    this.dynamicGroup = new THREE.Group();
    this.dynamicGroup.add(pickMesh, baseInst, capInst);

    // 4. Water surface instances
    if (waterCells.length) {
      const wGeo = this._trackGeo(new THREE.BoxGeometry(0.95, 0.05, 0.95));
      const wMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x26828b,
        roughness: 0.16,
        metalness: 0.35,
        transparent: true,
        opacity: 0.80,
        emissive: 0x0b343d,
        emissiveIntensity: 0.45
      }));
      const wInst = new THREE.InstancedMesh(wGeo, wMat, waterCells.length);
      wInst.receiveShadow = true;
      waterCells.forEach((wc, idx) => {
        dummy.position.set(wc.x + 0.5, 0.235, wc.y + 0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wInst.setMatrixAt(idx, dummy.matrix);
        color.setHex(wc.t === 'L' ? 0x1d6875 : 0x2d8e94);
        wInst.setColorAt(idx, color);
      });
      wInst.instanceMatrix.needsUpdate = true;
      if (wInst.instanceColor) wInst.instanceColor.needsUpdate = true;
      this.waterInst = wInst;
      this.waterCells = waterCells;
      this.dynamicGroup.add(wInst);
    }

    // 5. Mountain Peaks & Snow Caps
    if (peaks.length) {
      const pGeo = this._trackGeo(new THREE.ConeGeometry(1, 1, 5));
      pGeo.translate(0, 0.5, 0);
      const pMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x3f6356,
        roughness: 0.82,
        metalness: 0.06,
        flatShading: true
      }));
      const pInst = new THREE.InstancedMesh(pGeo, pMat, peaks.length);
      pInst.castShadow = true;
      pInst.receiveShadow = true;
      peaks.forEach((pk, idx) => {
        dummy.position.set(pk.x, pk.y, pk.z);
        dummy.rotation.set(0, pk.rot, 0);
        dummy.scale.set(pk.rad, pk.h, pk.rad);
        dummy.updateMatrix();
        pInst.setMatrixAt(idx, dummy.matrix);
        color.setHex(pk.isHigh ? 0x355c52 : 0x4b6a58);
        pInst.setColorAt(idx, color);
      });
      pInst.instanceMatrix.needsUpdate = true;
      if (pInst.instanceColor) pInst.instanceColor.needsUpdate = true;
      this.dynamicGroup.add(pInst);
    }

    if (snows.length) {
      const sGeo = this._trackGeo(new THREE.ConeGeometry(1, 1, 5));
      sGeo.translate(0, 0.5, 0);
      const sMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0xdff2ec,
        roughness: 0.65,
        emissive: 0x29524c,
        emissiveIntensity: 0.25,
        flatShading: true
      }));
      const sInst = new THREE.InstancedMesh(sGeo, sMat, snows.length);
      snows.forEach((sn, idx) => {
        dummy.position.set(sn.x, sn.y, sn.z);
        dummy.rotation.set(0, sn.rot, 0);
        dummy.scale.set(sn.rad, sn.h, sn.rad);
        dummy.updateMatrix();
        sInst.setMatrixAt(idx, dummy.matrix);
      });
      sInst.instanceMatrix.needsUpdate = true;
      this.dynamicGroup.add(sInst);
    }

    // 6. Hill & Mountain Rocks
    if (rocks.length) {
      const rGeo = this._trackGeo(new THREE.DodecahedronGeometry(1, 0));
      const rMat = this._trackMat(new THREE.MeshStandardMaterial({
        color: 0x677266,
        roughness: 0.9,
        flatShading: true
      }));
      const rInst = new THREE.InstancedMesh(rGeo, rMat, rocks.length);
      rInst.castShadow = true;
      rocks.forEach((rk, idx) => {
        dummy.position.set(rk.x, rk.y, rk.z);
        dummy.rotation.set(rk.rot, rk.rot * 0.7, 0);
        dummy.scale.set(rk.s, rk.s * 0.7, rk.s);
        dummy.updateMatrix();
        rInst.setMatrixAt(idx, dummy.matrix);
      });
      rInst.instanceMatrix.needsUpdate = true;
      this.dynamicGroup.add(rInst);
    }

    // 7. Double-tiered Jade Pine Trees
    if (trees.length) {
      const trGeo = this._trackGeo(new THREE.CylinderGeometry(0.022, 0.032, 0.14, 5));
      trGeo.translate(0, 0.07, 0);
      const trMat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x563f2e, roughness: 0.9 }));
      const trInst = new THREE.InstancedMesh(trGeo, trMat, trees.length);

      const c1Geo = this._trackGeo(new THREE.ConeGeometry(0.11, 0.22, 6));
      c1Geo.translate(0, 0.22, 0);
      const c1Mat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x275f44, roughness: 0.78, flatShading: true }));
      const c1Inst = new THREE.InstancedMesh(c1Geo, c1Mat, trees.length);
      c1Inst.castShadow = true;

      const c2Geo = this._trackGeo(new THREE.ConeGeometry(0.08, 0.19, 6));
      c2Geo.translate(0, 0.34, 0);
      const c2Mat = this._trackMat(new THREE.MeshStandardMaterial({ color: 0x357b57, roughness: 0.72, flatShading: true }));
      const c2Inst = new THREE.InstancedMesh(c2Geo, c2Mat, trees.length);
      c2Inst.castShadow = true;

      trees.forEach((tr, idx) => {
        dummy.position.set(tr.x, tr.y, tr.z);
        dummy.rotation.set(0, tr.x * 3.1 + tr.z * 2.3, 0);
        dummy.scale.setScalar(tr.sc);
        dummy.updateMatrix();
        trInst.setMatrixAt(idx, dummy.matrix);
        c1Inst.setMatrixAt(idx, dummy.matrix);
        c2Inst.setMatrixAt(idx, dummy.matrix);
      });
      trInst.instanceMatrix.needsUpdate = true;
      c1Inst.instanceMatrix.needsUpdate = true;
      c2Inst.instanceMatrix.needsUpdate = true;
      this.dynamicGroup.add(trInst, c1Inst, c2Inst);
    }

    this.group.add(this.dynamicGroup);
  }

  update(time) {
    if (this.waterInst && this.waterCells) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.waterCells.length; i++) {
        const wc = this.waterCells[i];
        const wave = Math.sin(time * 2.2 + wc.x * 0.7 + wc.y * 0.5) * 0.012;
        dummy.position.set(wc.x + 0.5, 0.235 + wave, wc.y + 0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.waterInst.setMatrixAt(i, dummy.matrix);
      }
      this.waterInst.instanceMatrix.needsUpdate = true;
    }
    if (this.outerSea) {
      this.outerSea.position.y = 0.17 + Math.sin(time * 1.1) * 0.008;
    }
  }

  _clearDynamic() {
    if (this.dynamicGroup) {
      this.group.remove(this.dynamicGroup);
      this.dynamicGroup = null;
    }
    this.waterInst = null;
    this.waterCells = null;
  }

  dispose() {
    this._clearDynamic();
    this._geometries.forEach(g => g.dispose());
    this._materials.forEach(m => m.dispose());
    this._geometries.length = 0;
    this._materials.length = 0;
  }
}

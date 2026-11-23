import * as THREE from 'three';
import { getTileTopY } from './TerrainLayer.js';

const W = 30;
const H = 20;

export class BorderLayer {
  constructor() {
    this.group = new THREE.Group();
    this._lastOwnerSig = '';
    this._lastInfluenceSig = '';

    this._geos = [];
    this._mats = [];

    // 1. Owned tile semi-transparent sect overlays
    const tileGeo = this._trackGeo(new THREE.PlaneGeometry(0.96, 0.96));
    tileGeo.rotateX(-Math.PI / 2);
    const tileMat = this._trackMat(new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.16,
      depthWrite: false
    }));
    this.ownedInst = new THREE.InstancedMesh(tileGeo, tileMat, W * H);
    this.ownedInst.count = 0;
    this.group.add(this.ownedInst);

    // 2. Merged outer territory border mesh (vertex-colored ribbons)
    this.borderGeo = this._trackGeo(new THREE.BufferGeometry());
    this.borderMat = this._trackMat(new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false
    }));
    this.borderMesh = new THREE.Mesh(this.borderGeo, this.borderMat);
    this.borderMesh.frustumCulled = false;
    this.group.add(this.borderMesh);

    // 3. Influence radius preview overlay
    const infGeo = this._trackGeo(new THREE.PlaneGeometry(0.88, 0.88));
    infGeo.rotateX(-Math.PI / 2);
    const infMat = this._trackMat(new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    }));
    this.influenceInst = new THREE.InstancedMesh(infGeo, infMat, 180);
    this.influenceInst.count = 0;
    this.group.add(this.influenceInst);

    // 4. Preview City Ghost
    const ghostGeo = this._trackGeo(new THREE.BoxGeometry(0.55, 0.25, 0.55));
    const ghostMat = this._trackMat(new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      wireframe: true,
      transparent: true,
      opacity: 0.85
    }));
    this.cityGhost = new THREE.Mesh(ghostGeo, ghostMat);
    this.cityGhost.visible = false;
    this.group.add(this.cityGhost);

    // 5. Hover & Selection Rings
    this.hoverRing = this._createFrameRing(0x9be7d9, 0.65, 0.94, 0.032);
    this.selectRing = this._createFrameRing(0xffe9a8, 0.95, 0.96, 0.05);
    this.hoverRing.visible = false;
    this.selectRing.visible = false;
    this.group.add(this.hoverRing, this.selectRing);
  }

  _trackGeo(g) { this._geos.push(g); return g; }
  _trackMat(m) { this._mats.push(m); return m; }

  _createFrameRing(colorHex, opacity, outerSize, thickness) {
    const half = outerSize * 0.5;
    const inner = half - thickness;
    const shape = new THREE.Shape();
    shape.moveTo(-half, -half);
    shape.lineTo(half, -half);
    shape.lineTo(half, half);
    shape.lineTo(-half, half);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(-inner, -inner);
    hole.lineTo(-inner, inner);
    hole.lineTo(inner, inner);
    hole.lineTo(inner, -inner);
    hole.closePath();
    shape.holes.push(hole);

    const geo = this._trackGeo(new THREE.ShapeGeometry(shape));
    geo.rotateX(-Math.PI / 2);
    const mat = this._trackMat(new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false
    }));
    return new THREE.Mesh(geo, mat);
  }

  _rebuildTerritory(world) {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let ownedCount = 0;

    const positions = [];
    const colors = [];
    const indices = [];
    let vCount = 0;

    const pushRibbon = (x1, z1, x2, z2, y, nx, nz, col) => {
      const hw = 0.036;
      const dx = nx * hw, dz = nz * hw;
      positions.push(
        x1 - dx, y, z1 - dz,
        x2 - dx, y, z2 - dz,
        x2 + dx, y, z2 + dz,
        x1 + dx, y, z1 + dz
      );
      for (let k = 0; k < 4; k++) colors.push(col.r, col.g, col.b);
      indices.push(vCount, vCount + 1, vCount + 2, vCount, vCount + 2, vCount + 3);
      vCount += 4;
    };

    for (let i = 0; i < world.cells.length; i++) {
      const c = world.cells[i];
      if (!c.owner) continue;
      const sect = world.sects[c.owner];
      if (!sect) continue;

      const topY = c._topY ?? getTileTopY(c);
      color.set(sect.color);

      dummy.position.set(c.x + 0.5, topY + 0.015, c.y + 0.5);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.ownedInst.setMatrixAt(ownedCount, dummy.matrix);
      this.ownedInst.setColorAt(ownedCount, color);
      ownedCount++;

      // Check 4 neighbors for outer contour edges
      const yEdge = topY + 0.028;
      // Top (-z)
      if (c.y === 0 || world.at(c.x, c.y - 1).owner !== c.owner) {
        pushRibbon(c.x + 0.03, c.y + 0.04, c.x + 0.97, c.y + 0.04, yEdge, 0, 1, color);
      }
      // Bottom (+z)
      if (c.y === H - 1 || world.at(c.x, c.y + 1).owner !== c.owner) {
        pushRibbon(c.x + 0.03, c.y + 0.96, c.x + 0.97, c.y + 0.96, yEdge, 0, 1, color);
      }
      // Left (-x)
      if (c.x === 0 || world.at(c.x - 1, c.y).owner !== c.owner) {
        pushRibbon(c.x + 0.04, c.y + 0.03, c.x + 0.04, c.y + 0.97, yEdge, 1, 0, color);
      }
      // Right (+x)
      if (c.x === W - 1 || world.at(c.x + 1, c.y).owner !== c.owner) {
        pushRibbon(c.x + 0.96, c.y + 0.03, c.x + 0.96, c.y + 0.97, yEdge, 1, 0, color);
      }
    }

    this.ownedInst.count = ownedCount;
    this.ownedInst.instanceMatrix.needsUpdate = true;
    if (this.ownedInst.instanceColor) this.ownedInst.instanceColor.needsUpdate = true;

    this.borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.borderGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.borderGeo.setIndex(indices);
    this.borderGeo.computeBoundingSphere();
  }

  _syncInfluence(world, uiState) {
    let center = null;
    let radius = 0;

    if (uiState.previewCityCell) {
      center = uiState.previewCityCell;
      radius = 3;
    } else if (uiState.selectedCell) {
      const sc = world.at(uiState.selectedCell.x, uiState.selectedCell.y);
      if (sc && sc.owner) {
        const s = world.sects[sc.owner];
        if (s && !s.dead) {
          if (s.home && s.home.x === sc.x && s.home.y === sc.y) {
            center = sc;
            radius = Math.min(5, 1 + Math.floor((s.level - 1) / 2));
          } else if (sc.city > 0) {
            center = sc;
            radius = 3;
          }
        }
      }
    }

    const sig = center ? `${center.x},${center.y}:${radius}:${uiState.previewCityCell ? 1 : 0}` : 'none';
    if (sig === this._lastInfluenceSig) return;
    this._lastInfluenceSig = sig;

    if (!center) {
      this.influenceInst.count = 0;
      this.cityGhost.visible = false;
      return;
    }

    const dummy = new THREE.Object3D();
    let count = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const nx = center.x + dx;
        const ny = center.y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const cell = world.at(nx, ny);
        const topY = cell._topY ?? getTileTopY(cell);
        dummy.position.set(nx + 0.5, topY + 0.022, ny + 0.5);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        this.influenceInst.setMatrixAt(count++, dummy.matrix);
      }
    }
    this.influenceInst.count = count;
    this.influenceInst.instanceMatrix.needsUpdate = true;

    if (uiState.previewCityCell) {
      const pc = world.at(uiState.previewCityCell.x, uiState.previewCityCell.y);
      const topY = pc ? (pc._topY ?? getTileTopY(pc)) : 0.35;
      this.cityGhost.position.set(uiState.previewCityCell.x + 0.5, topY + 0.14, uiState.previewCityCell.y + 0.5);
      this.cityGhost.visible = true;
    } else {
      this.cityGhost.visible = false;
    }
  }

  sync(world, uiState, time) {
    const showTerritory = uiState.showTerritoryOverlay !== false;
    this.ownedInst.visible = showTerritory;
    this.borderMesh.visible = showTerritory;

    let sig = '';
    for (let i = 0; i < world.cells.length; i++) {
      sig += world.cells[i].owner || '_';
    }
    if (sig !== this._lastOwnerSig) {
      this._lastOwnerSig = sig;
      this._rebuildTerritory(world);
    }

    // Hover & Selection Rings
    if (uiState.hoverCell) {
      const hc = world.at(uiState.hoverCell.x, uiState.hoverCell.y);
      const hy = hc ? (hc._topY ?? getTileTopY(hc)) : 0.35;
      this.hoverRing.position.set(hc.x + 0.5, hy + 0.032, hc.y + 0.5);
      this.hoverRing.visible = true;
    } else {
      this.hoverRing.visible = false;
    }

    if (uiState.selectedCell) {
      const sc = world.at(uiState.selectedCell.x, uiState.selectedCell.y);
      const sy = sc ? (sc._topY ?? getTileTopY(sc)) : 0.35;
      this.selectRing.position.set(sc.x + 0.5, sy + 0.038, sc.y + 0.5);
      this.selectRing.material.opacity = 0.72 + Math.sin(time * 5.0) * 0.25;
      this.selectRing.visible = true;
    } else {
      this.selectRing.visible = false;
    }

    this._syncInfluence(world, uiState);
  }

  dispose() {
    this._geos.forEach(g => g.dispose());
    this._mats.forEach(m => m.dispose());
  }
}

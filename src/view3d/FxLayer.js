import * as THREE from 'three';
import { getTileTopY } from './TerrainLayer.js';

export class FxLayer {
  constructor() {
    this.group = new THREE.Group();
    this.effects = [];
    this._geos = [];
    this._mats = [];
    this._textures = [];

    this._sparkGeo = this._trackGeo(new THREE.BoxGeometry(0.035, 0.035, 0.16));
    this._pillarGeo = this._trackGeo(new THREE.CylinderGeometry(0.06, 0.24, 2.2, 12, 1, true));
    this._pillarGeo.translate(0, 1.1, 0);
    this._ringGeo = this._trackGeo(new THREE.RingGeometry(0.22, 0.34, 24));
    this._ringGeo.rotateX(-Math.PI / 2);

    this._buildClouds();
  }

  _trackGeo(g) { this._geos.push(g); return g; }
  _trackMat(m) { this._mats.push(m); return m; }

  _buildClouds() {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 256);
      const puffs = [
        [70, 90, 58, 0.22],
        [155, 75, 48, 0.18],
        [120, 150, 65, 0.20],
        [190, 175, 52, 0.16],
        [60, 190, 46, 0.15]
      ];
      puffs.forEach(([x, y, r, a]) => {
        const g = ctx.createRadialGradient(x, y, 4, x, y, r);
        g.addColorStop(0, `rgba(180,235,225,${a})`);
        g.addColorStop(1, 'rgba(180,235,225,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2.5, 2.0);
    this._textures.push(tex);
    this._cloudTex = tex;

    const cloudGeo = this._trackGeo(new THREE.PlaneGeometry(48, 36));
    cloudGeo.rotateX(-Math.PI / 2);
    const cloudMat = this._trackMat(new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    }));
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.position.set(15, 7.5, 10);
    this.group.add(cloud);
  }

  _spawnSparkBurst(wx, wy, wz, colorA, colorB, count = 6) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? colorA : colorB,
        transparent: true,
        opacity: 0.95
      });
      const mesh = new THREE.Mesh(this._sparkGeo, mat);
      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 1.4 + Math.random() * 1.4;
      mesh.position.set(wx, wy + 0.24, wz);
      mesh.rotation.y = -ang + Math.PI * 0.5;
      this.group.add(mesh);
      this.effects.push({
        mesh,
        mat,
        vx: Math.cos(ang) * spd,
        vy: 0.7 + Math.random() * 0.8,
        vz: Math.sin(ang) * spd,
        age: 0,
        life: 0.38 + Math.random() * 0.16,
        kind: 'spark'
      });
    }
  }

  _spawnRing(wx, wy, wz, color, life = 0.75, maxScale = 2.6) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this._ringGeo, mat);
    mesh.position.set(wx, wy + 0.05, wz);
    this.group.add(mesh);
    this.effects.push({
      mesh,
      mat,
      age: 0,
      life,
      maxScale,
      kind: 'ring'
    });
  }

  _spawnPillar(wx, wy, wz, color, life = 1.2) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(this._pillarGeo, mat);
    mesh.position.set(wx, wy + 0.02, wz);
    this.group.add(mesh);
    this.effects.push({
      mesh,
      mat,
      age: 0,
      life,
      kind: 'pillar'
    });
  }

  spawnBatch(events, world) {
    if (!events || !events.length) return;
    // Cap burst spawn per frame so 10x speed doesn't flood GPU
    const slice = events.slice(-24);
    for (let i = 0; i < slice.length; i++) {
      const e = slice[i];
      const cell = world.at(e.x, e.y);
      const topY = cell ? (cell._topY ?? getTileTopY(cell)) : 0.35;
      const wx = e.x + 0.5;
      const wz = e.y + 0.5;

      if (e.type === 'clash') {
        this._spawnSparkBurst(wx, topY, wz, e.colorA || '#ffe9a8', e.colorB || '#ff7766', 6);
      } else if (e.type === 'breakthrough') {
        this._spawnPillar(wx, topY, wz, e.color || '#ffe9a8', 1.25);
        this._spawnRing(wx, topY, wz, '#ffe9a8', 0.9, 2.4);
      } else if (e.type === 'cityBuilt') {
        this._spawnRing(wx, topY, wz, e.color || '#5eead4', 0.95, 3.0);
        this._spawnSparkBurst(wx, topY, wz, '#ffe9a8', e.color || '#5eead4', 8);
      } else if (e.type === 'sectDestroyed') {
        this._spawnPillar(wx, topY, wz, '#ff7766', 1.4);
        this._spawnRing(wx, topY, wz, e.color || '#ffe9a8', 1.2, 4.2);
      } else if (e.type === 'rout') {
        this._spawnRing(wx, topY, wz, e.winnerColor || '#ffe9a8', 0.7, 2.2);
      }
    }
  }

  update(dtReal) {
    if (this._cloudTex) {
      this._cloudTex.offset.x = (this._cloudTex.offset.x + dtReal * 0.012) % 1;
      this._cloudTex.offset.y = (this._cloudTex.offset.y + dtReal * 0.007) % 1;
    }

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.age += dtReal;
      const p = fx.age / fx.life;
      if (p >= 1) {
        this.group.remove(fx.mesh);
        fx.mat.dispose();
        this.effects.splice(i, 1);
        continue;
      }

      if (fx.kind === 'spark') {
        fx.mesh.position.x += fx.vx * dtReal;
        fx.mesh.position.y += fx.vy * dtReal;
        fx.mesh.position.z += fx.vz * dtReal;
        fx.vy -= 3.2 * dtReal;
        fx.mat.opacity = 1 - p;
      } else if (fx.kind === 'ring') {
        const sc = 0.6 + p * fx.maxScale;
        fx.mesh.scale.set(sc, sc, 1);
        fx.mat.opacity = (1 - p) * 0.85;
      } else if (fx.kind === 'pillar') {
        const sc = 1 - p * 0.55;
        fx.mesh.scale.set(sc, 0.7 + p * 0.8, sc);
        fx.mat.opacity = (1 - p) * 0.82;
      }
    }
  }

  dispose() {
    this.effects.forEach(fx => {
      this.group.remove(fx.mesh);
      fx.mat.dispose();
    });
    this.effects.length = 0;
    this._geos.forEach(g => g.dispose());
    this._mats.forEach(m => m.dispose());
    this._textures.forEach(t => t.dispose());
  }
}

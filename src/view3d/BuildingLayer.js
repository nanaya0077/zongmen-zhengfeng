import * as THREE from 'three';
import { getTileTopY } from './TerrainLayer.js';

export class BuildingLayer {
  constructor(world) {
    this.group = new THREE.Group();
    this.gateGroup = new THREE.Group();
    this.cityGroup = new THREE.Group();
    this.villageGroup = new THREE.Group();
    this.group.add(this.villageGroup, this.cityGroup, this.gateGroup);

    this.gates = new Map();
    this.flags = [];
    this.pulseRing = null;
    this._lastSeed = -1;
    this._lastCitySig = '';
    this._lastHomeSig = '';

    this._shared = this._createShared();
    this.sync(world, 0);
  }

  _createShared() {
    const geos = {
      plinth1: new THREE.BoxGeometry(0.68, 0.07, 0.68),
      plinth2: new THREE.BoxGeometry(0.50, 0.06, 0.50),
      hall: new THREE.BoxGeometry(0.36, 0.22, 0.30),
      roof1: new THREE.ConeGeometry(0.34, 0.14, 4),
      roof2: new THREE.ConeGeometry(0.24, 0.14, 4),
      ring: new THREE.RingGeometry(0.38, 0.44, 32),
      pulse: new THREE.RingGeometry(0.42, 0.49, 36),

      wallNS: new THREE.BoxGeometry(0.72, 0.16, 0.07),
      wallEW: new THREE.BoxGeometry(0.07, 0.16, 0.72),
      tower: new THREE.BoxGeometry(0.13, 0.22, 0.13),
      keep: new THREE.BoxGeometry(0.26, 0.24, 0.26),
      keepRoof: new THREE.ConeGeometry(0.22, 0.15, 4),
      pole: new THREE.CylinderGeometry(0.014, 0.014, 0.30, 5),
      flag: new THREE.PlaneGeometry(0.18, 0.10),

      hutBody: new THREE.BoxGeometry(0.16, 0.10, 0.14),
      hutRoof: new THREE.ConeGeometry(0.13, 0.09, 4),
      lantern: new THREE.SphereGeometry(0.025, 6, 6)
    };
    geos.roof1.rotateY(Math.PI / 4);
    geos.roof2.rotateY(Math.PI / 4);
    geos.keepRoof.rotateY(Math.PI / 4);
    geos.hutRoof.rotateY(Math.PI / 4);
    geos.ring.rotateX(-Math.PI / 2);
    geos.pulse.rotateX(-Math.PI / 2);
    geos.flag.translate(0.09, 0, 0);

    const mats = {
      jadeStone: new THREE.MeshStandardMaterial({ color: 0xc9dad4, roughness: 0.6, metalness: 0.08 }),
      crimsonHall: new THREE.MeshStandardMaterial({ color: 0x7a3430, roughness: 0.7 }),
      darkTileRoof: new THREE.MeshStandardMaterial({ color: 0x25383c, roughness: 0.55, metalness: 0.15 }),
      cityStone: new THREE.MeshStandardMaterial({ color: 0x7b8885, roughness: 0.8 }),
      cityRoof: new THREE.MeshStandardMaterial({ color: 0x314548, roughness: 0.6 }),
      hutWall: new THREE.MeshStandardMaterial({ color: 0xd9d7cb, roughness: 0.85 }),
      hutRoof: new THREE.MeshStandardMaterial({ color: 0x455354, roughness: 0.75 }),
      lanternMat: new THREE.MeshStandardMaterial({
        color: 0xffdf8e,
        emissive: 0xffb84d,
        emissiveIntensity: 1.5,
        roughness: 0.3
      }),
      poleMat: new THREE.MeshStandardMaterial({ color: 0xd4c496, metalness: 0.4, roughness: 0.5 })
    };

    return { geos, mats, dynamicMats: [] };
  }

  _buildVillages(world) {
    while (this.villageGroup.children.length) {
      this.villageGroup.remove(this.villageGroup.children[0]);
    }
    const { geos, mats } = this._shared;
    const offsets = [[-0.22, -0.18, 0.15], [0.22, 0.16, -0.4], [-0.18, 0.22, 0.7]];

    for (let i = 0; i < world.cells.length; i++) {
      const c = world.cells[i];
      if (!c.village) continue;
      const topY = c._topY ?? getTileTopY(c);
      const vg = new THREE.Group();
      vg.position.set(c.x + 0.5, topY + 0.01, c.y + 0.5);

      const nHuts = ((c.x * 7 + c.y * 13) % 2) + 2;
      for (let k = 0; k < nHuts; k++) {
        const [ox, oz, rot] = offsets[k];
        const hut = new THREE.Group();
        hut.position.set(ox, 0, oz);
        hut.rotation.y = rot;

        const body = new THREE.Mesh(geos.hutBody, mats.hutWall);
        body.position.y = 0.05;
        body.castShadow = true;
        body.receiveShadow = true;

        const roof = new THREE.Mesh(geos.hutRoof, mats.hutRoof);
        roof.position.y = 0.14;
        roof.castShadow = true;

        hut.add(body, roof);
        vg.add(hut);
      }

      const lantern = new THREE.Mesh(geos.lantern, mats.lanternMat);
      lantern.position.set(0.06, 0.07, 0.02);
      vg.add(lantern);

      this.villageGroup.add(vg);
    }
  }

  _syncGates(world) {
    const homeSig = Object.keys(world.sects).map(id => {
      const s = world.sects[id];
      return `${id}:${s.dead ? 1 : 0}:${s.home ? s.home.x + ',' + s.home.y : 'none'}`;
    }).join('|');

    if (homeSig === this._lastHomeSig) return;
    this._lastHomeSig = homeSig;

    while (this.gateGroup.children.length) {
      this.gateGroup.remove(this.gateGroup.children[0]);
    }
    this.gates.clear();
    this.pulseRing = null;

    const { geos, mats } = this._shared;
    Object.keys(world.sects).forEach(id => {
      const s = world.sects[id];
      if (s.dead || !s.home) return;
      const cell = world.at(s.home.x, s.home.y);
      const topY = cell ? (cell._topY ?? getTileTopY(cell)) : 0.38;

      const gg = new THREE.Group();
      gg.position.set(s.home.x + 0.5, topY + 0.01, s.home.y + 0.5);

      const p1 = new THREE.Mesh(geos.plinth1, mats.jadeStone);
      p1.position.y = 0.035;
      p1.castShadow = true; p1.receiveShadow = true;

      const p2 = new THREE.Mesh(geos.plinth2, mats.jadeStone);
      p2.position.y = 0.10;
      p2.castShadow = true; p2.receiveShadow = true;

      const hall = new THREE.Mesh(geos.hall, mats.crimsonHall);
      hall.position.y = 0.24;
      hall.castShadow = true;

      const r1 = new THREE.Mesh(geos.roof1, mats.darkTileRoof);
      r1.position.y = 0.39;
      r1.castShadow = true;

      const r2 = new THREE.Mesh(geos.roof2, mats.darkTileRoof);
      r2.position.y = 0.50;
      r2.castShadow = true;

      const ringMat = new THREE.MeshBasicMaterial({
        color: s.color,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide
      });
      this._shared.dynamicMats.push(ringMat);
      const ring = new THREE.Mesh(geos.ring, ringMat);
      ring.position.y = 0.025;

      // Sect color banner on gate peak
      const spireMat = new THREE.MeshStandardMaterial({
        color: s.color,
        emissive: s.color,
        emissiveIntensity: 0.9,
        roughness: 0.3
      });
      this._shared.dynamicMats.push(spireMat);
      const spire = new THREE.Mesh(geos.lantern, spireMat);
      spire.scale.setScalar(1.6);
      spire.position.y = 0.59;

      gg.add(p1, p2, hall, r1, r2, ring, spire);

      if (s.isPlayer) {
        const pulseMat = new THREE.MeshBasicMaterial({
          color: 0xffe9a8,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide
        });
        this._shared.dynamicMats.push(pulseMat);
        const pulse = new THREE.Mesh(geos.pulse, pulseMat);
        pulse.position.y = 0.03;
        gg.add(pulse);
        this.pulseRing = pulse;
      }

      this.gateGroup.add(gg);
      this.gates.set(id, { group: gg, ring });
    });
  }

  _syncCities(world) {
    let sig = '';
    for (let i = 0; i < world.cells.length; i++) {
      const c = world.cells[i];
      if (c.city > 0) sig += `${c.x},${c.y}:${c.owner || ''};`;
    }
    if (sig === this._lastCitySig) return;
    this._lastCitySig = sig;

    while (this.cityGroup.children.length) {
      this.cityGroup.remove(this.cityGroup.children[0]);
    }
    this.flags = [];

    const { geos, mats } = this._shared;
    for (let i = 0; i < world.cells.length; i++) {
      const c = world.cells[i];
      if (!c.city) continue;
      const topY = c._topY ?? getTileTopY(c);
      const sect = c.owner ? world.sects[c.owner] : null;
      const flagColor = sect ? sect.color : '#cccccc';

      const cg = new THREE.Group();
      cg.position.set(c.x + 0.5, topY + 0.01, c.y + 0.5);

      const nWall = new THREE.Mesh(geos.wallNS, mats.cityStone);
      nWall.position.set(0, 0.08, -0.32); nWall.castShadow = true;
      const sWall = new THREE.Mesh(geos.wallNS, mats.cityStone);
      sWall.position.set(0, 0.08, 0.32); sWall.castShadow = true;
      const eWall = new THREE.Mesh(geos.wallEW, mats.cityStone);
      eWall.position.set(0.32, 0.08, 0); eWall.castShadow = true;
      const wWall = new THREE.Mesh(geos.wallEW, mats.cityStone);
      wWall.position.set(-0.32, 0.08, 0); wWall.castShadow = true;

      cg.add(nWall, sWall, eWall, wWall);

      const corners = [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]];
      corners.forEach(([cx, cz]) => {
        const tw = new THREE.Mesh(geos.tower, mats.cityStone);
        tw.position.set(cx, 0.11, cz);
        tw.castShadow = true;
        cg.add(tw);
      });

      const keep = new THREE.Mesh(geos.keep, mats.cityStone);
      keep.position.y = 0.12;
      keep.castShadow = true;
      const kRoof = new THREE.Mesh(geos.keepRoof, mats.cityRoof);
      kRoof.position.y = 0.31;
      kRoof.castShadow = true;

      const pole = new THREE.Mesh(geos.pole, mats.poleMat);
      pole.position.set(0, 0.42, 0);
      const flagMat = new THREE.MeshStandardMaterial({
        color: flagColor,
        emissive: flagColor,
        emissiveIntensity: 0.45,
        side: THREE.DoubleSide,
        roughness: 0.5
      });
      this._shared.dynamicMats.push(flagMat);
      const flag = new THREE.Mesh(geos.flag, flagMat);
      flag.position.set(0, 0.51, 0);
      this.flags.push(flag);

      cg.add(keep, kRoof, pole, flag);
      this.cityGroup.add(cg);
    }
  }

  sync(world, time) {
    if (this._lastSeed !== world.seed) {
      this._lastSeed = world.seed;
      this._lastCitySig = '';
      this._lastHomeSig = '';
      this._buildVillages(world);
    }

    this._syncGates(world);
    this._syncCities(world);

    // Animate protective formation rings & city flags
    this.gates.forEach(({ ring }) => {
      ring.rotation.z = time * 0.45;
    });

    if (this.pulseRing) {
      const showPulse = !world.movedOnce && !world.over;
      this.pulseRing.visible = showPulse;
      if (showPulse) {
        const p = (time * 0.75) % 1;
        const sc = 0.9 + p * 1.1;
        this.pulseRing.scale.set(sc, sc, 1);
        this.pulseRing.material.opacity = (1 - p) * 0.88;
      }
    }

    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i].rotation.y = Math.sin(time * 3.8 + i * 1.1) * 0.28;
    }
  }

  dispose() {
    Object.values(this._shared.geos).forEach(g => g.dispose());
    Object.values(this._shared.mats).forEach(m => m.dispose());
    this._shared.dynamicMats.forEach(m => m.dispose());
  }
}

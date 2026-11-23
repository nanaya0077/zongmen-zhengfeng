import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

import { CameraRig } from './CameraRig.js';
import { TerrainLayer } from './TerrainLayer.js';
import { BuildingLayer } from './BuildingLayer.js';
import { BorderLayer } from './BorderLayer.js';
import { UnitLayer } from './UnitLayer.js';
import { FxLayer } from './FxLayer.js';
import { LabelLayer } from './LabelLayer.js';

const W = 30;
const H = 20;

export class View3D {
  constructor(containerEl, world, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks;
    this.time = 0;
    this._lastHoverKey = '';
    this._seed = world.seed;

    const width = Math.max(1, containerEl.clientWidth || window.innerWidth);
    const height = Math.max(1, containerEl.clientHeight || window.innerHeight);

    // 1. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    containerEl.appendChild(this.renderer.domElement);

    // 2. CSS2D Label Renderer
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(width, height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.inset = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    containerEl.appendChild(this.labelRenderer.domElement);

    // 3. Scene & Mist Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070c10);
    this.scene.fog = new THREE.FogExp2(0x091318, 0.011);

    // 4. Three-point Miniature Diorama Lighting
    const hemi = new THREE.HemisphereLight(0x88d4c8, 0x162228, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4dc, 1.48);
    sun.position.set(26, 28, 22);
    sun.target.position.set(W * 0.5, 0, H * 0.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 4;
    sun.shadow.camera.far = 75;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    const rim = new THREE.DirectionalLight(0x4fd1c5, 0.38);
    rim.position.set(-14, 12, -12);
    this.scene.add(rim);

    // 5. Camera Rig & Raycaster
    this.raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();

    this.rig = new CameraRig(this.renderer.domElement, width / height, {
      mapW: W,
      mapH: H,
      onHoverScreen: (cx, cy) => this._handleHover(cx, cy),
      onClickScreen: (cx, cy, mods) => this._handleClick(cx, cy, mods),
      onRightClickScreen: (cx, cy) => this._handleRightClick(cx, cy)
    });

    // 6. Scene Layers
    this.terrain = new TerrainLayer(world);
    this.buildings = new BuildingLayer(world);
    this.borders = new BorderLayer();
    this.units = new UnitLayer();
    this.fx = new FxLayer();
    this.labels = new LabelLayer();

    this.scene.add(
      this.terrain.group,
      this.buildings.group,
      this.borders.group,
      this.units.group,
      this.fx.group,
      this.labels.group
    );

    // 7. Post-processing with Selective Bloom
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 0.26, 0.35, 0.86);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    // Focus initially on player's 青云宗 home
    if (world.sects.A && world.sects.A.home) {
      this.focusCell(world.sects.A.home.x, world.sects.A.home.y, true);
    }
  }

  _pickCell(clientX, clientY) {
    if (!this.terrain.pickMesh) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this._ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this._ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this._ndc, this.rig.camera);
    const hits = this.raycaster.intersectObject(this.terrain.pickMesh, false);
    if (!hits.length) return null;
    const id = hits[0].instanceId;
    if (id === undefined || id === null || id < 0 || id >= W * H) return null;
    return { x: id % W, y: (id / W) | 0 };
  }

  _handleHover(cx, cy) {
    const cell = this._pickCell(cx, cy);
    const k = cell ? `${cell.x},${cell.y}` : 'none';
    if (k !== this._lastHoverKey) {
      this._lastHoverKey = k;
      if (this.callbacks.onCellHover) this.callbacks.onCellHover(cell);
    }
  }

  _handleClick(cx, cy, mods) {
    const cell = this._pickCell(cx, cy);
    if (this.callbacks.onCellClick) this.callbacks.onCellClick(cell, mods);
  }

  _handleRightClick(cx, cy) {
    const cell = this._pickCell(cx, cy);
    if (this.callbacks.onCellRightClick) this.callbacks.onCellRightClick(cell);
  }

  focusCell(x, y, instant = false) {
    this.rig.focusCell(x, y, instant);
  }

  rotateBy(rad) {
    this.rig.rotateBy(rad);
  }

  zoomBy(delta) {
    this.rig.zoomBy(delta);
  }

  resetWorld(world) {
    this._seed = world.seed;
    this.terrain.rebuild(world);
    this.buildings._lastSeed = -1;
    this.borders._lastOwnerSig = '';
    this.borders._lastInfluenceSig = '';
    if (world.sects.A && world.sects.A.home) {
      this.focusCell(world.sects.A.home.x, world.sects.A.home.y, true);
    }
  }

  sync(world, uiState, dtReal) {
    this.time += dtReal;

    if (world.seed !== this._seed) {
      this._seed = world.seed;
      this.terrain.rebuild(world);
      if (world.sects.A && world.sects.A.home) {
        this.focusCell(world.sects.A.home.x, world.sects.A.home.y, true);
      }
    }

    this.rig.update(dtReal, !!uiState.modalOpen);
    this.terrain.update(this.time);
    this.buildings.sync(world, this.time);
    this.borders.sync(world, uiState, this.time);
    this.units.sync(world, uiState, this.time);

    if (world.fxEvents && world.fxEvents.length) {
      const drained = world.fxEvents.splice(0, world.fxEvents.length);
      this.fx.spawnBatch(drained, world);
      this.labels.spawnBatch(drained, world);
    }

    this.fx.update(dtReal);
    this.labels.sync(world, dtReal);

    this.composer.render();
    this.labelRenderer.render(this.scene, this.rig.camera);
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.rig.setAspect(width / height);
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.resolution.set(width, height);
    this.labelRenderer.setSize(width, height);
  }

  dispose() {
    this.rig.dispose();
    this.terrain.dispose();
    this.buildings.dispose();
    this.borders.dispose();
    this.units.dispose();
    this.fx.dispose();
    this.labels.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    if (this.labelRenderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.labelRenderer.domElement);
    }
  }
}

import * as THREE from 'three';

const MIN_POLAR = 0.48; // ~27.5 deg
const MAX_POLAR = 1.22; // ~70 deg
const MIN_DIST = 6.5;
const MAX_DIST = 38;

export class CameraRig {
  constructor(domElement, aspect, opts = {}) {
    this.dom = domElement;
    this.mapW = opts.mapW || 30;
    this.mapH = opts.mapH || 20;
    this.onHoverScreen = opts.onHoverScreen || null;
    this.onClickScreen = opts.onClickScreen || null;
    this.onRightClickScreen = opts.onRightClickScreen || null;

    this.camera = new THREE.PerspectiveCamera(30, aspect || 1.6, 0.5, 180);

    this.target = new THREE.Vector3(this.mapW * 0.5, 0.4, this.mapH * 0.5);
    this.goalTarget = this.target.clone();

    this.distance = 16.5;
    this.goalDistance = 16.5;

    this.polar = 0.88;
    this.goalPolar = 0.88;

    this.azimuth = 0.0;
    this.goalAzimuth = 0.0;

    this.keys = new Set();
    this._dragMode = null; // 'orbit' | 'orbit-pending' | 'pan' | null
    this._downBtn = -1;
    this._downX = 0;
    this._downY = 0;
    this._lastX = 0;
    this._lastY = 0;
    this._moved = false;

    this._bindEvents();
    this._applyTransform();
  }

  _bindEvents() {
    this._onPointerDown = (e) => {
      if (e.target !== this.dom && !this.dom.contains(e.target)) return;
      this._downBtn = e.button;
      this._downX = e.clientX;
      this._downY = e.clientY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this._moved = false;
      if (e.button === 1 || (e.button === 0 && e.altKey)) {
        this._dragMode = 'orbit';
      } else if (e.button === 2) {
        this._dragMode = 'pan';
      } else if (e.button === 0) {
        this._dragMode = 'orbit-pending';
      }
    };

    this._onPointerMove = (e) => {
      const dxTotal = e.clientX - this._downX;
      const dyTotal = e.clientY - this._downY;
      const distSq = dxTotal * dxTotal + dyTotal * dyTotal;

      if (this._dragMode && distSq >= 25) {
        this._moved = true;
        if (this._dragMode === 'orbit-pending') this._dragMode = 'orbit';
      }

      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;

      if (this._moved && this._dragMode === 'orbit') {
        this.goalAzimuth -= dx * 0.0055;
        this.goalPolar = THREE.MathUtils.clamp(this.goalPolar - dy * 0.0045, MIN_POLAR, MAX_POLAR);
      } else if (this._moved && this._dragMode === 'pan') {
        this._panScreen(dx, dy);
      } else if (!this._dragMode && this.onHoverScreen) {
        this.onHoverScreen(e.clientX, e.clientY);
      }
    };

    this._onPointerUp = (e) => {
      if (this._downBtn === -1) return;
      const dx = e.clientX - this._downX;
      const dy = e.clientY - this._downY;
      const isShort = (dx * dx + dy * dy) < 25;

      if (isShort) {
        if (e.button === 0 && this.onClickScreen) {
          this.onClickScreen(e.clientX, e.clientY, {
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey || e.metaKey
          });
        } else if (e.button === 2 && this.onRightClickScreen) {
          this.onRightClickScreen(e.clientX, e.clientY);
        }
      }
      this._dragMode = null;
      this._downBtn = -1;
      this._moved = false;
    };

    this._onWheel = (e) => {
      e.preventDefault();
      const factor = 1 + Math.sign(e.deltaY) * 0.10;
      this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, MIN_DIST, MAX_DIST);
    };

    this._onContextMenu = (e) => {
      e.preventDefault();
    };

    this._onKeyDown = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      this.keys.add(e.code);
    };

    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };

    this.dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    this.dom.addEventListener('wheel', this._onWheel, { passive: false });
    this.dom.addEventListener('contextmenu', this._onContextMenu);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  _panScreen(dx, dy) {
    const scale = this.distance * 0.0014;
    const sinA = Math.sin(this.azimuth);
    const cosA = Math.cos(this.azimuth);
    const moveX = (-dx * cosA - dy * sinA) * scale;
    const moveZ = (dx * sinA - dy * cosA) * scale;
    this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x + moveX, 0.5, this.mapW - 0.5);
    this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z + moveZ, 0.5, this.mapH - 0.5);
  }

  focusCell(x, y, instant = false) {
    this.goalTarget.set(
      THREE.MathUtils.clamp(x + 0.5, 0.5, this.mapW - 0.5),
      0.4,
      THREE.MathUtils.clamp(y + 0.5, 0.5, this.mapH - 0.5)
    );
    if (instant) {
      this.target.copy(this.goalTarget);
      this._applyTransform();
    }
  }

  rotateBy(deltaRad) {
    this.goalAzimuth += deltaRad;
  }

  zoomBy(deltaDist) {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance + deltaDist, MIN_DIST, MAX_DIST);
  }

  setAspect(aspect) {
    if (!aspect || !isFinite(aspect)) return;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt, modalOpen = false) {
    if (!modalOpen) {
      const panSpd = (this.distance * 0.85) * dt;
      let fx = 0, fz = 0;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fz -= 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fz += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) fx -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) fx += 1;
      if (fx !== 0 || fz !== 0) {
        const len = Math.hypot(fx, fz);
        fx /= len;
        fz /= len;
        const sinA = Math.sin(this.azimuth);
        const cosA = Math.cos(this.azimuth);
        const wx = (fx * cosA + fz * sinA) * panSpd;
        const wz = (-fx * sinA + fz * cosA) * panSpd;
        this.goalTarget.x = THREE.MathUtils.clamp(this.goalTarget.x + wx, 0.5, this.mapW - 0.5);
        this.goalTarget.z = THREE.MathUtils.clamp(this.goalTarget.z + wz, 0.5, this.mapH - 0.5);
      }

      if (this.keys.has('KeyQ')) this.goalAzimuth -= 1.35 * dt;
      if (this.keys.has('KeyE')) this.goalAzimuth += 1.35 * dt;
    }

    const alpha = 1 - Math.exp(-10 * Math.min(dt, 0.08));
    this.target.lerp(this.goalTarget, alpha);
    this.distance = THREE.MathUtils.lerp(this.distance, this.goalDistance, alpha);
    this.polar = THREE.MathUtils.lerp(this.polar, this.goalPolar, alpha);
    this.azimuth = THREE.MathUtils.lerp(this.azimuth, this.goalAzimuth, alpha);

    this._applyTransform();
  }

  _applyTransform() {
    const sinP = Math.sin(this.polar);
    const cosP = Math.cos(this.polar);
    const sinA = Math.sin(this.azimuth);
    const cosA = Math.cos(this.azimuth);

    this.camera.position.set(
      this.target.x + this.distance * sinP * sinA,
      this.target.y + this.distance * cosP,
      this.target.z + this.distance * sinP * cosA
    );
    this.camera.lookAt(this.target);
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    this.dom.removeEventListener('wheel', this._onWheel);
    this.dom.removeEventListener('contextmenu', this._onContextMenu);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }
}

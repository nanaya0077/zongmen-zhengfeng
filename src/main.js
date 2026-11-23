import { D, Wd, Ai, Sim } from './simBridge.js';
import { View3D } from './view3d/View3D.js';
import { createHud } from './ui/hud.js';
import { createPanel } from './ui/panel.js';
import { createModals } from './ui/modals.js';
import { createLogView } from './ui/log.js';

const SAVE_KEY = 'zongmen_slg_save_v2';

const viewportEl = document.getElementById('viewport');

let world = null;
let player = null;
let view3d = null;
let rafId = 0;
let lastTs = 0;
let recruitOpen = false;
let endShown = false;
let lastSavedYear = 1;

const uiState = {
  selectedCell: null,
  selectedCultIds: new Set(),
  hoverCell: null,
  previewCityCell: null,
  showTerritoryOverlay: true,
  modalOpen: false
};

const modals = createModals(uiState);
const hud = createHud({
  onOpenRoster: () => {
    if (!world || world.over) return;
    modals.openRoster(world, player, {
      onLocate: (x, y, cultId) => {
        selectCell(x, y, cultId ? [cultId] : null);
        view3d.focusCell(x, y);
      },
      onMutate: () => {
        panel.invalidate();
        hud.invalidate();
      }
    });
  },
  onOpenRank: () => {
    if (!world) return;
    modals.openRankings(world, {
      onLocate: (x, y) => {
        selectCell(x, y);
        view3d.focusCell(x, y);
      }
    });
  },
  onSave: () => saveGame(false),
  onLoad: () => loadGame(),
  onResetHome: () => {
    if (player && player.home) view3d.focusCell(player.home.x, player.home.y);
  },
  onToggleBorder: () => {
    uiState.showTerritoryOverlay = !uiState.showTerritoryOverlay;
  },
  onRotate: (rad) => {
    if (view3d) view3d.rotateBy(rad);
  }
});

const panel = createPanel({
  onUpdate: () => hud.invalidate()
});

const logView = createLogView({
  onFocusCoord: (x, y) => {
    selectCell(x, y);
    if (view3d) view3d.focusCell(x, y);
  }
});

hud.bindControls(() => world, () => player);

function getMineAt(x, y) {
  if (!player) return [];
  return player.cultivators.filter(c =>
    c.alive && c.pos && c.pos.x === x && c.pos.y === y
  );
}

function selectCell(x, y, explicitIds = null) {
  uiState.selectedCell = { x, y };
  uiState.previewCityCell = null;
  uiState.selectedCultIds.clear();
  const mine = getMineAt(x, y);
  if (explicitIds && explicitIds.length) {
    explicitIds.forEach(id => {
      if (mine.some(c => c.id === id)) uiState.selectedCultIds.add(id);
    });
  } else {
    mine.forEach(c => uiState.selectedCultIds.add(c.id));
  }
  panel.invalidate();
}

function clearSelection() {
  uiState.selectedCell = null;
  uiState.selectedCultIds.clear();
  uiState.previewCityCell = null;
  panel.invalidate();
}

function dispatchSelectedTo(tx, ty) {
  if (!uiState.selectedCell) return false;
  const from = uiState.selectedCell;
  if (from.x === tx && from.y === ty) return false;
  const mine = getMineAt(from.x, from.y);
  if (!mine.length) return false;

  const chosen = uiState.selectedCultIds.size > 0
    ? mine.filter(c => uiState.selectedCultIds.has(c.id))
    : mine;
  if (!chosen.length) return false;

  const target = world.at(tx, ty);
  let moved = 0;
  chosen.forEach(c => {
    c.post = { x: tx, y: ty };
    if (Ai.orderMove(world, c, target)) moved++;
  });
  if (moved > 0) {
    world.movedOnce = true;
    Wd.addLog(world, `派出 ${moved} 名修士前往 (${tx},${ty})`, 'war');
    panel.invalidate();
    return true;
  }
  return false;
}

function handleCellClick(cellPos) {
  if (!cellPos || !world || uiState.modalOpen) return;

  // 再点已选中格 = 取消选中
  if (uiState.selectedCell && cellPos.x === uiState.selectedCell.x && cellPos.y === uiState.selectedCell.y) {
    clearSelection();
    return;
  }

  // 若已选中某队，且当前选中列表非空并点向其他格子 -> 优先派兵；若该格无选中待派己方修士则切换选中
  if (uiState.selectedCell && uiState.selectedCultIds.size > 0) {
    const mineHere = getMineAt(uiState.selectedCell.x, uiState.selectedCell.y);
    const hasSelected = mineHere.some(c => uiState.selectedCultIds.has(c.id));
    if (hasSelected && dispatchSelectedTo(cellPos.x, cellPos.y)) {
      return;
    }
  }

  // 选中新格（若有己方修士则默认全选该格修士）
  selectCell(cellPos.x, cellPos.y);
}

function handleCellRightClick(cellPos) {
  if (!cellPos || !world || uiState.modalOpen || !uiState.selectedCell) return;
  dispatchSelectedTo(cellPos.x, cellPos.y);
}

function saveGame(silent = true) {
  if (!world) return;
  try {
    const snapshot = {
      seed: world.seed,
      year: world.year,
      t: world.t,
      speed: world.speed,
      lastRecruitYear: world.lastRecruitYear || 0,
      movedOnce: !!world.movedOnce,
      autoRecruit: !!world.autoRecruit,
      log: world.log,
      logSeq: world.logSeq || 0,
      cells: world.cells.map(c => ({
        x: c.x, y: c.y, t: c.t, h: c.h,
        owner: c.owner, village: c.village, city: c.city,
        outYears: c.outYears, outSec: c.outSec || 0
      })),
      sects: world.sects
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
    if (!silent) Wd.addLog(world, `存档成功（第 ${world.year} 年）`, 'good');
  } catch (e) {
    if (!silent) Wd.addLog(world, '存档失败：存储空间受限', 'bad');
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      Wd.addLog(world, '未找到本地存档', 'bad');
      return;
    }
    const snap = JSON.parse(raw);
    const W = D.CFG.W;
    const restored = {
      seed: snap.seed,
      rnd: Wd.mulberry32((snap.seed ^ ((snap.year || 1) * 2654435761)) >>> 0),
      cells: snap.cells.map(c => ({ ...c, battle: null })),
      at: null,
      sects: snap.sects,
      year: snap.year,
      t: snap.t,
      speed: snap.speed || D.CFG.DEFAULT_SPEED,
      paused: false,
      log: snap.log || [],
      logSeq: (snap.logSeq || 0) + 1,
      fxEvents: [],
      recruitPending: null,
      over: null,
      selected: null,
      hover: null,
      lastRecruitYear: snap.lastRecruitYear || 0,
      movedOnce: !!snap.movedOnce,
      autoRecruit: !!snap.autoRecruit
    };
    restored.at = (x, y) => restored.cells[y * W + x];

    world = restored;
    player = world.sects.A;
    lastSavedYear = world.year;
    recruitOpen = false;
    endShown = false;
    modals.close();
    clearSelection();

    Wd.addLog(world, `已读取存档（第 ${world.year} 年）`, 'good');
    if (view3d) {
      view3d.resetWorld(world);
    }
    hud.invalidate();
    panel.invalidate();
    logView.invalidate();
    if (typeof window !== 'undefined') window.__game = () => world;
  } catch (e) {
    if (world) Wd.addLog(world, '读档失败：存档格式异常', 'bad');
  }
}

function init(seed, showGuide = true) {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  world = Wd.createWorld(seed);
  player = world.sects.A;
  player.auto = false;
  lastSavedYear = 1;
  lastTs = 0;
  recruitOpen = false;
  endShown = false;
  clearSelection();
  modals.close();

  Wd.addLog(world, `青云宗立派于 (${player.home.x},${player.home.y})，志在九州`, 'good');

  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const skip = Number(q.get('skip') || 0);
  if (skip > 0) {
    const wasPlayer = world.sects.A.isPlayer;
    world.sects.A.isPlayer = false;
    for (let i = 0; i < skip * D.CFG.YEAR_SECONDS; i++) {
      world.recruitPending = null;
      world.paused = false;
      Sim.tick(world, 1);
      if (world.over) break;
    }
    world.sects.A.isPlayer = wasPlayer;
    world.paused = false;
    lastSavedYear = world.year;
  } else if (showGuide) {
    world.paused = true;
    modals.showIntro(() => {
      world.paused = false;
    });
  } else {
    world.paused = false;
  }

  if (!view3d) {
    view3d = new View3D(viewportEl, world, {
      onCellHover: (pos) => { uiState.hoverCell = pos; },
      onCellClick: (pos, mods) => handleCellClick(pos, mods),
      onCellRightClick: (pos) => handleCellRightClick(pos)
    });
  } else {
    view3d.resetWorld(world);
  }

  hud.invalidate();
  panel.invalidate();
  logView.invalidate();

  if (typeof window !== 'undefined') {
    window.__game = () => world;
    window.__SLG = { Sim, Ai, Wd, D };
    window.__view3d = view3d;
  }

  rafId = requestAnimationFrame(frame);
}

function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dtReal = Math.min(0.08, (ts - lastTs) / 1000);
  lastTs = ts;

  if (!world.paused && !world.over) {
    const dtGame = dtReal * world.speed;
    Sim.tick(world, dtGame);
    if (player.auto) Ai.aiThink(world, player, dtGame);
    if (world.year > lastSavedYear) {
      lastSavedYear = world.year;
      saveGame(true);
    }
  }

  if (world.recruitPending && !recruitOpen) {
    recruitOpen = true;
    modals.openRecruit(world, player, () => {
      recruitOpen = false;
      panel.invalidate();
      hud.invalidate();
    });
  }

  if (world.over && !recruitOpen && !endShown) {
    endShown = true;
    modals.showEnd(world, player, () => {
      init((Math.random() * 1e9) | 0, false);
    });
  }

  view3d.sync(world, uiState, dtReal);
  hud.update(world, uiState);
  panel.update(world, uiState);
  logView.update(world);

  rafId = requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  if (view3d) view3d.resize();
});

document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

  if (e.code === 'Space') {
    if (modals.isOpen()) return; // B10：弹窗打开时屏蔽空格
    e.preventDefault();
    world.paused = !world.paused;
    return;
  }

  if (e.code === 'Escape') {
    if (modals.isOpen() && modals.kind() !== 'recruit' && modals.kind() !== 'end') {
      modals.close();
      return;
    }
    if (!modals.isOpen()) clearSelection();
    return;
  }

  if ((e.code === 'KeyH' || e.code === 'Home') && !modals.isOpen()) {
    if (player && player.home && view3d) view3d.focusCell(player.home.x, player.home.y);
  }
});

init(20261120, true);

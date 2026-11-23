import { Wd, Sim } from '../simBridge.js';

export function createHud({ onOpenRoster, onOpenRank, onSave, onLoad, onResetHome, onToggleBorder, onRotate }) {
  const lvEl = document.getElementById('lv');
  const dateEl = document.getElementById('date');
  const statsEl = document.getElementById('stats');
  const autoBtn = document.getElementById('autoBtn');
  const pauseBanner = document.getElementById('pauseBanner');
  const borderBtn = document.getElementById('borderBtn');
  const sidebar = document.getElementById('sidebar');
  const collapseBtn = document.getElementById('collapseBtn');

  const STAT_LABELS = ['灵石', '木材', '矿石', '铜钱', '人口', '修士', '声望', '领地'];
  const chipNodes = STAT_LABELS.map(label => {
    const div = document.createElement('div');
    div.className = 'chip';
    const sp = document.createElement('span');
    sp.textContent = label;
    const b = document.createElement('b');
    b.textContent = '0';
    div.appendChild(sp);
    div.appendChild(b);
    statsEl.appendChild(div);
    return b;
  });

  const spdButtons = Array.from(document.querySelectorAll('.spd[data-spd]'));
  let lastHudSig = '';
  let lastAutoSig = '';
  let lastSpdSig = '';
  let lastBanner = false;

  collapseBtn.onclick = () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    collapseBtn.textContent = collapsed ? '‹' : '›';
  };

  document.getElementById('rosterBtn').onclick = onOpenRoster;
  document.getElementById('rankBtn').onclick = onOpenRank;
  document.getElementById('saveBtn').onclick = onSave;
  document.getElementById('loadBtn').onclick = onLoad;
  document.getElementById('homeBtn').onclick = onResetHome;
  document.getElementById('rotLBtn').onclick = () => onRotate(-0.45);
  document.getElementById('rotRBtn').onclick = () => onRotate(0.45);
  borderBtn.onclick = onToggleBorder;

  function bindControls(getWorld, getPlayer) {
    spdButtons.forEach(b => {
      b.onclick = () => {
        const w = getWorld();
        if (!w) return;
        const sp = Number(b.dataset.spd);
        if (sp === 0) w.paused = true;
        else {
          w.paused = false;
          w.speed = sp;
        }
      };
    });

    autoBtn.onclick = () => {
      const p = getPlayer();
      if (!p) return;
      p.auto = !p.auto;
      autoBtn.textContent = '托管：' + (p.auto ? '开' : '关');
      autoBtn.classList.toggle('on', !!p.auto);
    };
  }

  function update(world, uiState) {
    const s = world.sects.A;
    const month = Sim.monthOf(world.t) + 1;
    const owned = Wd.countOwned(world, s);

    const vals = [
      String(Math.round(s.stones)),
      String(Math.round(s.wood)),
      String(Math.round(s.ore)),
      String(Math.round(s.copper)),
      String(s.pop),
      `${s.cultivators.length}/${s.housing}`,
      String(Math.round(s.rep)),
      String(owned)
    ];

    const hudSig = `${s.level}|${world.year}|${month}|${vals.join('|')}`;
    if (hudSig !== lastHudSig) {
      lastHudSig = hudSig;
      lvEl.textContent = `Lv.${s.level}`;
      dateEl.textContent = `第 ${world.year} 年 ${month} 月`;
      for (let i = 0; i < vals.length; i++) {
        if (chipNodes[i].textContent !== vals[i]) chipNodes[i].textContent = vals[i];
      }
    }

    const spdSig = `${world.paused ? 0 : world.speed}`;
    if (spdSig !== lastSpdSig) {
      lastSpdSig = spdSig;
      spdButtons.forEach(b => {
        const sp = Number(b.dataset.spd);
        const on = world.paused ? sp === 0 : sp === world.speed;
        b.classList.toggle('on', on);
      });
    }

    const autoSig = `${!!s.auto}|${!!uiState.showTerritoryOverlay}`;
    if (autoSig !== lastAutoSig) {
      lastAutoSig = autoSig;
      autoBtn.textContent = '托管：' + (s.auto ? '开' : '关');
      autoBtn.classList.toggle('on', !!s.auto);
      borderBtn.textContent = '疆域：' + (uiState.showTerritoryOverlay ? '开' : '关');
      borderBtn.classList.toggle('on', !!uiState.showTerritoryOverlay);
    }

    const showBanner = !!world.paused && !world.over && !uiState.modalOpen;
    if (showBanner !== lastBanner) {
      lastBanner = showBanner;
      pauseBanner.classList.toggle('show', showBanner);
    }
  }

  function invalidate() {
    lastHudSig = '';
    lastAutoSig = '';
    lastSpdSig = '';
  }

  return { bindControls, update, invalidate };
}

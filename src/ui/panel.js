import { D, Wd } from '../simBridge.js';

export function createPanel({ onUpdate }) {
  const el = document.getElementById('panel');
  let lastSig = '';

  function buildSig(world, uiState) {
    const s = world.sects.A;
    const sel = uiState.selectedCell;
    const selIds = Array.from(uiState.selectedCultIds || []).sort().join(',');
    const base = `${s.level}|${Math.round(s.wood)}|${Math.round(s.ore)}|${Math.round(s.stones)}|${Math.round(s.copper)}|${s.pop}|${Math.round(s.rep)}|${s.cities.length}|${s.cultivators.length}|${s.housing}`;
    if (!sel) return `overview|${base}`;

    const c = world.at(sel.x, sel.y);
    const here = [];
    Object.keys(world.sects).forEach(id => {
      if (world.sects[id].dead) return;
      world.sects[id].cultivators.forEach(cu => {
        if (cu.alive && cu.pos && cu.pos.x === c.x && cu.pos.y === c.y) {
          here.push(`${cu.id}:${cu.realm}:${Math.round(cu.hp)}:${cu.state}:${cu.talisman || 0}:${cu.path ? cu.path.length : 0}`);
        }
      });
    });
    return `cell|${c.x},${c.y}|${c.owner || ''}|${c.city}|${c.battle ? 1 : 0}|${Math.floor((c.outSec || 0) / 5)}|${selIds}|${here.join(';')}|${base}`;
  }

  function update(world, uiState) {
    const sig = buildSig(world, uiState);
    if (sig === lastSig) return;
    lastSig = sig;

    const s = world.sects.A;
    const sel = uiState.selectedCell;

    if (sel) {
      renderCellPanel(world, s, world.at(sel.x, sel.y), uiState);
    } else {
      renderOverviewPanel(world, s);
    }
  }

  function renderCellPanel(world, player, c, uiState) {
    const owner = c.owner ? world.sects[c.owner] : null;
    const here = [];
    Object.keys(world.sects).forEach(id => {
      if (world.sects[id].dead) return;
      world.sects[id].cultivators.forEach(cu => {
        if (cu.alive && cu.pos && cu.pos.x === c.x && cu.pos.y === c.y) here.push(cu);
      });
    });
    const mine = here.filter(cu => cu.sect === 'A');
    const enemies = here.filter(cu => cu.sect !== 'A');
    const tDef = D.TERRAIN[c.t];

    let decayHtml = '';
    if (c.owner && (c.outSec || 0) > 0) {
      const rem = Math.max(0, Math.ceil(D.CFG.YEAR_SECONDS - c.outSec));
      decayHtml = `<div class="row"><span>荒废倒计时</span><b style="color:#f09999">${rem} 秒</b></div>`;
    }

    let html = `<div class="name">${tDef.name} (${c.x},${c.y})<span class="tag">移速 ${Math.round(tDef.speed * 100)}%</span></div>`;
    html += `<div class="row"><span>归属</span><b style="color:${owner ? owner.color : '#8b9a97'}">${owner ? owner.name : '无主'}</b></div>`;
    html += `<div class="row"><span>产出</span><b>${tDef.yield}</b></div>`;
    if (c.village) html += `<div class="row"><span>村落</span><b style="color:#ffe9a8">有（永久据点）</b></div>`;
    if (c.city) html += `<div class="row"><span>城池</span><b style="color:#7fe7c8">是（辐射 3 格）</b></div>`;
    html += decayHtml;
    html += `<div class="row"><span>在场修士</span><b>我方 ${mine.length} · 他宗 ${enemies.length}</b></div>`;

    if (mine.length) {
      const selSet = uiState.selectedCultIds;
      const selectedMine = mine.filter(cu => selSet.has(cu.id));
      html += `<div class="sec-title">分兵派遣（已选 ${selectedMine.length}/${mine.length}）</div>`;
      html += `<div class="split-bar">
        <button class="btn sm" data-split="all">全选</button>
        <button class="btn sm" data-split="one">派1人</button>
        <button class="btn sm" data-split="half">派一半</button>
        <button class="btn sm" data-split="idle">只选闲置</button>
      </div>`;

      html += '<div class="cults">';
      mine.forEach(cu => {
        const isSel = selSet.has(cu.id);
        const rate = Math.round(Wd.cultivationRate(cu, player.level));
        const stText = cu.state === 'fighting' ? '交战中' : (cu.path && cu.path.length ? '行军中' : '闲置');
        const tip = `灵根越多灵力越强、修炼越慢（${cu.lg.name} 修炼×${cu.lg.rate} / 灵力×${0.5 * cu.lg.n}）；悟性${cu.attrs.wu} 神识${cu.attrs.shen}`;
        const talismanTag = (cu.talisman || 0) > 0 ? '<span class="tag" style="color:#ffe9a8">符</span>' : '';

        html += `<div class="cult ${isSel ? 'sel' : ''}" data-cult-id="${cu.id}" title="${tip}">
          <div class="cult-top">
            <span>${cu.name} <span class="tag">${D.REALMS[cu.realm]}</span>${talismanTag}</span>
            <span style="color:${cu.state === 'fighting' ? '#f09999' : '#7fe7c8'};font-size:11px">${stText}</span>
          </div>
          <div class="cult-meta">
            <span>${cu.lg.name} · ${cu.phys.name}</span>
            <span>战力 ${cu.power.toFixed(1)}</span>
          </div>
          <div class="cult-meta">
            <span>血量 ${Math.round(cu.hp)}/${cu.maxHp}</span>
            <span>修炼 +${rate}/年</span>
          </div>
          <div class="cult-ops">
            <button class="btn sm gold" data-op="boost" data-cid="${cu.id}" ${player.stones >= D.CFG.BOOST_STONES && cu.realm < 6 ? '' : 'disabled'}>灌顶(100石)</button>
            <button class="btn sm" data-op="talisman" data-cid="${cu.id}" ${!(cu.talisman > 0) && player.stones >= D.CFG.TALISMAN_STONES && player.ore >= D.CFG.TALISMAN_ORE ? '' : 'disabled'}>护身符(150石80矿)</button>
          </div>
        </div>`;
      });
      html += '</div>';
      html += `<div class="hint">左键点目标格或右键快捷派兵（将派出所选 ${selectedMine.length} 人）</div>`;
    }

    if (c.owner === 'A' && !c.city && (c.t === 'P' || c.t === 'R')) {
      const can = player.wood >= D.CFG.CITY_WOOD &&
        player.ore >= D.CFG.CITY_ORE &&
        player.stones >= D.CFG.CITY_STONES &&
        player.cities.length < player.level * 2;
      html += `<button class="btn wide gold" id="buildCity" ${can ? '' : 'disabled'}>建城（木${D.CFG.CITY_WOOD} 矿${D.CFG.CITY_ORE} 石${D.CFG.CITY_STONES}）</button>`;
    }

    el.innerHTML = html;

    // Bind split dispatch buttons
    el.querySelectorAll('[data-split]').forEach(btn => {
      btn.onclick = () => {
        const mode = btn.dataset.split;
        uiState.selectedCultIds.clear();
        if (mode === 'all') {
          mine.forEach(cu => uiState.selectedCultIds.add(cu.id));
        } else if (mode === 'one') {
          const idleOne = mine.find(cu => !cu.path || !cu.path.length) || mine[0];
          if (idleOne) uiState.selectedCultIds.add(idleOne.id);
        } else if (mode === 'half') {
          const cnt = Math.max(1, Math.ceil(mine.length / 2));
          for (let i = 0; i < cnt; i++) uiState.selectedCultIds.add(mine[i].id);
        } else if (mode === 'idle') {
          mine.filter(cu => !cu.path || !cu.path.length).forEach(cu => uiState.selectedCultIds.add(cu.id));
        }
        lastSig = '';
        update(world, uiState);
        if (onUpdate) onUpdate();
      };
    });

    // Bind cultivator selection & mini ops
    el.querySelectorAll('.cult[data-cult-id]').forEach(card => {
      card.onclick = (e) => {
        if (e.target.closest('[data-op]')) return;
        const cid = card.dataset.cultId;
        if (uiState.selectedCultIds.has(cid)) uiState.selectedCultIds.delete(cid);
        else uiState.selectedCultIds.add(cid);
        lastSig = '';
        update(world, uiState);
        if (onUpdate) onUpdate();
      };
    });

    el.querySelectorAll('[data-op]').forEach(opBtn => {
      opBtn.onclick = (e) => {
        e.stopPropagation();
        const cid = opBtn.dataset.cid;
        const cult = player.cultivators.find(cu => cu.id === cid);
        if (!cult) return;
        const err = opBtn.dataset.op === 'boost'
          ? Wd.boostCultivator(world, player, cult)
          : Wd.craftTalisman(world, player, cult);
        if (err) Wd.addLog(world, err, 'bad');
        lastSig = '';
        update(world, uiState);
        if (onUpdate) onUpdate();
      };
    });

    const buildBtn = document.getElementById('buildCity');
    if (buildBtn) {
      buildBtn.onmouseenter = () => {
        uiState.previewCityCell = { x: c.x, y: c.y };
      };
      buildBtn.onmouseleave = () => {
        uiState.previewCityCell = null;
      };
      buildBtn.onclick = () => {
        uiState.previewCityCell = null;
        const err = Wd.buildCity(world, player, c);
        if (err) Wd.addLog(world, err, 'bad');
        lastSig = '';
        update(world, uiState);
        if (onUpdate) onUpdate();
      };
    }
  }

  function renderOverviewPanel(world, s) {
    const req = D.LEVEL_REQ[s.level + 1];
    const fmtGoal = (cur, need) => {
      const ok = cur >= need;
      return `<b style="color:${ok ? '#7fe7c8' : '#e6b87d'}">${Math.round(cur)} / ${need}</b>`;
    };

    let html = `<div class="name">${s.name}<span class="tag">${s.level} 级宗门</span></div>`;
    html += `<div class="row"><span>势力半径</span><b>${Wd.radiusOf(s.level)} 格</b></div>`;
    html += `<div class="row"><span>城池数量</span><b>${s.cities.length} / ${s.level * 2}</b></div>`;
    html += `<div class="row"><span>门下修士</span><b>${s.cultivators.length} / ${s.housing} 床位</b></div>`;
    html += `<div class="row"><span>招募上限</span><b>${D.REALMS[Wd.levelMaxRealm(s.level)]}</b></div>`;

    if (req) {
      html += `<div class="sec-title">晋升 ${s.level + 1} 级条件</div>`;
      html += `<div class="row"><span>宗门人口</span>${fmtGoal(s.pop, req.pop)}</div>`;
      html += `<div class="row"><span>宗门声望</span>${fmtGoal(s.rep, req.rep)}</div>`;
      html += `<div class="row"><span>木材储备</span>${fmtGoal(s.wood, req.wood)}</div>`;
      html += `<div class="row"><span>矿石储备</span>${fmtGoal(s.ore, req.ore)}</div>`;
      html += `<div class="row"><span>灵石储备</span>${fmtGoal(s.stones, req.stones)}</div>`;
    } else {
      html += `<div class="sec-title">已达十级无上仙宗</div>`;
    }

    html += `<div class="sec-title">凡俗内政（铜钱开销）</div>`;
    html += `<div class="act-grid">
      <button class="btn sm" data-copper="pop" ${s.copper >= D.CFG.LEVY_COPPER ? '' : 'disabled'}>招徕流民（200钱 → +${D.CFG.LEVY_POP}人口）</button>
      <button class="btn sm" data-copper="wood" ${s.copper >= D.CFG.MARKET_COPPER ? '' : 'disabled'}>采买木材（200钱 → +${D.CFG.MARKET_WOOD}木材）</button>
      <button class="btn sm" data-copper="ore" ${s.copper >= D.CFG.MARKET_COPPER ? '' : 'disabled'}>采买矿石（200钱 → +${D.CFG.MARKET_ORE}矿石）</button>
    </div>`;

    html += `<div class="hint">点击地图格选中己方修士或查看地脉详情。<br>空格暂停/继续 · H 键飞回山门</div>`;
    el.innerHTML = html;

    el.querySelectorAll('[data-copper]').forEach(btn => {
      btn.onclick = () => {
        const err = Wd.spendCopper(world, s, btn.dataset.copper);
        if (err) Wd.addLog(world, err, 'bad');
        lastSig = '';
        update(world, { selectedCell: null });
        if (onUpdate) onUpdate();
      };
    });
  }

  function invalidate() {
    lastSig = '';
  }

  return { update, invalidate };
}

import { D, Wd, Ai } from '../simBridge.js';

export function createModals(uiState) {
  const overlay = document.getElementById('overlay');
  const modal = document.getElementById('modal');
  let currentKind = null; // 'intro' | 'recruit' | 'roster' | 'rank' | 'end' | null

  function setOpen(kind) {
    currentKind = kind;
    uiState.modalOpen = !!kind;
    overlay.classList.toggle('show', !!kind);
  }

  function close() {
    if (currentKind === 'end') return; // 结局弹窗不可直接 Esc 跳过
    setOpen(null);
  }

  function showIntro(onStart) {
    setOpen('intro');
    modal.innerHTML =
      '<h2>宗 门 争 锋 · 青 绿 沙 盘</h2>' +
      '<p class="sub">你是青云宗宗主。十家宗门分据九州，灵脉有限，唯有以谋略定鼎仙途。</p>' +
      '<div style="font-size:13px;line-height:1.95;color:#b2c9c3">' +
      '· <b style="color:#ffe9a8">左键短按</b>选中格或己方修士，在右侧面板可<b>分兵单选 / 派1人 / 派一半</b>，再点目标格或<b>右键</b>派兵<br>' +
      '· <b style="color:#ffe9a8">右键拖动 / WASD</b> 平移九州视界，<b>滚轮</b>缩放，<b>Q/E 或中键拖动</b>旋转视角，<b>H</b> 飞回山门<br>' +
      '· 修士走过即占领；脱离势力范围且无人驻守的土地，累计满 1 年（300 游戏秒）才会荒废<br>' +
      '· 每年六月开启招募大会；在平原或河流建城可将势力范围向外推进 3 格<br>' +
      '· 攻占天下六成领地（360 格），或灭尽诸宗山门，即为一统九州' +
      '</div>' +
      '<div style="display:flex;justify-content:flex-end;margin-top:16px">' +
      '<button class="btn gold" id="startBtn">入 世 掌 宗</button></div>';

    document.getElementById('startBtn').onclick = () => {
      setOpen(null);
      if (onStart) onStart();
    };
  }

  function openRecruit(world, player, onDone) {
    setOpen('recruit');
    world.paused = true;
    const rawCands = world.recruitPending || [];
    const free = Math.max(0, player.housing - player.cultivators.length);
    const picked = new Set();
    let sortMode = 'score';

    const sortList = () => {
      const arr = rawCands.map((c, idx) => ({ c, idx }));
      arr.sort((a, b) => {
        if (sortMode === 'rate') return Wd.cultivationRate(b.c, player.level) - Wd.cultivationRate(a.c, player.level);
        if (sortMode === 'power') return b.c.power - a.c.power;
        return Ai.scoreCandidate(b.c) - Ai.scoreCandidate(a.c);
      });
      return arr;
    };

    const renderBody = () => {
      const sorted = sortList();
      modal.innerHTML =
        `<h2>六 月 · 招 募 大 会</h2>
         <p class="sub">宗门当前余位 <b>${free}</b> 人（已选 ${picked.size}/${free}）。灵根越少修炼越快，灵根越多同境灵力越强。</p>
         <div class="modal-toolbar">
           <button class="btn sm ${sortMode === 'score' ? 'gold' : ''}" data-sort="score">按综合评分</button>
           <button class="btn sm ${sortMode === 'rate' ? 'gold' : ''}" data-sort="rate">按修炼速度</button>
           <button class="btn sm ${sortMode === 'power' ? 'gold' : ''}" data-sort="power">按当前战力</button>
           <button class="btn sm" id="pickBestBtn">一键择优</button>
           <label style="margin-left:auto;font-size:12px;color:#9ec9bf;display:flex;align-items:center;gap:5px;cursor:pointer">
             <input type="checkbox" id="autoRecruitChk" ${world.autoRecruit ? 'checked' : ''}> 托管时自动招募
           </label>
         </div>
         <div class="cands" id="cands"></div>
         <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
           <button class="btn" id="skipBtn">全部不收</button>
           <button class="btn gold" id="okBtn">收入门中（${picked.size}）</button>
         </div>`;

      const box = document.getElementById('cands');
      sorted.forEach(({ c, idx }) => {
        const rate = Math.round(Wd.cultivationRate(c, player.level));
        const d = document.createElement('div');
        d.className = 'cand' + (picked.has(idx) ? ' on' : '');
        d.title = `灵根越多同境灵力越厚、修炼越慢（${c.lg.name} 修炼×${c.lg.rate}，灵力×${0.5 * c.lg.n}）`;
        d.innerHTML =
          `<div class="cn"><span>${c.name} <span class="tag">${D.REALMS[c.realm]}</span></span><span style="color:#ffe9a8;font-size:11.5px">战力 ${c.power.toFixed(1)}</span></div>
           <div class="cs">${c.lg.name} · ${c.phys.name} · ${c.age} 岁 · 血 ${c.maxHp} · 修炼 +${rate}/年</div>
           <div class="cu">根骨${c.attrs.gen} 力道${c.attrs.li} 内息${c.attrs.nei} · 悟性${c.attrs.wu} 神识${c.attrs.shen} 身法${c.attrs.fa}</div>`;
        d.onclick = () => {
          if (picked.has(idx)) picked.delete(idx);
          else if (picked.size < free) picked.add(idx);
          else Wd.addLog(world, '床位不足', 'bad');
          renderBody();
        };
        box.appendChild(d);
      });

      modal.querySelectorAll('[data-sort]').forEach(b => {
        b.onclick = () => { sortMode = b.dataset.sort; renderBody(); };
      });

      document.getElementById('pickBestBtn').onclick = () => {
        picked.clear();
        for (let i = 0; i < sorted.length && picked.size < free; i++) {
          picked.add(sorted[i].idx);
        }
        renderBody();
      };

      document.getElementById('autoRecruitChk').onchange = (e) => {
        world.autoRecruit = !!e.target.checked;
      };

      document.getElementById('skipBtn').onclick = () => finish([]);
      document.getElementById('okBtn').onclick = () => finish(Array.from(picked).map(i => rawCands[i]));
    };

    const finish = (take) => {
      take.forEach(c => {
        c.pos = { x: player.home.x, y: player.home.y };
        c.prevPos = { x: player.home.x, y: player.home.y };
        player.cultivators.push(c);
        Wd.addLog(world, `${c.name} 入门（${c.lg.name}·${c.phys.name}）`, 'good');
      });
      world.recruitPending = null;
      setOpen(null);
      world.paused = false;
      if (onDone) onDone();
    };

    renderBody();
  }

  function openRoster(world, player, { onLocate, onMutate }) {
    setOpen('roster');
    let filter = 'all';

    const renderBody = () => {
      const list = player.cultivators.filter(c => {
        if (!c.alive) return false;
        if (filter === 'idle') return !c.path || !c.path.length;
        if (filter === 'busy') return (c.path && c.path.length) || c.state === 'fighting';
        if (filter === 'elder') return c.age >= D.REALM_LIFE[c.realm] * 0.72;
        return true;
      }).slice().sort((a, b) => b.power - a.power);

      modal.innerHTML =
        `<div style="display:flex;justify-content:space-between;align-items:center">
           <h2>宗 门 花 名 册</h2>
           <button class="btn sm" id="closeModalBtn">关闭 (Esc)</button>
         </div>
         <p class="sub">门下共 ${player.cultivators.length}/${player.housing} 名修士（灵石 ${Math.round(player.stones)} · 矿石 ${Math.round(player.ore)}）。点击所在坐标可飞镜定位。</p>
         <div class="modal-toolbar">
           <button class="btn sm ${filter === 'all' ? 'gold' : ''}" data-flt="all">全部 (${player.cultivators.length})</button>
           <button class="btn sm ${filter === 'idle' ? 'gold' : ''}" data-flt="idle">闲置</button>
           <button class="btn sm ${filter === 'busy' ? 'gold' : ''}" data-flt="busy">行军/交战</button>
           <button class="btn sm ${filter === 'elder' ? 'gold' : ''}" data-flt="elder">寿元将近</button>
         </div>
         <table class="tbl">
           <thead><tr><th>名号</th><th>境界</th><th>灵根·体质</th><th>战力</th><th>血量</th><th>修炼/年</th><th>寿元</th><th>坐标</th><th>操作</th></tr></thead>
           <tbody id="rosterBody"></tbody>
         </table>`;

      const tbody = document.getElementById('rosterBody');
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="color:#7b948e;text-align:center">暂无符合条件的修士</td></tr>';
      } else {
        list.forEach(c => {
          const tr = document.createElement('tr');
          const lifeMax = D.REALM_LIFE[c.realm];
          const rate = Math.round(Wd.cultivationRate(c, player.level));
          const locText = c.pos ? `(${c.pos.x},${c.pos.y})` : '—';
          tr.innerHTML =
            `<td><b>${c.name}</b>${(c.talisman || 0) > 0 ? ' <span class="tag" style="color:#ffe9a8">符</span>' : ''}</td>
             <td>${D.REALMS[c.realm]}</td>
             <td>${c.lg.name} · ${c.phys.name}</td>
             <td>${c.power.toFixed(1)}</td>
             <td>${Math.round(c.hp)}/${c.maxHp}</td>
             <td>+${rate}</td>
             <td style="color:${c.age >= lifeMax * 0.75 ? '#f09999' : '#9ec9bf'}">${c.age}/${lifeMax}</td>
             <td><button class="log-coord" data-loc="1">${locText}</button></td>
             <td style="display:flex;gap:4px">
               <button class="btn sm gold" data-act="boost" ${player.stones >= D.CFG.BOOST_STONES && c.realm < 6 ? '' : 'disabled'}>灌顶</button>
               <button class="btn sm" data-act="talisman" ${!(c.talisman > 0) && player.stones >= D.CFG.TALISMAN_STONES && player.ore >= D.CFG.TALISMAN_ORE ? '' : 'disabled'}>护身符</button>
               <button class="btn sm danger" data-act="dismiss" ${player.cultivators.length > 1 ? '' : 'disabled'}>遣散</button>
             </td>`;

          const locBtn = tr.querySelector('[data-loc]');
          if (locBtn && c.pos) {
            locBtn.onclick = () => {
              setOpen(null);
              if (onLocate) onLocate(c.pos.x, c.pos.y, c.id);
            };
          }
          tr.querySelector('[data-act="boost"]').onclick = () => {
            const err = Wd.boostCultivator(world, player, c);
            if (err) Wd.addLog(world, err, 'bad');
            if (onMutate) onMutate();
            renderBody();
          };
          tr.querySelector('[data-act="talisman"]').onclick = () => {
            const err = Wd.craftTalisman(world, player, c);
            if (err) Wd.addLog(world, err, 'bad');
            if (onMutate) onMutate();
            renderBody();
          };
          tr.querySelector('[data-act="dismiss"]').onclick = () => {
            const err = Wd.dismissCultivator(world, player, c);
            if (err) Wd.addLog(world, err, 'bad');
            if (onMutate) onMutate();
            renderBody();
          };
          tbody.appendChild(tr);
        });
      }

      modal.querySelectorAll('[data-flt]').forEach(b => {
        b.onclick = () => { filter = b.dataset.flt; renderBody(); };
      });
      document.getElementById('closeModalBtn').onclick = close;
    };

    renderBody();
  }

  function openRankings(world, { onLocate }) {
    setOpen('rank');
    const rows = Object.keys(world.sects).map(id => {
      const s = world.sects[id];
      const owned = Wd.countOwned(world, s);
      let maxR = 0, totalPow = 0;
      s.cultivators.forEach(c => {
        if (!c.alive) return;
        if (c.realm > maxR) maxR = c.realm;
        totalPow += c.power;
      });
      return { s, owned, maxR, totalPow };
    });

    rows.sort((a, b) => {
      if (a.s.dead !== b.s.dead) return a.s.dead ? 1 : -1;
      if (b.owned !== a.owned) return b.owned - a.owned;
      return b.totalPow - a.totalPow;
    });

    modal.innerHTML =
      `<div style="display:flex;justify-content:space-between;align-items:center">
         <h2>九 州 势 力 榜</h2>
         <button class="btn sm" id="closeModalBtn">关闭 (Esc)</button>
       </div>
       <p class="sub">第 ${world.year} 年 · 一统需占下 360 格（60%）或灭尽诸宗。点击存活宗门可飞镜巡视其山门。</p>
       <table class="tbl">
         <thead><tr><th>排名</th><th>宗门</th><th>状态</th><th>等级</th><th>领地</th><th>城池</th><th>修士/床位</th><th>最高境界</th><th>总战力</th></tr></thead>
         <tbody id="rankBody"></tbody>
       </table>`;

    const tbody = document.getElementById('rankBody');
    rows.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.className = r.s.dead ? 'dead-row' : 'click-row';
      const pct = ((r.owned / (D.CFG.W * D.CFG.H)) * 100).toFixed(1);
      tr.innerHTML =
        `<td>${idx + 1}</td>
         <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${r.s.color};margin-right:6px"></span><b>${r.s.name}</b>${r.s.isPlayer ? ' <span class="tag">我方</span>' : ''}</td>
         <td style="color:${r.s.dead ? '#f09999' : '#7fe7c8'}">${r.s.dead ? '灭门' : '存续'}</td>
         <td>Lv.${r.s.level}</td>
         <td>${r.owned} 格 (${pct}%)</td>
         <td>${r.s.cities.length}</td>
         <td>${r.s.cultivators.length}/${r.s.housing}</td>
         <td>${r.s.dead ? '—' : D.REALMS[r.maxR]}</td>
         <td>${r.totalPow.toFixed(1)}</td>`;

      if (!r.s.dead && r.s.home) {
        tr.onclick = () => {
          setOpen(null);
          if (onLocate) onLocate(r.s.home.x, r.s.home.y);
        };
      }
      tbody.appendChild(tr);
    });

    document.getElementById('closeModalBtn').onclick = close;
  }

  function showEnd(world, player, onRestart) {
    setOpen('end');
    const win = world.over === 'win';
    modal.innerHTML =
      `<h2>${win ? '一 统 九 州' : '宗 门 倾 覆'}</h2>
       <p class="sub">${win ? '诸宗俯首，九州灵脉尽归青云。' : '山门破败，道统断绝。'}</p>
       <p class="sub">共历 <b>${world.year}</b> 年，据 <b>${Wd.countOwned(world, player)}</b> 域，宗门等级 Lv.${player.level}。</p>
       <div style="display:flex;justify-content:flex-end;margin-top:14px">
         <button class="btn gold" id="againBtn">重开一世</button>
       </div>`;
    document.getElementById('againBtn').onclick = () => {
      setOpen(null);
      if (onRestart) onRestart();
    };
  }

  return {
    isOpen: () => !!currentKind,
    kind: () => currentKind,
    close,
    showIntro,
    openRecruit,
    openRoster,
    openRankings,
    showEnd
  };
}

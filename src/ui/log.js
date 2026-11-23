export function createLogView({ onFocusCoord }) {
  const el = document.getElementById('log');
  let lastSeq = -1;

  const esc = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const linkifyCoords = (text) => {
    const safe = esc(text);
    return safe.replace(/\((\d+),(\d+)\)/g, (_, x, y) =>
      `<button class="log-coord" data-x="${x}" data-y="${y}" title="点击镜头定位">(${x},${y})</button>`
    );
  };

  el.addEventListener('click', (e) => {
    const btn = e.target.closest('.log-coord');
    if (!btn) return;
    const x = Number(btn.dataset.x);
    const y = Number(btn.dataset.y);
    if (Number.isFinite(x) && Number.isFinite(y) && onFocusCoord) {
      onFocusCoord(x, y);
    }
  });

  function update(world) {
    const seq = world.logSeq || 0;
    if (seq === lastSeq) return;
    lastSeq = seq;

    const lines = world.log.slice(-36).reverse().map(e =>
      `<div class="log-line ${e.kind || 'info'}"><em>第${e.year}年</em>${linkifyCoords(e.text)}</div>`
    ).join('');
    el.innerHTML = lines || '<div class="log-line">——</div>';
  }

  function invalidate() {
    lastSeq = -1;
  }

  return { update, invalidate };
}

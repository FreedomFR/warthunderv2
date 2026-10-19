// Mouse / touch / keyboard control of the viewer camera.
//   drag = orbit   right-drag, middle-drag or shift-drag = pan   wheel = zoom   two fingers = pinch zoom + pan   double click = reset
//   arrows = orbit   shift + arrows = pan   + / - = zoom
export function attachControls(canvas, scene, { onUserInput } = {}) {
  const st = scene.st;
  const ptrs = new Map();
  let vAz = 0, vEl = 0;                    // inertia of the orbit (deg per second)
  let last = 0, lastPinch = 0, lastMid = null, mode = null;
  const touched = () => { st.auto = 0; onUserInput && onUserInput(); };
  const clampDist = (d) => Math.max(2, Math.min(3000 + 4 * (scene.subject?.radius || 100), d));

  canvas.style.touchAction = 'none';
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mode = e.button === 2 || e.button === 1 || e.shiftKey ? 'pan' : 'orbit';
    vAz = vEl = 0;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    last = performance.now();
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (lastPinch > 0 && d > 0) st.dist = clampDist(st.dist * lastPinch / d);
      if (lastMid) scene.pan(mid.x - lastMid.x, mid.y - lastMid.y, canvas.clientHeight);
      lastPinch = d; lastMid = mid;
      touched();
      return;
    }
    if (mode === 'pan') scene.pan(dx, dy, canvas.clientHeight);
    else {
      const now = performance.now(), dt = Math.max(1, now - last) / 1000;
      last = now;
      st.az += dx * 0.35;
      st.el = Math.max(-89, Math.min(89, st.el + dy * 0.3));
      vAz = dx * 0.35 / dt * 0.5; vEl = dy * 0.3 / dt * 0.5;
    }
    touched();
  });

  const end = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) { lastPinch = 0; lastMid = null; }
    if (!ptrs.size) {
      canvas.style.cursor = 'grab';
      if (mode === 'orbit' && performance.now() - last > 80) vAz = vEl = 0;   // stopped before releasing: no coasting
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const k = e.deltaMode === 1 ? 33 : 1;
    st.dist = clampDist(st.dist * Math.exp(e.deltaY * k * 0.0012));
    touched();
  }, { passive: false });

  canvas.addEventListener('dblclick', () => { scene.frame(); touched(); });

  // inertia: called every animation frame
  let prev = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - prev) / 1000);
    prev = now;
    if (!ptrs.size && (Math.abs(vAz) > 1 || Math.abs(vEl) > 1)) {
      st.az += vAz * dt; st.el = Math.max(-89, Math.min(89, st.el + vEl * dt));
      const f = Math.exp(-dt * 4);
      vAz *= f; vEl *= f;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? 0 : 6;
    let used = true;
    switch (e.key) {
      case 'ArrowLeft': e.shiftKey ? scene.pan(40, 0, canvas.clientHeight) : (st.az -= step); break;
      case 'ArrowRight': e.shiftKey ? scene.pan(-40, 0, canvas.clientHeight) : (st.az += step); break;
      case 'ArrowUp': e.shiftKey ? scene.pan(0, 40, canvas.clientHeight) : (st.el = Math.min(89, st.el + step)); break;
      case 'ArrowDown': e.shiftKey ? scene.pan(0, -40, canvas.clientHeight) : (st.el = Math.max(-89, st.el - step)); break;
      case '+': case '=': case 'PageUp': st.dist = clampDist(st.dist / 1.12); break;
      case '-': case '_': case 'PageDown': st.dist = clampDist(st.dist * 1.12); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); touched(); }
  });
}

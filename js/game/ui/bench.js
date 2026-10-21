// The performance test: a scripted battle filmed from fixed views, with a few settings switched off in turn (clouds, shadows, resolution, particles) to see what each costs,
// that ends in a short report (the device, the GPU, the frame times of each view) to copy, share or download. Started from the setup panel, the settings, or ?bench=1.
//   ?bench=1            opens the dialog        ?bench=auto[&size=large]   runs at once (the tools)
// It spawns its own battle (the same every time: a fixed seed), holds the adaptive quality where it is, and puts everything back when it ends.
import { PRESETS } from '../scenarios.js';
import { TEAM_COLORS } from '../sim/world.js';

const SETTLE = 1.5;            // seconds at the start of a view that are not counted (a new resolution, a pipeline, the camera arriving)

/** The views of the test, in order. The settings of a view are the player's own except what it names. */
export const PHASES = [
  { id: 'sea', name: 'Mer : le navire de ligne', secs: 12, mode: 'follow' },
  { id: 'noclouds', name: '… sans nuages volumétriques', secs: 8, mode: 'follow', clouds: false },
  { id: 'noshadow', name: '… sans ombres', secs: 8, mode: 'follow', shadows: false },
  { id: 'half', name: '… à la moitié de la résolution', secs: 8, mode: 'follow', scale: 0.5 },
  { id: 'fewp', name: '… avec peu de particules', secs: 8, mode: 'follow', particles: 3000 },
  { id: 'tactical', name: 'Vue tactique', secs: 10, mode: 'tactical' },
  { id: 'air', name: 'Vue d\'un avion en vol', secs: 10, mode: 'plane' },
  { id: 'sea2', name: 'Mer : de nouveau (la chauffe)', secs: 12, mode: 'follow' },
];

const SIZES = {
  medium: { label: 'Bataille moyenne', hint: '12 navires, deux porte-avions, une île (environ 2 min)', preset: 'carriers', islands: 1, bases: 1, warm: 90 },
  large: { label: 'Grande bataille', hint: '16 navires, archipel, bases fortifiées (environ 2 min 30)', preset: 'allies', islands: 2, bases: 2, warm: 110 },
};

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function pct(sorted, q) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0; }
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
/** A cost in ms: under a third of a millisecond (or a setting that made it slower) is noise. */
const costText = (v) => (v < 0.35 ? 'rien de mesurable' : `${f1(v)} ms`);

/** The figures of a view from the frames recorded in it: [{ w (frame time, ms), g (GPU ms or 0), u (update, ms), p (scene preparation, ms) }]. */
export function summarize(frames) {
  const w = frames.map((f) => f.w).sort((a, b) => a - b), g = frames.map((f) => f.g).filter((x) => x > 0);
  const total = w.reduce((s, x) => s + x, 0);
  return {
    frames: frames.length, secs: total / 1000, fps: total ? frames.length * 1000 / total : 0,
    ms: { mean: mean(w), p50: pct(w, 0.5), p95: pct(w, 0.95), p99: pct(w, 0.99), max: w.length ? w[w.length - 1] : 0 },
    over20: w.filter((x) => x > 20).length, over33: w.filter((x) => x > 33.4).length,
    gpu: g.length ? { mean: mean(g), max: Math.max(...g) } : null,
    cpu: { update: mean(frames.map((f) => f.u)), prepare: mean(frames.map((f) => f.p)) },
  };
}

/** What the A/B views say: the cost of each setting (ms a frame, from the GPU time when the device gives it, else the frame time) and what limits the frame. */
export function analyse(phases, hasTS) {
  const by = Object.fromEntries(phases.map((p) => [p.id, p]));
  const base = by.sea;
  const out = { notes: [], costs: {} };
  if (!base || !base.frames) return out;
  const cost = (p) => (hasTS && p.gpu ? p.gpu.mean : p.ms.mean);
  for (const [id, label] of [['noclouds', 'les nuages'], ['noshadow', 'les ombres'], ['fewp', 'les particules']]) if (by[id] && by[id].frames) out.costs[label] = cost(base) - cost(by[id]);
  if (by.half && by.half.frames) out.costs['la moitié des pixels'] = cost(base) - cost(by.half);
  const cpu = base.cpu.update + base.cpu.prepare;
  if (hasTS && base.gpu) out.notes.push(base.gpu.mean > cpu * 1.15 ? `limité par le GPU (${f1(base.gpu.mean)} ms contre ${f1(cpu)} ms de processeur)` : base.gpu.mean < cpu * 0.85 ? `limité par le processeur (${f1(cpu)} ms contre ${f1(base.gpu.mean)} ms de GPU)` : `GPU et processeur à peu près à égalité (${f1(base.gpu.mean)} et ${f1(cpu)} ms)`);
  else out.notes.push(`temps GPU non fourni par ce navigateur ; processeur : ${f1(cpu)} ms par image`);
  // (a frame time that sits on the refresh of the screen, 60 or 120 a second: the figure says nothing of the margin)
  const hz = [60, 90, 120, 144].find((x) => Math.abs(base.ms.p50 - 1000 / x) < 1000 / x * 0.04 && base.fps > x * 0.9);
  if (hz) out.notes.push(`l'image est plafonnée par l'écran (${hz} i/s) : la marge réelle est plus grande que le chiffre ne le montre`);
  const end = by.sea2;
  if (end && end.frames && base.fps > 0) {
    const r = end.fps / base.fps;
    out.thermal = r;
    out.notes.push(r < 0.88 ? `l'appareil ralentit en chauffant : ${f1(end.fps)} i/s à la fin contre ${f1(base.fps)} au début (${Math.round((1 - r) * 100)} % de moins)` : `pas de ralentissement visible dû à la chauffe (${f1(base.fps)} puis ${f1(end.fps)} i/s)`);
  }
  return out;
}

/** The report as text: short, in French, with the figures in a table and the whole data in JSON at the end. */
export function formatReport(r) {
  const L = [];
  L.push('RAPPORT DE PERFORMANCE — Combat naval');
  L.push(`${r.date} · ${r.size} · qualité ${r.settings.quality} (niveau ${r.settings.qLevel}) · image ${r.settings.canvas[0]}×${r.settings.canvas[1]} (échelle ${r.settings.renderScale})`);
  L.push(`Appareil : ${r.device.model || '?'} · ${r.device.platform || ''} ${r.device.platformVersion || ''} · ${r.device.cores} cœurs${r.device.memory ? ' · ' + r.device.memory + ' Go' : ''} · écran ${r.device.screen[0]}×${r.device.screen[1]} ×${r.device.dpr}`);
  L.push(`GPU : ${[r.gpu.vendor, r.gpu.architecture, r.gpu.device, r.gpu.description].filter(Boolean).join(' / ') || 'inconnu'}${r.gpu.isFallback ? ' (logiciel !)' : ''} · temps GPU ${r.hasTS ? 'oui' : 'non'}`);
  if (r.battery) L.push(`Batterie : ${r.battery.start} % → ${r.battery.end} % (${r.battery.charging ? 'en charge' : 'sur batterie'})`);
  L.push('');
  L.push('Vue'.padEnd(36) + 'i/s   méd  p95  p99  max   >33ms  GPU   proc.  particules');
  for (const p of r.phases) {
    if (!p.frames) { L.push(p.name.padEnd(36) + (p.skipped || 'non jouée')); continue; }
    L.push(p.name.padEnd(36) + [f1(p.fps).padStart(4), f1(p.ms.p50).padStart(5), f1(p.ms.p95).padStart(4), f1(p.ms.p99).padStart(4), f1(p.ms.max).padStart(5), String(p.over33).padStart(5), (p.gpu ? f1(p.gpu.mean) : '-').padStart(6), f1(p.cpu.update + p.cpu.prepare).padStart(5), String(p.particles ?? '-').padStart(8)].join(' '));
  }
  L.push('(temps en ms par image ; proc. = simulation + préparation de la scène)');
  L.push('');
  const a = r.analysis;
  for (const n of a.notes) L.push('• ' + n);
  const costs = Object.entries(a.costs);
  if (costs.length) L.push('• ce que chaque réglage coûte (ms par image) : ' + costs.map(([k, v]) => `${k} ${costText(v)}`).join(' · '));
  L.push('');
  L.push('--- données ---');
  L.push(JSON.stringify(r));
  return L.join('\n');
}

export class Bench {
  constructor(game, ui) { this.game = game; this.ui = ui; this.el = null; this.running = false; }

  // ---- the dialog and the overlay ---------------------------------------------------------------------------------------------------------------------------------------
  open() {
    if (this.running || this.el) return;
    const choose = (size) => { this.close(true); this.start(size); };
    this.el = h('div', { id: 'bench', class: 'panel' },
      h('div', { class: 'title' }, h('span', { class: 'big' }, 'Test de performance'), h('span', { class: 'sub' }, 'Une bataille filmée sous plusieurs angles ; à la fin, un rapport à envoyer.')),
      h('div', { class: 'hint' }, 'Ne touchez pas à l\'écran pendant le test. Il remplace la bataille en cours et remet tout comme avant ensuite. Branchez l\'appareil si vous voulez ménager la batterie.'),
      ...Object.entries(SIZES).map(([k, s]) => h('button', { class: 'btn primary bsz', onclick: () => choose(k) }, h('b', {}, s.label), h('small', {}, s.hint))),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => this.close() }, 'Annuler')));
    document.getElementById('ui').append(this.el);
  }

  close(keep) { if (this.el) { this.el.remove(); this.el = null; } if (!keep) document.body.classList.remove('benching'); }

  // ---- the run ---------------------------------------------------------------------------------------------------------------------------------------------------------
  async start(sizeKey = 'medium') {
    if (this.running) return;
    const g = this.game, e = g.engine, size = SIZES[sizeKey] || SIZES.medium, preset = PRESETS.find((p) => p.id === size.preset);
    this.running = true; this.size = sizeKey; this.cancelled = false;
    document.body.classList.add('benching');
    // what to put back
    this.saved = { teams: g.config.teams, seed: g.config.seed, sep: g.config.sep, islands: g.config.islands, bases: g.config.bases, scale: e.getRenderScale(), timeScale: g.timeScale, paused: g.paused, particleMax: g.particleMax, mode: g.camera.mode };
    this.hi = await this.deviceInfo();
    g.benchLock = true;
    g.paused = false;
    g.config.teams = preset.teams.map((t, i) => ({ name: t.name, rgb: TEAM_COLORS[i].rgb, entries: t.entries.map((x) => ({ ...x })) }));
    g.config.seed = 3; g.config.sep = 12000; g.config.islands = size.islands; g.config.bases = size.bases;
    g.reset();
    g.spawn();
    g.start();
    g.setTimeScale(8);
    this.baseScale = e.getRenderScale();
    this.stage = 'warm'; this.t0 = performance.now(); this.last = this.t0; this.pr = 0; this.k = -1; this.frames = []; this.results = []; this.warm = size.warm;
    this.battery0 = await this.battery();
    // the overlay
    this.shield = h('div', { id: 'benchshield' });
    this.bar = h('i');
    this.label = h('div', { class: 'bl' }, 'Préparation de la bataille…');
    this.sub = h('div', { class: 'bs' }, '');
    this.el = h('div', { id: 'bench', class: 'panel running' }, h('b', {}, 'Test de performance'), this.label, h('div', { class: 'bbar' }, this.bar), this.sub, h('button', { class: 'btn small', onclick: () => { this.cancelled = true; } }, 'Annuler'));
    document.getElementById('ui').append(this.shield, this.el);
    // the frame hooks
    const hu = e.hooks.update, hp = e.hooks.prepare;
    this.hooks = { hu, hp };
    e.hooks.update = (dt, now) => { const t = performance.now(); hu(dt, now); this.onFrame(t, performance.now() - t); };
    e.hooks.prepare = (...a) => { const t = performance.now(); hp(...a); this.pr = performance.now() - t; };
  }

  async deviceInfo() {
    const n = navigator, d = { ua: n.userAgent, cores: n.hardwareConcurrency || 0, memory: n.deviceMemory || 0, screen: [screen.width, screen.height], dpr: +(devicePixelRatio || 1).toFixed(2), mobile: /Android|Mobile|iPhone|iPad/.test(n.userAgent) };
    try {
      const v = await n.userAgentData?.getHighEntropyValues?.(['model', 'platform', 'platformVersion', 'architecture', 'bitness']);
      if (v) Object.assign(d, { model: v.model, platform: v.platform, platformVersion: v.platformVersion, architecture: v.architecture });
    } catch (err) { /* not given */ }
    return d;
  }

  async battery() {
    try { const b = await navigator.getBattery?.(); return b ? { level: Math.round(b.level * 100), charging: b.charging } : null; } catch (err) { return null; }
  }

  /** Called after every frame's update: the clock of the test, and the frame times it records. */
  onFrame(t, cpuU) {
    const g = this.game, e = g.engine, wall = t - this.last;
    this.last = t;
    if (this.cancelled) return this.finish(true);
    if (this.stage === 'warm') {
      const el = (t - this.t0) / 1000, done = g.world.time >= this.warm || el > 75;
      this.bar.style.width = Math.min(100, g.world.time / this.warm * 100).toFixed(0) + '%';
      this.sub.textContent = `bataille à ${Math.round(g.world.time)} s sur ${this.warm}`;
      if (done) { g.setTimeScale(1); this.stage = 'run'; this.next(t); }
      return;
    }
    const ph = PHASES[this.k], el = (t - this.pt) / 1000;
    if (el > SETTLE) this.frames.push({ w: wall, g: e.hasTS ? e.stats.gpuMs : 0, u: cpuU, p: this.pr });
    this.bar.style.width = ((this.k + Math.min(1, el / ph.secs)) / PHASES.length * 100).toFixed(0) + '%';
    this.sub.textContent = `vue ${this.k + 1} sur ${PHASES.length}${this.frames.length > 5 ? ` · ${f1(1000 / mean(this.frames.slice(-60).map((f) => f.w)))} i/s` : ''}`;
    // the target of a ship view: the biggest ship still afloat (a camera that lost its ship takes another)
    if (ph.mode === 'follow' && (!g.camera.target || !g.camera.target.alive)) this.pickShip();
    if (el >= ph.secs) this.endPhase(t);
  }

  pickShip() {
    const g = this.game, ships = g.world.ships.filter((s) => s.alive), order = { BB: 0, CV: 1, CA: 2, CL: 3, DD: 4 };
    ships.sort((a, b) => (order[a.stats.type] ?? 9) - (order[b.stats.type] ?? 9) || a.id - b.id);
    if (ships[0]) g.camera.setTarget(ships[0]);
  }

  endPhase(t) {
    const g = this.game, ph = PHASES[this.k], r = { id: ph.id, name: ph.name, ...summarize(this.frames) };
    r.particles = g.particles.count ?? g.particles.n ?? null;
    r.ships = g.world.ships.filter((s) => s.alive).length;
    r.planes = g.world.planes.filter((q) => !q.dying && q.y > 30).length;
    r.size = [g.engine.stats.width, g.engine.stats.height];
    r.skipped = r.frames ? undefined : this.skipNote;
    this.results.push(r);
    this.next(t);
  }

  /** Go to the next view: its camera and its settings. */
  next(t) {
    const g = this.game, e = g.engine;
    for (;;) {
      this.k++;
      if (this.k >= PHASES.length) return this.finish(false);
      const ph = PHASES[this.k];
      // the settings of the view: the player's own, less what it switches off
      g.applyQuality();
      e.setRenderScale(ph.scale ?? this.baseScale);
      if (ph.clouds === false) e.setClouds?.({ on: false });
      if (ph.shadows === false) g.shadowsOn = false;
      g.particles.setMax(ph.particles ?? this.saved.particleMax);
      if (ph.mode === 'plane') {
        const q = g.world.planes.filter((x) => !x.dying && !x.hidden && x.y > 150).sort((a, b) => b.y - a.y)[0];
        if (!q) { this.results.push({ id: ph.id, name: ph.name, frames: 0, skipped: 'aucun avion en vol à ce moment' }); continue; }
        g.camera.setMode('plane', true); g.camera.setPlane(q);
      } else if (ph.mode === 'tactical') {
        this.pickShip(); g.camera.setMode('tactical', true);
      } else {
        this.pickShip(); g.camera.setMode('follow', true);
        Object.assign(g.camera.follow, { yaw: 0.65, pitch: 0.1, zoom: 1.3 });
      }
      this.frames = []; this.pt = t;
      this.label.textContent = ph.name;
      return;
    }
  }

  async finish(cancelled) {
    const g = this.game, e = g.engine, hk = this.hooks;
    if (!this.running) return;
    this.running = false;
    e.hooks.update = hk.hu; e.hooks.prepare = hk.hp;
    const S = this.saved;
    g.benchLock = false;
    g.config.teams = S.teams; g.config.seed = S.seed; g.config.sep = S.sep; g.config.islands = S.islands; g.config.bases = S.bases;
    g.reset();
    g.setTimeScale(S.timeScale); g.paused = S.paused;
    g.particles.setMax(S.particleMax);
    e.setRenderScale(S.scale);
    g.applyQuality();
    if (cancelled) { this.shield.remove(); this.el.remove(); this.el = null; document.body.classList.remove('benching'); return; }
    const battery1 = await this.battery();
    const r = {
      version: 1, date: new Date().toISOString().replace('T', ' ').slice(0, 16), size: SIZES[this.size].label, url: location.origin + location.pathname,
      device: this.hi, gpu: e.adapterInfo, hasTS: !!e.hasTS,
      settings: { quality: g.qualityMode, qLevel: g.qLevel, renderScale: +this.baseScale.toFixed(2), canvas: this.results.find((p) => p.size)?.size || [e.stats.width, e.stats.height], particleMax: S.particleMax, shadows: g.shadowsOn, clouds: !!e.cloudsOn },
      battery: this.battery0 && battery1 ? { start: this.battery0.level, end: battery1.level, charging: battery1.charging } : null,
      phases: this.results,
    };
    r.analysis = analyse(r.phases, r.hasTS);
    r.text = undefined;
    this.report = r;
    window.__benchReport = r;
    this.show(r);
  }

  show(r) {
    this.shield.remove();
    const text = formatReport(r);
    this.text = text;
    const status = h('span', { class: 'bstat' });
    const flash = (m) => { status.textContent = m; setTimeout(() => { status.textContent = ''; }, 2500); };
    const copy = async () => {
      try { await navigator.clipboard.writeText(text); flash('Copié.'); } catch (err) { area.select(); try { document.execCommand('copy'); flash('Copié.'); } catch (e2) { flash('Sélectionnez le texte et copiez-le.'); } }
    };
    const save = () => {
      const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: `rapport-performance-${r.date.replace(/[ :]/g, '-')}.txt` });
      document.body.append(a); a.click(); a.remove();
    };
    const area = h('textarea', { class: 'brep', readonly: true, rows: 9 }, text);
    const share = navigator.share ? h('button', { class: 'btn primary', onclick: () => navigator.share({ title: 'Rapport de performance', text }).catch(() => {}) }, 'Partager') : null;
    this.el.replaceWith(this.el = h('div', { id: 'bench', class: 'panel done' },
      h('div', { class: 'title' }, h('span', { class: 'big' }, 'Rapport prêt'), h('span', { class: 'sub' }, `${r.phases.filter((p) => p.frames).length} vues mesurées`)),
      h('div', { class: 'bsum' }, ...r.analysis.notes.map((n) => h('div', {}, '• ' + n)), Object.keys(r.analysis.costs).length ? h('div', {}, '• coût par image : ' + Object.entries(r.analysis.costs).map(([k, v]) => `${k} ${costText(v)}`).join(' · ')) : null),
      // (the buttons above the text: on a phone held sideways the page is short)
      h('div', { class: 'row' }, share, h('button', { class: 'btn primary', onclick: copy }, 'Copier le rapport'), h('button', { class: 'btn', onclick: save }, 'Télécharger'), h('button', { class: 'btn', onclick: () => { this.el.remove(); this.el = null; document.body.classList.remove('benching'); } }, 'Fermer'), status),
      area));
  }
}

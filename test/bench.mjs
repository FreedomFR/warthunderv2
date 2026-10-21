// The performance test's report: node test/bench.mjs — the figures of a view, what the A/B views say, the text of the report.
import { summarize, analyse, formatReport, PHASES } from '../js/game/ui/bench.js';

const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) process.exitCode = 1; };
const fr = (ms, n, g = 0, u = 1, p = 0.5, spike = 0) => Array.from({ length: n }, (_, i) => ({ w: ms + (i % 10 === 0 ? spike : 0), g, u, p }));

const s = summarize(fr(16.7, 100, 0, 1, 0.5, 20));
ok(s.frames === 100 && s.fps > 50 && s.fps < 60 && s.over20 === 10 && s.over33 === 10 && s.ms.max > 36 && s.gpu === null, `the figures of a view (${s.fps.toFixed(1)} i/s, ${s.over20} frames over 20 ms, no GPU time)`);
ok(summarize([]).frames === 0 && summarize([]).fps === 0, 'an empty view gives zeros, not NaN');
ok(summarize(fr(10, 50, 4)).gpu.mean === 4, 'the GPU time is averaged when the device gives it');

// a device that is GPU-bound: the cost of the clouds and of the pixels, a slowdown with the heat
const mk = (id, ms, gpu, name = id) => ({ id, name, ...summarize(fr(ms, 120, gpu, 2, 1)) });
const ph = [mk('sea', 30, 28), mk('noclouds', 22, 20), mk('noshadow', 29, 27), mk('half', 18, 16), mk('fewp', 29, 27), mk('tactical', 20, 18), mk('sea2', 38, 36)];
const a = analyse(ph, true);
ok(a.costs['les nuages'] > 7 && a.costs['la moitié des pixels'] > 11 && a.costs['les ombres'] < 3, `the cost of each setting (clouds ${a.costs['les nuages'].toFixed(1)}, half the pixels ${a.costs['la moitié des pixels'].toFixed(1)} ms)`);
ok(a.notes.some((n) => /limité par le GPU/.test(n)) && a.notes.some((n) => /chauffant/.test(n)), `it says what limits the frame and that the device slows when it heats (${a.notes.length} notes)`);
const b = analyse([mk('sea', 16.7, 5), mk('sea2', 16.7, 5)], true);
ok(b.notes.some((n) => /plafonnée par l'écran \(60/.test(n)) && b.notes.some((n) => /pas de ralentissement/.test(n)), 'a frame that sits on the refresh of the screen is flagged as capped');
const c = analyse([mk('sea', 8.3, 3), mk('sea2', 8.3, 3)], true);
ok(c.notes.some((n) => /120/.test(n)), 'and so is a 120 Hz screen');
ok(analyse([mk('sea', 30, 0)], false).notes.some((n) => /non fourni/.test(n)), 'without GPU times the report says so and judges by the frame time');

const r = { version: 1, date: '2026-10-21 12:00', size: 'Bataille moyenne', device: { model: 'SM-S928B', platform: 'Android', platformVersion: '14', cores: 8, memory: 8, screen: [412, 915], dpr: 3.5 },
  gpu: { vendor: 'qualcomm', architecture: 'adreno-750', device: '', description: 'Adreno', isFallback: false }, hasTS: true, battery: { start: 80, end: 77, charging: false },
  settings: { quality: 'auto', qLevel: 2, renderScale: 0.76, canvas: [1100, 2440] }, phases: ph.concat([{ id: 'air', name: 'Vue d\'un avion en vol', frames: 0, skipped: 'aucun avion en vol à ce moment' }]), analysis: a };
const t = formatReport(r);
ok(/SM-S928B/.test(t) && /adreno-750/.test(t) && /Vue d'un avion en vol\s+aucun avion/.test(t) && /--- données ---/.test(t), 'the report names the device, the GPU, the views not played, and ends with the data');
const json = JSON.parse(t.split('--- données ---\n')[1]);
ok(json.phases.length === ph.length + 1 && json.device.model === 'SM-S928B', 'the data at the end is valid JSON');
ok(t.split('\n').length < 40 && PHASES.length === 8 && PHASES.every((p) => p.secs >= 8), `the report is short (${t.split('\n').length} lines); ${PHASES.length} views`);

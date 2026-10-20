// Side-by-side comparison of a published trailer with the same edit re-recorded by the current game.
//
//   node tools/trailer/compare.mjs tools/trailer/edit-0.1.0.json --left docs/trailer-v0.1.0.mp4 --frames out/frames \
//        --labels "VERSION 0.1.0,VERSION 0.2.0" --version 0.1.0,0.2.0 --out docs/comparatif-0.1.0-0.2.0.mp4
//
// The frames (record.mjs, half the size of the edit: for example --w 960 --h 540 --fps 60, same scenes and seeds as the original)
// are cut with the edit list of the original trailer, which assemble.mjs encodes at half size (titles scaled, no sound). The original
// video is scaled to the same size, the two are stacked side by side (1920x540), a label sits in the corner of each half and the sound
// is the one of the original video. Needs ffmpeg and the Inter fonts (see assemble.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const editFile = args[0];
const flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!editFile || !flag('left') || !flag('frames')) { console.error('usage: node tools/trailer/compare.mjs edit.json --left original.mp4 --frames dir [--labels "A,B"] [--version old,new] [--out file.mp4] [--fps 24] [--crf 26]'); process.exit(1); }
const edit = JSON.parse(fs.readFileSync(editFile, 'utf8'));
const left = flag('left'), framesDir = flag('frames'), out = flag('out', 'comparatif.mp4');
const [labelL, labelR] = flag('labels', 'A,B').split(',');
const [verOld, verNew] = flag('version', ',').split(',');
const fps = Number(flag('fps', 24)), crf = flag('crf', '26');
const W = (edit.w || 1280) / 2, H = (edit.h || 720) / 2;
const tmp = path.join(path.dirname(out), '.compare-tmp');
fs.mkdirSync(tmp, { recursive: true });
const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(cmd, a.join(' ').slice(0, 400), '\n', (r.stderr || '').split('\n').slice(-12).join('\n')); process.exit(1); }
  return r;
};

// ---- the re-recorded half: same clips and titles, half size, no sound -----------------------------------------------------------
const half = (e) => String(e).replace(/\+(\d+(\.\d+)?)/g, (_, n) => '+' + Number(n) / 2);
const halfEdit = {
  ...edit, w: W, h: H, frames: framesDir, music: '', crf: 14, grain: edit.grain ?? 5,
  cards: (edit.cards || []).map((c) => ({
    ...c,
    text: verOld ? c.text.replaceAll(verOld, verNew) : c.text,
    size: c.size / 2, subSize: c.subSize && c.subSize / 2,
    y: c.y && half(c.y), subY: c.subY && half(c.subY),
  })),
};
const halfFile = path.join(tmp, 'edit-half.json'), right = path.join(tmp, 'right.mp4');
fs.writeFileSync(halfFile, JSON.stringify(halfEdit));
run('node', ['tools/trailer/assemble.mjs', halfFile, '--frames', framesDir, '--out', right]);

// ---- stack ------------------------------------------------------------------------------------------------------------------
const font = '/usr/share/fonts/opentype/inter/Inter-Medium.otf';
const label = (t) => `drawtext=fontfile=${font}:text='${t}':fontsize=30:fontcolor=white:x=10:y=10:box=1:boxcolor=0x1c2a33@0.78:boxborderw=10`;
const fc = `[0:v]fps=${fps},scale=${W}:${H}:flags=lanczos,${label(labelL)}[l];[1:v]fps=${fps},scale=${W}:${H}:flags=lanczos,${label(labelR)}[r];[l][r]hstack=inputs=2,drawbox=x=${W - 1}:y=0:w=2:h=${H}:color=black@0.6:t=fill[v]`;
fs.mkdirSync(path.dirname(out), { recursive: true });
run('ffmpeg', ['-y', '-i', left, '-i', right, '-filter_complex', fc, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-crf', crf, '-preset', 'slow', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', out]);
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
if (!args.includes('--keep')) fs.rmSync(tmp, { recursive: true, force: true });

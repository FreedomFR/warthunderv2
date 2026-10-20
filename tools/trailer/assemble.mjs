// Edit and encode the trailer from the frames written by record.mjs.
//
//   node tools/trailer/assemble.mjs tools/trailer/edit.json [--frames <dir>] [--music file.wav] [--out file.mp4] [--dry]
//
// The edit decision list (edit.json) names the clips (a range of frames of a recorded shot), the title cards and the audio
// (the game sounds recorded with the scenes, plus the score). Everything is cut and encoded with ffmpeg: grade, grain,
// fades, titles (drawtext), sound mix and loudness normalisation.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const editFile = args[0];
const flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
if (!editFile) { console.error('usage: node tools/trailer/assemble.mjs edit.json [--frames dir] [--music file.wav] [--out file.mp4] [--dry]'); process.exit(1); }
const edit = JSON.parse(fs.readFileSync(editFile, 'utf8'));
const framesDir = flag('frames', edit.frames);
const out = flag('out', edit.out || 'trailer.mp4');
const musicFile = flag('music', edit.music);
const dry = args.includes('--dry');
const FPS = edit.fps || 24, W = edit.w || 1280, H = edit.h || 720;
const tmp = path.join(path.dirname(out), '.trailer-tmp');
fs.mkdirSync(tmp, { recursive: true });

const run = (cmd, a) => {
  const r = spawnSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) { console.error(cmd, a.join(' ').slice(0, 400), '\n', (r.stderr || '').split('\n').slice(-12).join('\n')); process.exit(1); }
  return r;
};
const manifestOf = (scene) => JSON.parse(fs.readFileSync(path.join(framesDir, scene, 'manifest.json'), 'utf8'));

// ---- timeline -------------------------------------------------------------------------------------------------------------
let t = 0;
const clips = edit.clips.map((c, i) => {
  const start = t;
  t += c.dur;
  return { ...c, i, start, end: t, dir: path.join(framesDir, c.scene, c.shot) };
});
const total = t;
console.log(`timeline: ${clips.length} clips, ${total.toFixed(1)} s`);
for (const c of clips) console.log(`  ${c.start.toFixed(2).padStart(6)} ${c.scene}/${c.shot} +${(c.from || 0).toFixed(2)} ${c.dur.toFixed(2)}s`);
if (dry) process.exit(0);

// ---- video: one intermediate file per clip (graded, faded), then concatenated ------------------------------------------------------
const gradeVF = edit.grade ?? 'eq=contrast=1.05:saturation=1.08:gamma=0.98,unsharp=5:5:0.45:5:5:0.0';
for (const c of clips) {
  const frames = Math.round(c.dur * FPS), first = Math.round((c.from || 0) * FPS);
  // a picture that is not 16:9 (the phone interface) keeps its shape, with bars
  const vf = [`scale=${W}:${H}:flags=lanczos:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b0f14`, gradeVF];
  if (c.speed && c.speed !== 1) vf.push(`setpts=PTS/${c.speed}`);
  if (c.fadeIn) vf.push(`fade=t=in:st=0:d=${c.fadeIn}${c.fadeFrom === 'white' ? ':color=white' : ''}`);
  if (c.fadeOut) vf.push(`fade=t=out:st=${(c.dur - c.fadeOut).toFixed(3)}:d=${c.fadeOut}${c.fadeTo === 'white' ? ':color=white' : ''}`);
  c.file = path.join(tmp, `clip${String(c.i).padStart(3, '0')}.mp4`);
  if (!fs.existsSync(path.join(c.dir, String(first).padStart(5, '0') + '.png'))) { console.error('missing frames', c.dir, first); process.exit(1); }
  run('ffmpeg', ['-y', '-framerate', String(FPS), '-start_number', String(first), '-i', path.join(c.dir, '%05d.png'), '-frames:v', String(frames),
    '-vf', vf.join(','), '-r', String(FPS), '-c:v', 'libx264', '-crf', '12', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', c.file]);
}
fs.writeFileSync(path.join(tmp, 'list.txt'), clips.map((c) => `file '${path.resolve(c.file)}'`).join('\n'));
const cat = path.join(tmp, 'cat.mp4');
run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', cat]);

// ---- titles and finishing -------------------------------------------------------------------------------------------------------
const font = (w) => `/usr/share/fonts/opentype/inter/${w}.otf`;
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%');
// piecewise-linear gain curve in dB, [[seconds, dB], ...] -> a ffmpeg volume expression (evaluated per frame)
const envVolume = (points) => {
  if (!points || !points.length) return '';
  let e = String(points[points.length - 1][1]);
  for (let i = points.length - 2; i >= 0; i--) {
    const [t0, a] = points[i], [t1, b] = points[i + 1];
    e = `if(lt(t,${t1}),${a}+(${b}-${a})*(t-${t0})/${Math.max(1e-3, t1 - t0)},${e})`;
  }
  return `,volume='pow(10,(${e})/20)':eval=frame:precision=float`;
};
const cards = (edit.cards || []).map((c) => {
  const a = c.at, b = c.at + c.dur, f = c.fade ?? 0.5;
  const alpha = `if(lt(t,${a}),0,if(lt(t,${a + f}),(t-${a})/${f},if(lt(t,${b - f}),1,if(lt(t,${b}),(${b}-t)/${f},0))))`;
  const y = c.y || '(h-text_h)/2';
  const lines = [];
  lines.push(`drawtext=fontfile=${font(c.weight || 'InterDisplay-Bold')}:text='${esc(c.text)}':fontsize=${c.size || 64}:fontcolor=white:alpha='${alpha}':x=(w-text_w)/2:y=${y}:shadowcolor=black@0.7:shadowx=3:shadowy=3${c.box ? ':box=1:boxcolor=black@0.38:boxborderw=14' : ''}`);
  if (c.sub) lines.push(`drawtext=fontfile=${font('Inter-Medium')}:text='${esc(c.sub)}':fontsize=${c.subSize || 26}:fontcolor=white@0.92:alpha='${alpha}':x=(w-text_w)/2:y=${c.subY || `(h/2)+${(c.size || 64) * 0.8}`}:shadowcolor=black@0.7:shadowx=2:shadowy=2${c.box ? ':box=1:boxcolor=black@0.38:boxborderw=10' : ''}`);
  return lines.join(',');
});
const finish = [...cards, `noise=alls=${edit.grain ?? 5}:allf=t`].join(',');
const graded = path.join(tmp, 'graded.mp4');
run('ffmpeg', ['-y', '-i', cat, '-vf', finish, '-c:v', 'libx264', '-crf', String(edit.crf ?? 19), '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an', graded]);

// ---- audio: game sounds of each clip + music, mixed and normalised -----------------------------------------------------------------
let audioArgs = ['-an'];
const sfx = [];
const inputs = [];
const filters = [];
clips.forEach((c) => {
  const f = path.join(framesDir, c.scene, 'audio.wav');
  if (!fs.existsSync(f)) return;
  const mark = manifestOf(c.scene).audio?.marks?.[c.shot];
  if (mark == null) return;
  const k = inputs.length / 2;
  inputs.push('-i', f);
  filters.push(`[${k}:a]atrim=start=${(mark + (c.from || 0)).toFixed(3)}:duration=${c.dur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${c.sfxDb ?? 0}dB,afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, c.dur - 0.05).toFixed(3)}:d=0.05,adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)},apad=whole_dur=${total.toFixed(3)}[s${c.i}]`);
  sfx.push(`[s${c.i}]`);
});
if (sfx.length || musicFile) {
  let mix = '';
  if (sfx.length) mix += filters.join(';') + ';' + sfx.join('') + `amix=inputs=${sfx.length}:normalize=0:duration=longest,volume=${edit.sfxDb ?? 0}dB${envVolume(edit.sfxEnv)}[sfx];`;
  if (musicFile) { inputs.push('-i', musicFile); mix += `[${inputs.length / 2 - 1}:a]atrim=0:${total.toFixed(3)},apad=whole_dur=${total.toFixed(3)},volume=${edit.musicDb ?? -7}dB${envVolume(edit.musicEnv)}[mus];`; }
  const parts = [sfx.length ? '[sfx]' : '', musicFile ? '[mus]' : ''].filter(Boolean);
  const base = `${mix}${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=longest,alimiter=limit=0.95`;
  // loudness: measured on a first pass, then applied as one static gain (the dynamic mode would flatten the arc of the mix)
  const target = 'I=-15:TP=-1.5:LRA=11';
  const m = run('ffmpeg', ['-y', ...inputs, '-filter_complex', `${base},loudnorm=${target}:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-']);
  const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf('{'), m.stderr.lastIndexOf('}') + 1));
  const lin = `loudnorm=${target}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  const wav = path.join(tmp, 'mix.wav');
  run('ffmpeg', ['-y', ...inputs, '-filter_complex', `${base},${lin},atrim=0:${total.toFixed(3)}[aout]`, '-map', '[aout]', '-ar', '48000', '-ac', '2', wav]);
  audioArgs = ['-i', wav, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k'];
}
fs.mkdirSync(path.dirname(out), { recursive: true });
run('ffmpeg', ['-y', '-i', graded, ...audioArgs, '-c:v', 'copy', '-movflags', '+faststart', '-shortest', out]);
console.log('wrote', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
if (!args.includes('--keep')) fs.rmSync(tmp, { recursive: true, force: true });

// What the camera is showing, in words: the line under the picture ("Auto · Duel — USS Iowa contre IJN Yamato"), so that the viewer always knows what they are looking at
// and who is who. It reads the camera rig (ui/cameras.js) and returns plain data: { mode, shot, parts: [{ text, team }], hint } (team: index into world.teams, or null).
import { CAMERA_MODES } from './cameras.js';

/** The names of the automatic director's shots. */
export const SHOT_NAMES = {
  follow: 'Poursuite', orbit: 'Orbite', bridge: 'Passerelle', shell: 'Obus', tactical: 'Vue de dessus', versus: 'Duel', reverse: 'Contrechamp', wide: 'Plan large',
  base: 'Base', formation: 'Formation', attack: 'Attaque aérienne', dogfight: 'Combat aérien', plane: 'Avion',
};

const ship = (s) => (s ? { text: s.name, team: s.team } : null);
const plane = (p) => (p ? { text: p.spec.name, team: p.team } : null);
const word = (text) => ({ text, team: null });
const alive = (s) => s && s.state !== 'sunk';

/** The subject of a shot: who the camera is on. */
function subject(rig, sub) {
  const f = rig.flock, t = rig.target;
  switch (sub) {
    case 'versus': case 'reverse': {
      const a = rig.versus && rig.versus.ship, b = a && a.cmd && a.cmd.main.target;
      return a && alive(b) ? [ship(a), word('contre'), ship(b)] : [ship(a || t)];
    }
    case 'formation': {
      if (!f || !f.planes || !f.planes.length) return [];
      const p = f.planes[0];
      return [{ text: `${f.planes.length} × ${p.spec.name}`, team: p.team }];
    }
    case 'attack': {
      if (!f) return [ship(t)];
      const n = f.planes.filter((p) => !p.dying && !p.gone).length || f.planes.length;
      return [{ text: `${n} avion${n > 1 ? 's' : ''}`, team: f.planes[0] ? f.planes[0].team : null }, word('sur'), ship(f.ship)];
    }
    case 'dogfight': return f ? [plane(f.hunter), word('contre'), plane(f.prey)] : [];
    case 'plane': return [plane(rig.plane)];
    case 'base': {
      const b = rig.baseShot && rig.baseShot.base;
      return b ? [{ text: b.name, team: b.team }] : [word('Ruines d\'une base')];
    }
    case 'wide': return [word('la bataille')];
    default: return [ship(t)];
  }
}

/** What the camera shows now. */
export function captionOf(rig) {
  const m = CAMERA_MODES.find((x) => x.id === rig.mode);
  const mode = m ? m.name : rig.mode;
  if (rig.mode === 'auto') {
    const sub = rig.auto.sub;
    return { mode, shot: SHOT_NAMES[sub] || '', parts: subject(rig, sub).filter(Boolean) };
  }
  if (rig.mode === 'free') return { mode, shot: '', parts: [], hint: 'ZQSD : avancer · Espace / Ctrl : monter, descendre · glisser : regarder' };
  if (rig.mode === 'tactical') return { mode, shot: '', parts: rig.target ? [ship(rig.target)] : [], hint: 'glisser : déplacer · molette : altitude' };
  if (rig.mode === 'plane' || rig.mode === 'cockpit') return { mode, shot: '', parts: rig.plane ? [plane(rig.plane)] : [word('aucun avion en vol')] };
  return { mode, shot: '', parts: rig.target ? [ship(rig.target)] : [] };
}

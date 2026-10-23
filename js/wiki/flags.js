// Small national flags (simplified drawings, 3:2) and the accent colour of each nation's tree. Germany's flag is the black-white-red of the
// imperial era (the game's ensign is the Reichskriegsflagge of before 1935, without any later emblem).
const NS = 'http://www.w3.org/2000/svg';

const FLAGS = {
  USA: `<rect width="30" height="20" fill="#f4f4f4"/>${[0, 2, 4, 6, 8, 10, 12].map((i) => `<rect y="${i * 20 / 13}" width="30" height="${20 / 13}" fill="#b22234"/>`).join('')}<rect width="13" height="10.8" fill="#3c3b6e"/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<circle cx="${2 + c * 3 + (r % 2) * 1.4}" cy="${2 + r * 3}" r=".7" fill="#fff"/>`).join('')).join('')}`,
  Japan: '<rect width="30" height="20" fill="#f4f4f4"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  UK: '<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="6"/><path d="M15 0V20M0 10H30" stroke="#c8102e" stroke-width="3.4"/>',
  Germany: '<rect width="30" height="6.7" fill="#111"/><rect y="6.7" width="30" height="6.7" fill="#f4f4f4"/><rect y="13.4" width="30" height="6.6" fill="#c8102e"/>',
  France: '<rect width="10" height="20" fill="#0055a4"/><rect x="10" width="10" height="20" fill="#f4f4f4"/><rect x="20" width="10" height="20" fill="#ef4135"/>',
  USSR: '<rect width="30" height="20" fill="#cc0000"/><path d="M6 3.2l1 2.9h3l-2.4 1.8.9 2.9-2.5-1.8-2.5 1.8.9-2.9L2 6.1h3z" fill="#ffd900"/>',
  Italy: '<rect width="10" height="20" fill="#009246"/><rect x="10" width="10" height="20" fill="#f4f4f4"/><rect x="20" width="10" height="20" fill="#ce2b37"/>',
};

export const ACCENTS = { USA: '#5b8def', Japan: '#e5565b', UK: '#8da7e6', Germany: '#b0b4ba', France: '#4fa8e8', Italy: '#4fbf83', USSR: '#e05a4a' };

export function flagSVG(nation, w = 30, extra = '') {
  return `<svg class="flag ${extra}" xmlns="${NS}" viewBox="0 0 30 20" width="${w}" height="${Math.round(w * 2 / 3)}" role="img" aria-label="Drapeau">${FLAGS[nation] || ''}</svg>`;
}

/** Lower-case url slug of a nation (#/usa, #/uk ...). */
export const slug = (nationId) => nationId.toLowerCase();

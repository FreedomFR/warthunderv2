// Tiny DOM helper shared by the viewer and the wiki: h('div', { class: 'x', onclick }, child, [children]...).
export function h(tag, attrs, ...kids) {
  const el = tag === 'svg' || tag.startsWith('svg:') ? document.createElementNS('http://www.w3.org/2000/svg', tag.replace('svg:', '')) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) add(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);

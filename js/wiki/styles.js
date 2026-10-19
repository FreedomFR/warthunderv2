// Styles of the wiki, injected by js/wiki.js (kept in a module so the page is a plain shell and the whole wiki lives in js/wiki/).
export const CSS = `
:root { --bg: #090d12; --panel: #10161e; --panel2: #151d27; --line: #ffffff16; --line2: #ffffff2a; --ink: #e8e2d6; --dim: #98a3b0; --amber: #e2a04e; --acc: #e2a04e; --sea: #1b2b3b; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: radial-gradient(1200px 600px at 70% -10%, #17283a 0%, transparent 60%), var(--bg); color: var(--ink); font: 15px/1.5 system-ui, "Segoe UI", sans-serif; min-height: 100vh; }
a { color: var(--amber); }
button { font: inherit; color: inherit; cursor: pointer; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

/* ---- header ---- */
.top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 18px; padding: 10px 18px; background: #0a0f15ee; backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.brand { font-weight: 800; letter-spacing: .3px; color: var(--amber); text-decoration: none; font-size: 17px; white-space: nowrap; }
.brand small { color: var(--dim); font-weight: 500; margin-left: 6px; }
.nav { display: flex; gap: 4px; flex-wrap: wrap; }
.nav a, .ext a { color: var(--ink); text-decoration: none; padding: 6px 12px; border-radius: 999px; border: 1px solid transparent; font-size: 14px; white-space: nowrap; }
.nav a:hover, .ext a:hover { background: #ffffff10; }
.nav a.on { background: #e2a04e22; border-color: #e2a04e66; color: var(--amber); }
.ext { margin-left: auto; display: flex; gap: 6px; }
.ext a { border-color: var(--line2); }

main { max-width: 1360px; margin: 0 auto; padding: 18px 18px 60px; }
h1 { font-size: 26px; margin: 6px 0 2px; letter-spacing: .2px; }
.lead { color: var(--dim); margin: 0 0 14px; max-width: 78ch; }

/* ---- nation tabs ---- */
.tabs { display: flex; gap: 8px; flex-wrap: wrap; margin: 12px 0 16px; }
.tab { text-decoration: none; display: flex; align-items: center; gap: 9px; padding: 8px 14px 8px 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; color: var(--ink); transition: background .15s, border-color .15s, transform .15s; border-bottom: 3px solid transparent; }
.tab:hover { background: var(--panel2); transform: translateY(-1px); }
.tab.on { background: var(--panel2); border-color: var(--line2); border-bottom-color: var(--acc); }
.tab b { font-weight: 650; }
.tab small { color: var(--dim); display: block; font-size: 11.5px; line-height: 1.1; }
.flag { border-radius: 3px; box-shadow: 0 0 0 1px #0007, 0 1px 3px #0008; flex: none; display: block; }

/* ---- tier legend ---- */
.tiers { display: flex; gap: 6px; flex-wrap: wrap; margin: 0 0 14px; }
.tier { display: flex; align-items: center; gap: 8px; padding: 5px 11px 5px 6px; border-radius: 8px; background: #ffffff08; border: 1px solid var(--line); font-size: 12.5px; color: var(--dim); }
.tier i { font-style: normal; font-weight: 800; font-size: 14px; color: var(--ink); background: #ffffff12; border-radius: 6px; min-width: 28px; text-align: center; padding: 2px 4px; }
.tier span b { color: var(--ink); font-weight: 600; display: block; line-height: 1.15; }
.tier.used { color: var(--ink); }
.tier.used i { background: color-mix(in srgb, var(--acc) 35%, transparent); }
.opt { margin-left: auto; align-self: center; color: var(--dim); font-size: 13px; display: flex; gap: 6px; align-items: center; cursor: pointer; }
.opt input { accent-color: var(--amber); }

/* ---- the tree ---- */
.tree-wrap { overflow-x: auto; padding-bottom: 10px; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(180deg, #0e151d, #0b1117); }
.tree { position: relative; margin: 0 auto; }
.tree .col { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #ffffff12; }
.tree .col:nth-child(odd) { background: #ffffff04; }
.tree .col .th { position: absolute; top: 8px; left: 0; right: 0; text-align: center; line-height: 1.2; }
.tree .col .th b { font-size: 20px; color: var(--ink); letter-spacing: 1px; }
.tree .col .th span { display: block; font-size: 11.5px; color: var(--dim); }
.tree .col .th em { display: block; font-style: normal; font-size: 11px; color: var(--acc); opacity: .85; }
.tree .rootcard { position: absolute; display: flex; align-items: center; gap: 9px; padding: 0 10px; border-radius: 10px; background: linear-gradient(135deg, color-mix(in srgb, var(--acc) 30%, #0c1218), #0c1218); border: 1px solid color-mix(in srgb, var(--acc) 60%, transparent); font-weight: 700; z-index: 2; }
.tree .rootcard { font-size: 14px; line-height: 1.15; overflow: hidden; }
.tree .rootcard small { display: block; font-weight: 500; color: var(--dim); font-size: 10.5px; white-space: nowrap; }
.tree .lane-label { position: absolute; left: 10px; width: 110px; color: var(--dim); font-size: 11.5px; letter-spacing: .8px; text-transform: uppercase; font-weight: 600; line-height: 1.2; text-align: right; }
.tree .lane-band { position: absolute; left: 0; right: 0; border-top: 1px solid #ffffff0b; }
.tree svg.edges { position: absolute; left: 0; top: 0; pointer-events: none; overflow: visible; }
.edges path { fill: none; stroke: color-mix(in srgb, var(--acc) 70%, #fff 0%); stroke-width: 2; stroke-linejoin: round; opacity: .55; }
.edges path.succ { stroke-width: 3; opacity: .9; stroke-dasharray: 0; }
.edges circle { fill: var(--acc); opacity: .9; }

.node { position: absolute; display: grid; grid-template-rows: auto 1fr auto auto; padding: 6px 9px 7px; text-align: left; border-radius: 11px; background: linear-gradient(180deg, #19232f, #121a23); border: 1px solid var(--line2); box-shadow: 0 6px 16px #0006; transition: transform .15s, border-color .15s, box-shadow .15s; z-index: 2; overflow: hidden; }
.node:hover, .node:focus-visible { transform: translateY(-3px); border-color: var(--acc); box-shadow: 0 10px 22px #000a, 0 0 0 1px var(--acc); outline: none; }
.node.sel { border-color: var(--acc); box-shadow: 0 0 0 2px var(--acc), 0 10px 22px #000a; }
.node .n-top { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--dim); }
.node .n-type { font-weight: 800; letter-spacing: .6px; background: color-mix(in srgb, var(--acc) 30%, transparent); color: var(--ink); border-radius: 5px; padding: 0 6px; font-size: 11px; }
.node .n-prof { display: flex; align-items: flex-end; justify-content: center; min-height: 0; padding: 2px 0 1px; }
.node .n-prof svg { height: auto; max-height: 58px; display: block; }
.node .n-name { font-size: 14.5px; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node .n-sub { font-size: 11.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node .n-flag { margin-left: 5px; padding: 0 6px; font-size: 10px; background: #8a5a1c; color: #ffe2b0; border-radius: 5px; }
.prof { display: block; }
.prof * { vector-effect: non-scaling-stroke; }
.prof[viewBox] { stroke-width: .8px; }

.lanes-list { display: none; }
.note { color: var(--dim); font-size: 13px; margin: 12px 2px 0; max-width: 90ch; }

/* ---- card (detail drawer) ---- */
.scrim { position: fixed; inset: 0; background: #000a; z-index: 40; opacity: 0; pointer-events: none; transition: opacity .2s; }
.scrim.on { opacity: 1; pointer-events: auto; }
.card { position: fixed; top: 0; right: 0; bottom: 0; width: min(620px, 100vw); z-index: 41; background: var(--panel); border-left: 1px solid var(--line2); transform: translateX(102%); transition: transform .25s cubic-bezier(.2,.8,.2,1); overflow-y: auto; overscroll-behavior: contain; box-shadow: -20px 0 50px #000a; }
.card.on { transform: none; }
.card .hd { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: linear-gradient(180deg, color-mix(in srgb, var(--acc) 22%, var(--panel)), var(--panel)); border-bottom: 1px solid var(--line2); }
.card .hd h2 { margin: 0; font-size: 21px; line-height: 1.15; }
.card .hd small { color: var(--dim); display: block; font-size: 12.5px; }
.card .x { margin-left: auto; width: 38px; height: 38px; border-radius: 9px; background: #ffffff10; border: 1px solid var(--line2); font-size: 20px; flex: none; }
.card .x:hover { background: #ffffff22; }
.card .body { padding: 0 14px 40px; }
.viewer { position: relative; margin: 12px 0 8px; aspect-ratio: 16 / 10; max-height: 52vh; width: 100%; border-radius: 12px; overflow: hidden; background: #0d1620; border: 1px solid var(--line2); }
.viewer iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
.viewer .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--dim); font-size: 14px; }
.viewer .tap { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; padding: 10px; background: #0007; border: 0; border-radius: 0; z-index: 5; }
.vhint { color: var(--dim); font-size: 12px; margin: 0 0 8px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
.vhint a, .btn { display: inline-block; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--line2); background: #ffffff0d; color: var(--ink); text-decoration: none; font-size: 13px; }
.vhint a:hover, .btn:hover { background: #ffffff1c; }
.btn.pri { background: color-mix(in srgb, var(--acc) 30%, transparent); border-color: color-mix(in srgb, var(--acc) 70%, transparent); }
.profile-big { margin: 12px 0 6px; padding: 8px 10px; background: linear-gradient(180deg, #16293b, #0d1722); border: 1px solid var(--line); border-radius: 12px; }
.profile-big svg { width: 100%; height: auto; max-height: 120px; }
.bars { display: grid; gap: 7px; margin: 12px 0 14px; }
.bar { display: grid; grid-template-columns: 138px 1fr 92px; gap: 10px; align-items: center; font-size: 13px; }
.bar span { color: var(--dim); }
.bar i { display: block; height: 8px; border-radius: 4px; background: #ffffff12; position: relative; overflow: hidden; }
.bar i::after { content: ''; position: absolute; inset: 0; width: calc(var(--v) * 100%); background: linear-gradient(90deg, color-mix(in srgb, var(--acc) 55%, #000), var(--acc)); border-radius: 4px; }
.bar b { text-align: right; font-variant-numeric: tabular-nums; font-weight: 650; }
.sec { margin: 0 0 6px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel2); overflow: hidden; }
.sec > summary { cursor: pointer; padding: 9px 12px; font-weight: 650; list-style: none; display: flex; align-items: center; gap: 8px; }
.sec > summary::before { content: '▸'; color: var(--acc); transition: transform .15s; }
.sec[open] > summary::before { transform: rotate(90deg); }
.sec > summary::-webkit-details-marker { display: none; }
.sec dl { margin: 0; padding: 0 12px 10px; display: grid; grid-template-columns: minmax(120px, 38%) 1fr; gap: 5px 12px; font-size: 14px; }
.sec dt { color: var(--dim); }
.sec dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.sec dd.est::before { content: '≈ '; color: var(--amber); }
.sec .en { padding: 0 12px 10px; font-size: 13px; color: #c5ccd4; }
.sec .en p { margin: 0 0 8px; }
.sec .en b { color: var(--ink); display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: var(--dim); }
.sec ul { margin: 0; padding: 0 12px 10px 28px; font-size: 13px; color: #c5ccd4; }
.legend { color: var(--dim); font-size: 12px; margin: 8px 2px; }
.legend::before { content: '≈'; color: var(--amber); margin-right: 5px; }
.cardnav { display: flex; gap: 8px; margin: 14px 0 0; }
.cardnav .btn { flex: 1; text-align: center; }

/* ---- comparison table ---- */
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 12px; }
.chip { padding: 5px 11px; border-radius: 999px; background: #ffffff0a; border: 1px solid var(--line2); font-size: 13px; color: var(--ink); display: inline-flex; align-items: center; gap: 6px; }
.chip.on { background: #e2a04e26; border-color: var(--amber); color: var(--amber); }
.tbl-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); }
table.cmp { border-collapse: collapse; width: 100%; font-size: 13.5px; font-variant-numeric: tabular-nums; }
table.cmp th, table.cmp td { padding: 8px 12px; text-align: right; white-space: nowrap; border-bottom: 1px solid var(--line); }
table.cmp th { position: sticky; top: 0; background: #151d27; cursor: pointer; color: var(--dim); font-weight: 600; user-select: none; }
table.cmp th:hover { color: var(--ink); }
table.cmp th.sorted { color: var(--amber); }
table.cmp td.l, table.cmp th.l { text-align: left; }
table.cmp tbody tr { cursor: pointer; }
table.cmp tbody tr:hover { background: #ffffff0a; }
table.cmp td.nm { font-weight: 600; text-align: left; }
table.cmp td.nm > span { display: inline-flex; align-items: center; gap: 9px; }
table.cmp td:first-child, table.cmp th:first-child { position: sticky; left: 0; background: var(--panel); }
table.cmp th:first-child { background: #151d27; z-index: 1; }

/* ---- aircraft ---- */
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.acard { display: grid; gap: 4px; text-align: left; padding: 10px 12px 12px; border-radius: 12px; background: linear-gradient(180deg, #19232f, #121a23); border: 1px solid var(--line2); transition: transform .15s, border-color .15s; }
.acard:hover { transform: translateY(-3px); border-color: var(--acc); }
.acard .pic { height: 108px; display: flex; align-items: center; justify-content: center; background: linear-gradient(180deg, #16293b, #0d1722); border-radius: 8px; margin-bottom: 6px; }
.acard .pic svg { height: 100%; width: 100%; padding: 6px; }
.acard b { font-size: 15px; line-height: 1.2; }
.acard small { color: var(--dim); display: flex; gap: 6px; align-items: center; }
.acard .st { font-size: 12.5px; color: var(--dim); }

footer { max-width: 1360px; margin: 0 auto; padding: 0 18px 40px; color: var(--dim); font-size: 12.5px; }

/* ---- phones ---- */
@media (max-width: 760px) {
  body { font-size: 14.5px; }
  .top { position: static; padding: 8px 12px; gap: 6px 10px; }
  .brand { order: 1; flex: 1; }
  .ext { order: 2; margin-left: 0; }
  .ext a { padding: 5px 10px; font-size: 13px; }
  .nav { order: 3; width: 100%; flex-wrap: nowrap; overflow-x: auto; margin-inline: -4px; }
  main { padding: 12px 12px 50px; }
  h1 { font-size: 21px; }
  .tabs { flex-wrap: nowrap; overflow-x: auto; margin-inline: -12px; padding: 2px 12px 8px; scrollbar-width: thin; }
  .tab { flex: none; padding: 7px 11px 7px 8px; }
  .tab small { display: none; }
  .tiers { flex-wrap: nowrap; overflow-x: auto; margin-inline: -12px; padding: 0 12px 6px; }
  .tier { flex: none; }
  .tree-wrap { display: none; }
  .opt { display: none; }
  .lanes-list { display: block; }
  .lane-h { display: flex; align-items: center; gap: 10px; margin: 16px 2px 8px; font-size: 12.5px; letter-spacing: 1px; text-transform: uppercase; color: var(--dim); font-weight: 650; }
  .lane-h::after { content: ''; flex: 1; height: 1px; background: var(--line2); }
  .lane-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 9px; }
  .lane-row .node { position: relative; left: auto !important; top: auto !important; width: auto !important; height: 126px !important; }
  .lane-row .node .n-prof svg { max-height: 66px; }
  .lane-row .node .tier-chip { display: inline; }
  .card { width: 100vw; }
  .card .hd h2 { font-size: 18px; }
  .viewer { aspect-ratio: 4 / 3.4; max-height: 46vh; }
  .viewer .tap { display: flex; }
  .viewer.live .tap { display: none; }
  .bar { grid-template-columns: 112px 1fr 76px; }
  .sec dl { grid-template-columns: 1fr; gap: 0; }
  .sec dt { margin-top: 6px; font-size: 12.5px; }
  table.cmp { font-size: 12.5px; }
  table.cmp th, table.cmp td { padding: 7px 8px; }
}
.node .tier-chip { display: none; font-size: 10.5px; color: var(--acc); margin-left: 6px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; scroll-behavior: auto !important; } }
`;

export function injectStyles() {
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.append(el);
}

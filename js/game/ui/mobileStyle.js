// Style of the touch interface (body.mobile). The desktop interface is left as it is: these rules only reshape it for a small screen held in the hand.
export const MOBILE_CSS = /* css */ `
body.mobile { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; overscroll-behavior: none; font-size: 14px; }
body.mobile #ui { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); box-sizing: border-box; }

/* the desktop top bar is replaced by a compact one (its buttons stay in the page: the menu presses them) */
body.mobile #topbar { display: none; }
#mbar { position: fixed; top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); display: flex; gap: 8px; align-items: center; pointer-events: none; z-index: 60; }
#mbar > * { pointer-events: auto; }
#mbar .mb { min-width: 46px; height: 42px; border-radius: 12px; font-size: 16px; font-weight: 700; padding: 0 12px; background: #0b0f14c8; border: 1px solid #ffffff26; backdrop-filter: blur(6px); }
#mbar .mb:active { background: #e2a04e55; }
#mbar .clock { font: 700 17px ui-monospace, monospace; background: #0b0f14c8; border: 1px solid #ffffff26; border-radius: 12px; height: 42px; line-height: 42px; padding: 0 12px; }
#mbar .grow { flex: 1; }

/* the menu */
#mmenu { position: fixed; top: calc(max(8px, env(safe-area-inset-top)) + 50px); right: max(8px, env(safe-area-inset-right)); width: min(330px, calc(100vw - 16px)); max-height: calc(100vh - 80px); overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; z-index: 70; }
#mmenu button, #mmenu a { min-height: 46px; font-size: 15px; border-radius: 10px; display: flex; align-items: center; justify-content: center; text-align: center; color: inherit; text-decoration: none; background: #ffffff14; border: 1px solid #ffffff2a; padding: 6px; }
#mmenu button:active, #mmenu a:active { background: #e2a04e55; }
#mmenu button.on { background: #e2a04e44; border-color: var(--amber); }

/* cameras: one row that scrolls sideways along the bottom */
body.mobile #cambar { left: max(8px, env(safe-area-inset-left)); right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); transform: none; max-width: none; flex-wrap: nowrap; overflow-x: auto; justify-content: flex-start; scrollbar-width: none; padding: 5px; gap: 6px; z-index: 15; }
body.mobile #cambar::-webkit-scrollbar { display: none; }
body.mobile #cambar .cam { flex: none; min-height: 40px; padding: 0 14px; font-size: 14px; border-radius: 10px; white-space: nowrap; }
body.mobile #cambar .cam b { display: none; }

/* information panels: hidden until asked for in the menu, then a column on the right */
body.mobile #shipinfo, body.mobile #planeinfo { display: none; position: fixed; right: max(8px, env(safe-area-inset-right)); bottom: 64px; top: auto; width: min(320px, 46vw); max-height: calc(100vh - 150px); overflow-y: auto; font-size: 12px; z-index: 12; }
body.mobile.m-info #shipinfo:not(:empty) { display: block; }
body.mobile.m-info #planeinfo:not(.hidden) { display: block; }
body.mobile #teamshud { display: none; top: 58px; right: max(8px, env(safe-area-inset-right)); max-width: 52vw; font-size: 11.5px; z-index: 12; }
body.mobile.m-teams #teamshud { display: flex; }
body.mobile #hitlog { left: max(8px, env(safe-area-inset-left)); bottom: 64px; width: min(340px, 46vw); font-size: 11.5px; max-height: 40vh; overflow: hidden; }
body.mobile #feed { top: 58px; font-size: 12px; }
body.mobile .lab { font-size: 10.5px; }
body.mobile .lab .lbar { width: 26px; }

/* panels over the whole screen */
body.mobile #setup { left: 0; top: 0; width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 18px max(14px, env(safe-area-inset-left)); box-sizing: border-box; padding-top: calc(max(8px, env(safe-area-inset-top)) + 54px); z-index: 40; }
body.mobile #setup .btn, body.mobile #setup select { min-height: 42px; font-size: 15px; }
body.mobile #setup a.btn { display: flex; align-items: center; justify-content: center; }
body.mobile #setup .ico { width: 38px; height: 38px; font-size: 18px; }
body.mobile #settings { left: 8px; right: 8px; top: calc(max(8px, env(safe-area-inset-top)) + 50px); width: auto; max-height: calc(100vh - 70px); z-index: 42; }
body.mobile #settings label.slider { min-height: 40px; }
body.mobile #settings input[type=range] { height: 28px; }
body.mobile #results, body.mobile #score, body.mobile #help { min-width: 0; width: calc(100vw - 20px); max-width: none; max-height: 88vh; box-sizing: border-box; font-size: 12px; z-index: 42; }
body.mobile #score { top: 56px; }
body.mobile #banner { font-size: 22px; }

/* the cross that closes a panel (the desktop buttons that toggled them are not on screen) */
.mclose { position: sticky; top: 0; float: right; z-index: 2; width: 42px; height: 42px; margin: -4px -6px 4px 8px; border-radius: 12px; font-size: 20px; line-height: 1; background: #ffffff1c; border: 1px solid #ffffff33; }
.mclose:active { background: #e2a04e55; }

/* virtual stick and buttons of the free camera and the map */
#joy { position: fixed; left: max(24px, env(safe-area-inset-left)); bottom: 72px; width: 124px; height: 124px; border-radius: 50%; background: #0b0f1488; border: 2px solid #ffffff33; touch-action: none; z-index: 14; }
#joy i { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px; margin: -26px 0 0 -26px; border-radius: 50%; background: #e2a04ecc; box-shadow: 0 2px 10px #0008; }
#jbtns { position: fixed; left: calc(max(24px, env(safe-area-inset-left)) + 142px); bottom: 72px; display: flex; flex-direction: column; gap: 10px; z-index: 14; }
#jbtns button { width: 56px; height: 56px; border-radius: 50%; font-size: 22px; background: #0b0f14aa; border: 2px solid #ffffff33; touch-action: none; }
#jbtns button.on, #jbtns button:active { background: #e2a04e88; border-color: var(--amber); }

/* a hint to turn the phone */
#mhint { position: fixed; left: 12px; right: 12px; top: 40%; z-index: 80; text-align: center; padding: 16px; font-size: 15px; }
#mhint button { margin: 10px 6px 0; min-height: 42px; padding: 0 16px; border-radius: 10px; font-size: 15px; }

/* short screens (a phone in landscape): everything a little tighter */
@media (max-height: 460px) {
  #mbar .mb, #mbar .clock { height: 38px; line-height: 38px; }
  #mmenu { top: 54px; grid-template-columns: 1fr 1fr 1fr; width: min(480px, calc(100vw - 16px)); }
  #joy { bottom: 64px; width: 108px; height: 108px; }
  #jbtns { bottom: 64px; left: calc(max(24px, env(safe-area-inset-left)) + 124px); }
  body.mobile #cambar .cam { min-height: 36px; }
}
`;

// The panel's styles, scoped under .hs-studio so they neither leak into nor
// pick up the host page's styles.
// A rounded card of dark glass (true black at 65%) whose accent follows the
// scene's palette (see theme.ts): a bold title with a dim breadcrumb, small uppercase mono labels,
// pill buttons, and the palette's accent for state and choices.
export const STUDIO_CSS = /* css */ `
.hs-studio {
  --hs-card: rgb(0 0 0 / 0.65); --hs-foot: rgb(0 0 0 / 0.3); --hs-sunken: rgb(255 255 255 / 0.05); --hs-raised: rgb(255 255 255 / 0.09);
  --hs-fg: #f4f3ee; --hs-dim: rgb(244 243 238 / 0.68); --hs-faint: rgb(244 243 238 / 0.5); --hs-line: rgb(255 255 255 / 0.09); --hs-line-strong: rgb(255 255 255 / 0.16);
  --hs-accent: #f0b43c; --hs-accent-bg: rgb(240 180 60 / 0.16); --hs-accent-line: rgb(240 180 60 / 0.45);
  --hs-primary-bg: #f5f4f0; --hs-primary-fg: #121214; --hs-bad: #f07a6e;
  --hs-sans: "Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif;
  --hs-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  color: var(--hs-fg); text-align: left; letter-spacing: normal; font: 13px/1.45 var(--hs-sans);
  -webkit-font-smoothing: antialiased;
}
.hs-studio * { box-sizing: border-box; font: inherit; letter-spacing: inherit; }
.hs-studio [hidden], .hs-studio[hidden] { display: none !important; }

/* The card, floating over the page. */
.hs-studio {
  position: fixed; top: 20px; right: 20px; z-index: 2147483000; width: 372px; max-height: calc(100% - 40px);
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--hs-card); border: 1px solid var(--hs-line-strong); border-radius: 22px;
  backdrop-filter: blur(22px) saturate(1.2); -webkit-backdrop-filter: blur(22px) saturate(1.2);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.06) inset, 0 30px 70px rgb(0 0 0 / 0.35);
}
.hs-studio.hs-left { right: auto; left: 20px; }
.hs-studio.hs-folded > :not(.hs-head) { display: none; }

/* Head: a bold title with the look's name tucked just under it, and the
   round fold button. */
.hs-head { display: flex; align-items: center; gap: 12px; padding: 16px 16px 14px 22px; border-bottom: 1px solid var(--hs-line); }
.hs-studio.hs-folded .hs-head { border-bottom: 0; }
.hs-studio .hs-head { cursor: grab; touch-action: none; user-select: none; }
.hs-studio.hs-dragging .hs-head { cursor: grabbing; }
.hs-studio.hs-dragging { transition: none; box-shadow: 0 1px 0 rgb(255 255 255 / 0.06) inset, 0 40px 90px rgb(0 0 0 / 0.5); }
@media (max-width: 600px) { .hs-studio .hs-head { cursor: default; } }
.hs-head-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.hs-crumb-root { font-size: 17px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; color: var(--hs-fg); cursor: pointer; user-select: none; white-space: nowrap; }
.hs-lookname { display: block; color: var(--hs-dim); font-size: 12.5px; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hs-foot .hs-stats { font: 500 10.5px/1 var(--hs-mono) !important; letter-spacing: 0.12em !important; color: var(--hs-dim); text-transform: uppercase; white-space: nowrap; font-variant-numeric: tabular-nums; }
.hs-studio button.hs-fold {
  width: 32px; height: 32px; padding: 0; border-radius: 50%; background: var(--hs-raised); border-color: transparent;
  color: var(--hs-dim); font: 400 16px/1 var(--hs-sans) !important; letter-spacing: 0 !important;
}
.hs-studio button.hs-fold:hover { color: var(--hs-fg); background: var(--hs-line-strong); }
.hs-studio button.hs-fold:disabled { opacity: 0.3; }
.hs-studio button.hs-fold svg { display: block; margin: auto; }
.hs-head { gap: 6px; }
.hs-head .hs-head-text { margin-right: 6px; }

/* Buttons. */
.hs-studio button {
  font: 500 12.5px/1 var(--hs-sans) !important; letter-spacing: normal !important;
  color: var(--hs-fg); background: var(--hs-raised); border: 1px solid var(--hs-line); border-radius: 10px;
  padding: 9px 12px; cursor: pointer; white-space: nowrap; transition: border-color 0.15s, background 0.15s, color 0.15s;
}
.hs-studio button:hover { border-color: var(--hs-line-strong); background: var(--hs-line-strong); }
.hs-studio button:focus-visible, .hs-studio input:focus-visible { outline: 2px solid var(--hs-accent-line); outline-offset: 2px; }
.hs-studio button:disabled { opacity: 0.4; cursor: default; }
.hs-studio button.hs-pill { border-radius: 999px; padding: 10px 16px; }
.hs-studio button.hs-primary { background: var(--hs-primary-bg); color: var(--hs-primary-fg); border-color: transparent; }
.hs-studio button.hs-primary:hover { background: var(--hs-primary-bg); filter: brightness(0.94); }
.hs-studio button.hs-quiet { background: transparent; border-color: transparent; color: var(--hs-dim); padding: 6px 8px; }
.hs-studio button.hs-quiet:hover { color: var(--hs-fg); background: var(--hs-raised); }

/* Tabs: a rounded segmented control. */
.hs-tabs { display: flex; gap: 2px; margin: 14px 18px 2px; padding: 3px; background: var(--hs-sunken); border-radius: 12px; }
.hs-tabs button { flex: 1; background: transparent !important; border: 0 !important; border-radius: 9px !important; padding: 8px 4px !important; color: var(--hs-dim) !important; font-size: 12px !important; }
.hs-tabs button:hover { color: var(--hs-fg) !important; }
.hs-tabs button.hs-on { color: var(--hs-fg) !important; background: var(--hs-raised) !important; box-shadow: 0 1px 0 var(--hs-line-strong) inset; }

/* Body. */
.hs-body { flex: 1; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--hs-line-strong) transparent; }
.hs-pane { padding: 0 22px 16px; }
.hs-group { padding: 18px 0; border-bottom: 1px solid var(--hs-line); }
.hs-group:last-child { border-bottom: 0; }
.hs-group h3 { margin: 0 0 12px; font: 500 10.5px/1 var(--hs-mono) !important; color: var(--hs-dim); letter-spacing: 0.14em !important; text-transform: uppercase; }
.hs-row { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; align-items: center; }
.hs-row > input[type="text"] { flex: 1; min-width: 0; }
.hs-hint { margin: 8px 0 0; color: var(--hs-dim); font-size: 12.5px; }
.hs-layers { display: grid; gap: 10px; }
.hs-layers:empty { display: none; }
.hs-layer { padding: 12px; border-radius: 14px; background: rgb(255 255 255 / 0.04); border: 1px solid rgb(255 255 255 / 0.06); }
.hs-layer h4 { margin: 0 0 4px; font: 500 11px/1.2 var(--hs-mono); color: var(--hs-fg); letter-spacing: 0.04em; }
.hs-layer input[type="text"] { width: 100%; margin-top: 6px; }

/* Tiles: rounded choices; the chosen one in the accent. */
.hs-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin: 8px 0 0; }
.hs-studio button.hs-tile {
  display: flex; flex-direction: column; align-items: flex-start; gap: 7px; padding: 10px 11px; text-align: left; border-radius: 12px;
  font-weight: 400 !important; background: var(--hs-sunken); border-color: transparent; color: var(--hs-dim);
}
.hs-studio button.hs-tile:hover { color: var(--hs-fg); background: var(--hs-raised); border-color: transparent; }
.hs-studio button.hs-tile.hs-on { color: var(--hs-fg); border-color: var(--hs-accent-line); background: var(--hs-accent-bg); }
.hs-tile code { font: 13px/1 var(--hs-mono) !important; color: var(--hs-fg); letter-spacing: 0.08em !important; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: clip; }
.hs-swatch { display: flex; gap: 3px; padding: 3px; width: 100%; border-radius: 7px; }
.hs-swatch i { flex: 1; height: 12px; border-radius: 3px; }
.hs-ink { width: 12px; height: 12px; border-radius: 50%; }

/* Sliders: a rounded track filled in the accent, a round handle. */
.hs-slider { display: grid; grid-template-columns: 80px 1fr 52px; align-items: center; gap: 12px; margin: 12px 0 0; color: var(--hs-dim); font-size: 12.5px; }
.hs-slider input[type="range"] { -webkit-appearance: none; appearance: none; width: 100%; height: 18px; background: transparent; margin: 0; cursor: pointer; }
.hs-slider input[type="range"]::-webkit-slider-runnable-track {
  height: 6px; border-radius: 999px;
  background: linear-gradient(var(--hs-accent), var(--hs-accent)) left / var(--fill, 0%) 100% no-repeat, var(--hs-sunken);
}
.hs-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 999px; background: var(--hs-sunken); }
.hs-slider input[type="range"]::-moz-range-progress { height: 6px; border-radius: 999px; background: var(--hs-accent); }
.hs-slider input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; margin-top: -4px; border-radius: 50%; background: var(--hs-primary-bg); border: 0; box-shadow: 0 1px 4px rgb(0 0 0 / 0.35); }
.hs-slider input[type="range"]::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: var(--hs-primary-bg); border: 0; }
.hs-slider input[type="range"]:focus-visible { outline: 2px solid var(--hs-accent-line); outline-offset: 3px; border-radius: 999px; }
.hs-num {
  width: 100%; background: var(--hs-sunken); color: var(--hs-fg); border: 1px solid transparent; border-radius: 8px;
  padding: 5px 7px; text-align: right; font: 12px/1 var(--hs-mono) !important; font-variant-numeric: tabular-nums; -moz-appearance: textfield;
}
.hs-num::-webkit-inner-spin-button, .hs-num::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.hs-num:focus { outline: none; border-color: var(--hs-accent-line); }

/* Advanced settings, folded. */
.hs-advanced { margin-top: 12px; }
.hs-advanced summary { cursor: pointer; color: var(--hs-faint); list-style: none; padding: 2px 0; user-select: none; font: 500 10.5px/1.4 var(--hs-mono) !important; letter-spacing: 0.14em !important; text-transform: uppercase; }
.hs-advanced summary::-webkit-details-marker { display: none; }
.hs-advanced summary::before { content: "+ "; }
.hs-advanced[open] summary::before { content: "– "; }
.hs-advanced summary:hover { color: var(--hs-dim); }

/* Inputs. */
.hs-studio input[type="text"], .hs-studio input[type="password"] { background: var(--hs-sunken); color: var(--hs-fg); border: 1px solid transparent; border-radius: 10px; padding: 9px 11px; }
.hs-studio input[type="text"]:focus, .hs-studio input[type="password"]:focus { outline: none; border-color: var(--hs-accent-line); }

/* Looks: thumbnail, name, and quiet actions; a row opens under one for
   renaming or duplicating. */
.hs-look-item { display: flex; flex-direction: column; }
.hs-look-item > .hs-row { margin: 6px 0 4px; }
.hs-studio button.hs-look-name { display: flex; align-items: center; gap: 10px; padding: 5px 10px 5px 5px; }
.hs-thumb { flex: none; width: 44px; height: 28px; border-radius: 6px; background: var(--hs-sunken) center / cover no-repeat; box-shadow: inset 0 0 0 1px var(--hs-line); }

/* A short note with an action, e.g. autoplay paused. */
.hs-note { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding: 6px 6px 6px 12px; border-radius: 10px; background: var(--hs-accent-bg); color: var(--hs-fg); font-size: 12.5px; }

/* Custom colours: a label, the hex, and a swatch that opens the picker. */
.hs-colorrow { display: grid; grid-template-columns: 1fr auto 34px; align-items: center; gap: 10px; margin: 8px 0 0; color: var(--hs-dim); font-size: 12.5px; }
.hs-hex { font: 11px/1 var(--hs-mono) !important; color: var(--hs-faint); text-transform: uppercase; }
.hs-color { width: 34px; height: 22px; padding: 0; border: 1px solid var(--hs-line-strong); border-radius: 6px; background: none; cursor: pointer; }
.hs-color::-webkit-color-swatch-wrapper { padding: 2px; }
.hs-color::-webkit-color-swatch { border: 0; border-radius: 4px; }
.hs-color::-moz-color-swatch { border: 0; border-radius: 4px; }

/* Looks. */
.hs-looks { display: flex; flex-direction: column; gap: 6px; }
.hs-look { display: flex; align-items: center; gap: 6px; }
.hs-studio button.hs-look-name { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; font-weight: 400 !important; background: var(--hs-sunken); border-color: transparent; }
.hs-studio button.hs-look-name.hs-on { border-color: var(--hs-accent-line); background: var(--hs-accent-bg); }
.hs-badge { font: 500 10.5px/1 var(--hs-mono) !important; letter-spacing: 0.08em !important; text-transform: uppercase; color: var(--hs-accent); background: var(--hs-accent-bg); padding: 6px 8px; border-radius: 7px; white-space: nowrap; }

/* Foot: the look's state and its actions, on a darker band. */
.hs-foot { display: flex; flex-direction: column; gap: 14px; padding: 14px 16px 12px 22px; background: var(--hs-foot); border-top: 1px solid var(--hs-line); }
.hs-foot-row { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
/* The brand, small and centred at the very bottom. */
.hs-brand { display: flex; justify-content: center; color: var(--hs-faint); padding-right: 6px; }
.hs-brand svg { display: block; width: 52px; height: auto; }
.hs-foot-meta { display: flex; flex-direction: column; gap: 5px; }
.hs-foot .hs-actions { display: flex; gap: 8px; margin-left: auto; flex-wrap: wrap; justify-content: flex-end; }
.hs-tag { font: 500 10.5px/1 var(--hs-mono) !important; letter-spacing: 0.14em !important; text-transform: uppercase; color: var(--hs-accent); white-space: nowrap; }
.hs-tag.hs-tag-quiet { color: var(--hs-faint); }
.hs-tag:empty { display: none; }

/* Messages. */
.hs-problems { margin: 14px 22px 0; padding: 10px 12px; color: var(--hs-bad); background: rgb(240 122 110 / 0.1); border-radius: 10px; white-space: pre-wrap; font: 12px/1.45 var(--hs-mono) !important; }
.hs-problems:empty { display: none; }
.hs-stats { color: var(--hs-faint); font: 10.5px/1.4 var(--hs-mono) !important; letter-spacing: 0.1em !important; text-transform: uppercase; }
.hs-toast { position: absolute; left: 22px; right: 22px; bottom: 76px; padding: 10px 14px; background: var(--hs-primary-bg); color: var(--hs-primary-fg); border-radius: 12px; font-size: 12.5px; opacity: 0; transform: translateY(6px); transition: opacity 0.2s, transform 0.2s; pointer-events: none; box-shadow: 0 8px 24px rgb(0 0 0 / 0.3); }
.hs-toast.hs-shown { opacity: 1; transform: none; }

@media (max-width: 600px) {
  .hs-studio, .hs-studio.hs-left { top: auto; bottom: 12px; left: 12px; right: 12px; width: auto; max-height: 60%; border-radius: 20px; }
}
`

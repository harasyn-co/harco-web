// The studio's styles, scoped under .hs-studio so they neither leak into nor
// pick up the host page's styles.
export const STUDIO_CSS = /* css */ `
.hs-studio {
  --hs-bg: #0b0b0c; --hs-fg: #d9d6ce; --hs-dim: #8a877f; --hs-line: #2a2a2c; --hs-bad: #e08a7a;
  position: fixed; top: 16px; right: 16px; z-index: 2147483000;
  width: 290px; max-height: calc(100% - 32px); overflow: auto; box-sizing: border-box;
  padding: 12px; background: rgb(11 11 12 / 0.86); border: 1px solid var(--hs-line);
  backdrop-filter: blur(6px); color: var(--hs-fg); text-align: left;
  font: 12px/1.5 ui-monospace, "IBM Plex Mono", Menlo, monospace; letter-spacing: normal;
}
.hs-studio * { box-sizing: border-box; font: inherit; letter-spacing: inherit; }
.hs-studio[hidden] { display: none; }
.hs-studio h1 { margin: 0 0 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; user-select: none; }
.hs-studio h1::after { content: " −"; color: var(--hs-dim); }
.hs-studio.hs-folded h1::after { content: " +"; }
.hs-studio.hs-folded > :not(h1):not(.hs-stats) { display: none; }
.hs-studio h2 { margin: 14px 0 6px; font-size: 11px; font-weight: 500; color: var(--hs-dim); letter-spacing: 0.06em; text-transform: uppercase; }
.hs-studio p { margin: 0; color: var(--hs-dim); }
.hs-studio .hs-stats { font-variant-numeric: tabular-nums; }
.hs-studio .hs-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; align-items: center; }
.hs-studio button { color: var(--hs-fg); background: transparent; border: 1px solid var(--hs-line); border-radius: 0; padding: 3px 8px; cursor: pointer; }
.hs-studio button:hover { border-color: var(--hs-dim); }
.hs-studio button.hs-on { background: var(--hs-fg); color: var(--hs-bg); border-color: var(--hs-fg); }
.hs-studio button:disabled { opacity: 0.4; cursor: default; }
.hs-studio .hs-slider { display: grid; grid-template-columns: 70px 1fr 40px; align-items: center; gap: 8px; margin-bottom: 4px; color: var(--hs-dim); }
.hs-studio .hs-slider output { text-align: right; color: var(--hs-fg); font-variant-numeric: tabular-nums; }
.hs-studio .hs-slider input { width: 100%; accent-color: var(--hs-fg); }
.hs-studio input[type="text"] { flex: 1; min-width: 0; background: #0e0e10; color: var(--hs-fg); border: 1px solid var(--hs-line); padding: 3px 6px; }
.hs-studio input[type="text"]:focus, .hs-studio textarea:focus { outline: none; border-color: var(--hs-dim); }
.hs-studio textarea { width: 100%; resize: vertical; background: #0e0e10; color: var(--hs-fg); border: 1px solid var(--hs-line); padding: 6px; font-size: 10.5px; line-height: 1.45; white-space: pre; }
.hs-studio .hs-problems { margin: 4px 0; color: var(--hs-bad); font-size: 11px; white-space: pre-wrap; }
.hs-studio .hs-problems:empty { display: none; }
.hs-studio .hs-note { color: var(--hs-dim); }
.hs-studio .hs-looks { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
.hs-studio .hs-look { display: flex; gap: 4px; }
.hs-studio .hs-look > button:first-child { flex: 1; text-align: left; }
.hs-studio .hs-live { color: #9fd49a; }
@media (max-width: 600px) {
  .hs-studio { top: auto; bottom: 16px; left: 16px; right: 16px; width: auto; max-height: 45%; }
}
`

import fs from "node:fs";
import path from "node:path";

const dataDir = new URL("./data/", import.meta.url);
const aliases = {
  Amazons: "Amazon",
  Bretonian: "Bretonnian",
  "Underwold Denizens": "Underworld Denizens",
  "Chaos Renegade": "Chaos Renegades",
};
const canonical = (name) => aliases[name] || name;
const files = fs.readdirSync(dataDir).filter((name) => name.endsWith(".csv")).sort();
const records = {};

for (const file of files) {
  const roster = canonical(path.basename(file, ".csv"));
  records[roster] ||= {};
  const lines = fs.readFileSync(new URL(file, dataDir), "utf8").replace(/^\uFEFF/, "").trim().split(/\r?\n/).slice(1);
  for (const line of lines) {
    const [rawOpponent, games, wins, draws, losses] = line.split(",");
    const opponent = canonical(rawOpponent);
    records[roster][opponent] ||= { g: 0, w: 0, d: 0, l: 0 };
    const row = records[roster][opponent];
    row.g += Number(games);
    row.w += Number(wins);
    row.d += Number(draws);
    row.l += Number(losses);
  }
}

const rosters = Object.keys(records).sort();

// Prefer the more complete side of a reciprocal pair when an export is partial.
for (const roster of rosters) {
  for (const opponent of rosters) {
    const direct = records[roster][opponent];
    const reciprocal = records[opponent][roster];
    if (reciprocal && (!direct || reciprocal.g > direct.g)) {
      records[roster][opponent] = { g: reciprocal.g, w: reciprocal.l, d: reciprocal.d, l: reciprocal.w, derived: true };
    }
  }
}

const compact = {};
for (const roster of rosters) {
  compact[roster] = {};
  for (const [opponent, row] of Object.entries(records[roster])) {
    compact[roster][opponent] = [row.g, row.w, row.d, row.l, row.derived ? 1 : 0];
  }
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="theme-color" content="#101310">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Eightfold | Nation Matchup Lab</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101310;
      --panel: #171b17;
      --panel-2: #1d221d;
      --line: #343b34;
      --line-bright: #4a5449;
      --text: #f1f3ec;
      --muted: #9ba49a;
      --accent: #d9f34a;
      --accent-ink: #161a0d;
      --win: #8fcd76;
      --edge-win: #b0cf71;
      --draw: #c3bba2;
      --edge-loss: #d5a06f;
      --loss: #e37b68;
      --radius: 12px;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      --sans: "Avenir Next", Avenir, "Segoe UI Variable", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    html { min-width: 320px; background: var(--bg); }
    body { margin: 0; color: var(--text); background: var(--bg); font-family: var(--sans); line-height: 1.45; }
    button, input, select { font: inherit; }
    button, select, input { color: inherit; }
    button { cursor: pointer; }
    .shell { width: min(1480px, calc(100% - 40px)); margin: 0 auto; }
    .topbar { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 1px solid var(--line); }
    .brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
    .mark { width: 34px; height: 34px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 3px; transform: rotate(45deg); flex: 0 0 auto; }
    .mark i { display: block; border: 1px solid var(--line-bright); background: var(--panel-2); }
    .mark i:first-child, .mark i:last-child { background: var(--accent); border-color: var(--accent); }
    .brand strong { display: block; font-size: 14px; letter-spacing: .11em; text-transform: uppercase; }
    .brand span { color: var(--muted); font: 10px var(--mono); letter-spacing: .08em; text-transform: uppercase; }
    .top-actions { display: flex; gap: 8px; }
    .button { min-height: 38px; padding: 0 14px; border: 1px solid var(--line-bright); border-radius: 8px; background: transparent; font-size: 12px; font-weight: 650; transition: background .16s ease, border-color .16s ease, transform .1s ease; }
    .button:hover { background: var(--panel-2); border-color: var(--muted); }
    .button:active { transform: translateY(1px); }
    .button.primary { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
    .button.primary:hover { background: #e4fa6f; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; padding: 18px 0; font: 11px var(--mono); color: var(--muted); }
    .legend span { display: inline-flex; align-items: center; gap: 7px; }
    .analysis-bar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 14px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
    .analysis-copy strong { display: block; font-size: 12px; }
    .analysis-copy span { color: var(--muted); font-size: 10px; }
    .segmented { display: grid; grid-template-columns: 1fr 1fr; flex: 0 0 auto; padding: 3px; border: 1px solid var(--line); border-radius: 9px; background: var(--bg); }
    .segment { min-width: 82px; min-height: 34px; border: 0; border-radius: 6px; color: var(--muted); background: transparent; font-size: 11px; font-weight: 650; }
    .segment.active { color: var(--accent-ink); background: var(--accent); }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    .c-win { color: var(--win); } .c-edge-win { color: var(--edge-win); } .c-draw { color: var(--draw); } .c-edge-loss { color: var(--edge-loss); } .c-loss { color: var(--loss); }
    .scoreboard { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
    .score-grid { display: grid; grid-template-columns: minmax(0, 1fr) 190px minmax(0, 1fr); min-height: 150px; }
    .nation-summary { padding: 26px; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
    .nation-summary.away { text-align: right; }
    .nation-label { color: var(--muted); font: 10px var(--mono); letter-spacing: .14em; text-transform: uppercase; }
    .nation-name-display { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: clamp(20px, 2vw, 30px); font-weight: 650; letter-spacing: -.03em; }
    .record { display: flex; gap: 12px; align-items: baseline; font: 12px var(--mono); color: var(--muted); }
    .away .record { justify-content: flex-end; }
    .record b { font-size: 17px; color: var(--text); }
    .verdict { display: flex; flex-direction: column; align-items: center; justify-content: center; border-inline: 1px solid var(--line); background: #131713; text-align: center; }
    .verdict strong { font: 34px/1 var(--mono); letter-spacing: -.06em; white-space: nowrap; }
    .verdict span { margin-top: 9px; font: 10px var(--mono); letter-spacing: .12em; text-transform: uppercase; }
    .probability-row { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--line); }
    .probability { padding: 17px 22px; border-right: 1px solid var(--line); }
    .probability:last-child { border-right: 0; }
    .probability small { display: block; margin-bottom: 5px; color: var(--muted); font: 10px var(--mono); letter-spacing: .08em; text-transform: uppercase; }
    .probability strong { font: 20px var(--mono); }
    .prob-track { height: 3px; margin-top: 10px; overflow: hidden; background: var(--line); }
    .prob-track i { display: block; width: 0; height: 100%; background: currentColor; transition: width .35s ease; }
    .workspace { margin: 24px 0 70px; border-top: 1px solid var(--line); }
    .workspace-head, .matchup-row { display: grid; grid-template-columns: 34px minmax(210px, 1fr) 88px minmax(210px, 1fr) 114px 78px 78px 78px 100px 30px; gap: 12px; align-items: center; }
    .workspace-head { min-height: 54px; color: var(--muted); font: 10px var(--mono); letter-spacing: .1em; text-align: center; text-transform: uppercase; }
    .matchup-row { min-height: 98px; border-top: 1px solid var(--line); position: relative; }
    .matchup-row:last-child { border-bottom: 1px solid var(--line); }
    .matchup-row::before { content: ""; position: absolute; left: 0; top: 20px; bottom: 20px; width: 2px; background: var(--status-color, var(--draw)); opacity: .8; }
    .slot { color: var(--muted); font: 12px var(--mono); text-align: center; }
    .team-entry { display: grid; grid-template-columns: minmax(0, .72fr) minmax(0, 1.28fr); gap: 8px; }
    .away-entry { direction: rtl; }
    .away-entry > * { direction: ltr; }
    .field { width: 100%; height: 42px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); padding: 0 11px; outline: none; font-size: 13px; transition: border-color .16s ease, background .16s ease; }
    .field:hover { border-color: var(--line-bright); }
    .field:focus { border-color: var(--accent); background: var(--panel-2); box-shadow: 0 0 0 2px rgba(217,243,74,.12); }
    input.field::placeholder { color: #737b72; opacity: 1; }
    select.field { appearance: none; padding-right: 32px; background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position: calc(100% - 16px) 18px, calc(100% - 11px) 18px; background-size: 5px 5px; background-repeat: no-repeat; }
    .rate { text-align: center; }
    .rate strong { display: block; color: var(--status-color, var(--draw)); font: 20px var(--mono); }
    .rate small { color: var(--muted); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .09em; }
    .stat { text-align: center; }
    .stat strong { display: block; font: 13px var(--mono); }
    .stat small { color: var(--muted); font-size: 10px; }
    .outcome { justify-self: center; min-width: 94px; padding: 7px 8px; border: 1px solid currentColor; border-radius: 7px; color: var(--status-color, var(--draw)); font: 10px var(--mono); text-align: center; white-space: nowrap; text-transform: uppercase; letter-spacing: .05em; }
    .detail-button { width: 30px; height: 30px; border: 1px solid var(--line); border-radius: 7px; color: var(--muted); background: transparent; font: 17px var(--mono); }
    .detail-button:hover, .detail-button[aria-expanded="true"] { color: var(--text); border-color: var(--line-bright); background: var(--panel-2); }
    .matchup-detail { grid-column: 2 / -1; display: none; grid-template-columns: 1.15fr 1fr 1fr 1fr 1fr; gap: 1px; margin: -5px 0 18px; background: var(--line); border: 1px solid var(--line); }
    .matchup-detail.open { display: grid; }
    .detail-cell { min-height: 76px; padding: 14px 16px; background: var(--panel); }
    .detail-cell small { display: block; margin-bottom: 7px; color: var(--muted); font: 9px var(--mono); letter-spacing: .08em; text-transform: uppercase; }
    .detail-cell strong { font: 15px var(--mono); font-weight: 500; }
    .detail-cell.note strong { font-family: var(--sans); font-size: 12px; line-height: 1.45; }
    .insights { display: grid; grid-template-columns: 1.15fr .85fr; gap: 24px; margin-top: 28px; }
    .insight-panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: 24px; }
    .section-title { display: flex; justify-content: space-between; align-items: baseline; gap: 20px; margin-bottom: 20px; }
    .section-title h2 { margin: 0; font-size: 18px; letter-spacing: -.025em; }
    .section-title span { color: var(--muted); font: 10px var(--mono); }
    .swing-list { display: grid; gap: 1px; background: var(--line); border: 1px solid var(--line); }
    .swing-item { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 58px; padding: 0 14px; background: var(--panel); }
    .swing-item .num { color: var(--muted); font: 10px var(--mono); }
    .swing-item strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .swing-item small { color: var(--muted); font-size: 10px; }
    .swing-value { color: var(--status-color, var(--draw)); font: 14px var(--mono); }
    .method-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 18px; }
    .method-list li { padding-left: 18px; border-left: 2px solid var(--line-bright); color: var(--muted); font-size: 12px; }
    .method-list strong { display: block; margin-bottom: 4px; color: var(--text); font-size: 12px; }
    .footnote { margin: 22px 0 0; color: var(--muted); font: 10px/1.55 var(--mono); }
    .optimizer { margin: 28px 0; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
    .optimizer-head { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 22px 24px; border-bottom: 1px solid var(--line); }
    .optimizer-head h2 { margin: 0 0 4px; font-size: 18px; }
    .optimizer-head p { margin: 0; color: var(--muted); font-size: 11px; }
    .strategy-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); }
    .strategy-card { padding: 20px; background: var(--panel); }
    .strategy-card h3 { margin: 0 0 4px; font-size: 14px; }
    .strategy-card > p { min-height: 34px; margin: 0 0 16px; color: var(--muted); font-size: 10px; }
    .strategy-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 15px; }
    .strategy-metrics small { display: block; color: var(--muted); font: 8px var(--mono); text-transform: uppercase; }
    .strategy-metrics strong { font: 15px var(--mono); }
    .strategy-list { min-height: 176px; margin: 0 0 16px; padding: 0; list-style: none; border-top: 1px solid var(--line); }
    .strategy-list li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--line); font-size: 10px; }
    .strategy-list span { color: var(--muted); font-family: var(--mono); }
    .strategy-placeholder { grid-column: 1 / -1; padding: 28px; color: var(--muted); text-align: center; font-size: 12px; background: var(--panel); }
    .model-badge { display: inline-block; margin-left: 7px; padding: 2px 5px; border: 1px solid var(--line-bright); border-radius: 4px; color: var(--muted); font: 8px var(--mono); text-transform: uppercase; }
    .comparison-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 0 20px 20px; border: 1px solid var(--line); background: var(--line); }
    .comparison-strip:empty { display: none; }
    .comparison-strip div { padding: 12px; background: var(--panel-2); text-align: center; }
    .comparison-strip small { display: block; color: var(--muted); font: 8px var(--mono); text-transform: uppercase; }
    .comparison-strip strong { font: 13px var(--mono); }
    .empty { color: var(--muted); font-size: 12px; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @media (max-width: 1180px) {
      .workspace { overflow-x: auto; }
      .workspace-head, .matchup-row { min-width: 1060px; }
      .matchup-detail { min-width: 1014px; }
    }
    @media (max-width: 760px) {
      .shell { width: min(100% - 24px, 1480px); }
      .topbar { min-height: 62px; }
      .top-actions { gap: 6px; }
      .brand span { display: none; }
      .mark { width: 30px; height: 30px; }
      .button { min-height: 42px; padding: 0 10px; }
      .button-label { display: none; }
      .legend { justify-content: center; gap: 8px 14px; padding: 14px 0; font-size: 10px; }
      .analysis-bar { align-items: stretch; flex-direction: column; }
      .segmented { width: 100%; }
      .score-grid { grid-template-columns: 1fr 1fr; grid-template-areas: "home away" "verdict verdict"; min-height: 0; }
      .nation-summary { min-height: 86px; padding: 16px 14px; }
      .nation-summary:first-child { grid-area: home; }
      .nation-summary.away { grid-area: away; border-left: 1px solid var(--line); }
      .nation-name-display { font-size: 17px; }
      .record { gap: 7px; font-size: 10px; }
      .record b { font-size: 14px; }
      .verdict { grid-area: verdict; min-height: 66px; border: 0; border-top: 1px solid var(--line); flex-direction: row; gap: 14px; }
      .verdict strong { font-size: 28px; }
      .verdict span { margin-top: 0; }
      .probability-row { grid-template-columns: repeat(3, 1fr); }
      .probability { min-width: 0; padding: 13px 10px; }
      .probability small { min-height: 28px; font-size: 8px; line-height: 1.35; }
      .probability strong { font-size: 16px; }
      .workspace { margin: 16px 0 42px; overflow: visible; border-top: 0; }
      .workspace-head { display: none; }
      .matchup-row { min-width: 0; min-height: 0; margin-bottom: 12px; padding: 14px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-template-areas: "slot slot outcome outcome" "home home home home" "rate rate rate rate" "away away away away" "history games noloss sample" "toggle toggle toggle toggle" "details details details details"; gap: 10px 8px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); }
      .matchup-row:last-child { border-bottom: 1px solid var(--line); }
      .matchup-row::before { top: 14px; bottom: 14px; left: -1px; width: 3px; border-radius: 3px; }
      .slot { grid-area: slot; align-self: center; text-align: left; }
      .home-entry { grid-area: home; }
      .away-entry { grid-area: away; direction: ltr; }
      .team-entry { grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); }
      .field { height: 46px; font-size: 16px; }
      select.field { background-position: calc(100% - 16px) 20px, calc(100% - 11px) 20px; }
      .rate { grid-area: rate; padding: 3px 0 5px; border-block: 1px solid var(--line); }
      .rate strong { font-size: 24px; }
      .history-stat { grid-area: history; }
      .games-stat { grid-area: games; }
      .noloss-stat { grid-area: noloss; }
      .sample-stat { grid-area: sample; }
      .stat { min-width: 0; text-align: center; }
      .stat strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
      .stat small { display: block; font-size: 8px; }
      .outcome { grid-area: outcome; justify-self: end; max-width: 150px; }
      .detail-button { grid-area: toggle; width: 100%; height: 42px; margin-top: 2px; }
      .matchup-detail { grid-area: details; min-width: 0; grid-column: auto; grid-template-columns: 1fr 1fr; margin: 0; }
      .detail-cell { min-height: 68px; padding: 12px; }
      .detail-cell.note { grid-column: 1 / -1; }
      .insights { grid-template-columns: 1fr; }
      .insight-panel { padding: 18px; }
      .optimizer-head { align-items: stretch; flex-direction: column; padding: 18px; }
      .optimizer-head .button { width: 100%; }
      .strategy-grid { grid-template-columns: 1fr; }
      .comparison-strip { grid-template-columns: 1fr 1fr; margin: 0 12px 12px; }
      .section-title { align-items: flex-start; }
      .section-title span { max-width: 130px; text-align: right; }
      .swing-item { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 8px; padding: 0 10px; }
      .swing-value { font-size: 12px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
    }
    @media print {
      :root { color-scheme: light; --bg: #fff; --panel: #fff; --panel-2: #f5f5f2; --line: #c9ccc5; --line-bright: #92988f; --text: #171a17; --muted: #596158; --accent: #607400; --accent-ink: #fff; --win: #39732b; --edge-win: #657a31; --draw: #6b6558; --edge-loss: #956426; --loss: #a73e2d; }
      .top-actions, .detail-button { display: none; }
      .workspace { overflow: visible; }
      .workspace-head, .matchup-row { min-width: 0; }
      .insights { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <header class="shell topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <div><strong>Eightfold</strong><span>Nation matchup lab</span></div>
    </div>
    <div class="top-actions">
      <button class="button" id="swapButton" type="button" title="Swap nations">⇄ <span class="button-label">Swap sides</span></button>
      <button class="button" id="resetButton" type="button">Reset</button>
      <button class="button primary" id="printButton" type="button">Print <span class="button-label">report</span></button>
    </div>
  </header>

  <main class="shell">
    <div class="legend" aria-label="Outcome thresholds">
      <span class="c-win"><i class="dot"></i>≥60% · 2 pts</span>
      <span class="c-edge-win"><i class="dot"></i>&gt;55% · 1.5 pts</span>
      <span class="c-draw"><i class="dot"></i>45–55% · 1 pt</span>
      <span class="c-edge-loss"><i class="dot"></i>&lt;45% · 0.5 pts</span>
      <span class="c-loss"><i class="dot"></i>≤40% · 0 pts</span>
    </div>

    <div class="analysis-bar">
      <div class="analysis-copy"><strong id="modelTitle">Classic calculation</strong><span id="modelDescription">Raw historical percentages and fixed threshold bands.</span></div>
      <div class="segmented" role="group" aria-label="Calculation model">
        <button class="segment active" id="classicModel" type="button">Classic</button>
        <button class="segment" id="smartModel" type="button">Smart</button>
      </div>
    </div>

    <section class="scoreboard" aria-label="Nation result summary">
      <div class="score-grid">
        <div class="nation-summary">
          <label class="sr-only" for="homeName">First Nation name</label>
          <input class="sr-only" id="homeName" value="Slovenia" maxlength="32">
          <div class="nation-name-display" id="homeNameDisplay" title="Click to rename" tabindex="0" role="button">Slovenia</div>
        </div>
        <div class="verdict" id="verdict"></div>
        <div class="nation-summary away">
          <label class="sr-only" for="awayName">Second Nation name</label>
          <input class="sr-only" id="awayName" value="Opponent" maxlength="32">
          <div class="nation-name-display" id="awayNameDisplay" title="Click to rename" tabindex="0" role="button">Opponent</div>
        </div>
      </div>
      <div class="probability-row" id="probabilities"></div>
    </section>

    <section class="workspace" aria-label="Eight roster matchups">
      <div class="workspace-head">
        <span>#</span><span>Nation A coach / roster</span><span>Score rate</span><span>Nation B roster / coach</span><span>Historical record</span><span>Games</span><span>No-loss</span><span>Sample</span><span>Points</span><span></span>
      </div>
      <div id="matchups"></div>
    </section>

    <section class="optimizer" aria-label="Roster strategy optimizer">
      <div class="optimizer-head">
        <div><h2>Fixed-board roster strategies</h2><p>Tests distinct Slovenian rosters against the eight opponent rosters currently entered. Board order does not change.</p></div>
        <button class="button primary" id="optimizeButton" type="button">Calculate strategies</button>
      </div>
      <div class="comparison-strip" id="comparisonStrip"></div>
      <div class="strategy-grid" id="strategyGrid"><div class="strategy-placeholder">Calculate to compare best average, highest win chance, and lowest loss risk.</div></div>
    </section>

    <section class="insights">
      <article class="insight-panel">
        <div class="section-title"><h2>Pairing leverage</h2><span>Ranked by distance from 50%</span></div>
        <div class="swing-list" id="swingList"></div>
      </article>
      <article class="insight-panel">
        <div class="section-title"><h2>How to read this</h2><span>Model notes</span></div>
        <ul class="method-list">
          <li><strong>Projected nation result</strong>Each fixture awards two points: 2–0 at 60% or more, 1.5–0.5 above 55%, 1–1 from 45% through 55%, 0.5–1.5 below 45%, and 0–2 at 40% or less. The Nation with more total points wins.</li>
          <li><strong>Unique national rosters</strong>Each roster can be selected only once within a Nation. Both opposing Nations may still use the same roster.</li>
          <li><strong>Classic and Smart</strong>Classic reproduces the original raw-rate method. Smart shrinks small samples toward the dataset average, propagates uncertainty through point bands, and reports likely ranges. Switch at any time.</li>
          <li><strong>Smart prior</strong>The prior has the dataset-wide win/draw/loss proportions and the weight of six games. A matchup with six direct games therefore receives equal weight from direct evidence and the prior; larger samples receive progressively less shrinkage.</li>
          <li><strong>Fixed boards</strong>EuroBowl individual matchups are random within the paired Nations and follow fixed board order. The optimizer changes Slovenian roster choices only; it never rearranges coaches or boards.</li>
          <li><strong>Nation certainty</strong>The model combines the win, draw and loss probabilities of all eight independent fixtures using exact dynamic programming.</li>
          <li><strong>Optimizer scope</strong>Best average is a globally exact assignment. Highest win chance and lowest loss risk are broad constrained-search results because those nonlinear objectives are much larger; they are labeled searched rather than guaranteed optimal.</li>
          <li><strong>Sample strength</strong>Low is fewer than 10 historical games, medium is 10–29, and high is 30 or more. Certainty reflects results, not data quality, so inspect small samples carefully.</li>
          <li><strong>Data recovery</strong>Roster aliases are merged. If one matchup direction is missing, the reciprocal record is reversed and marked as derived. No-data pairings stay neutral.</li>
        </ul>
        <p class="footnote" id="dataNote"></p>
      </article>
    </section>
  </main>

  <script>
    "use strict";
    const DATA = ${JSON.stringify(compact)};
    const ROSTERS = ${JSON.stringify(rosters)};
    const STORAGE_KEY = "eightfold-matchup-v1";
    const DEFAULT_HOME = ["Amazons", "Bretonian", "Dark Elf", "Dwarf", "High Elf", "Human", "Lizardmen", "Wood Elf"].map(canonicalRoster);
    const DEFAULT_AWAY = ["Orc", "Shambling Undead", "Skaven", "Norse", "Chaos Dwarf", "Necromantic Horror", "Khorne", "Vampire"];
    const openDetails = new Set();

    function canonicalRoster(name) {
      return ({ Amazons: "Amazon", Bretonian: "Bretonnian", "Underwold Denizens": "Underworld Denizens", "Chaos Renegade": "Chaos Renegades" })[name] || name;
    }

    function freshState() {
      return {
        model: "classic",
        homeName: "Slovenia",
        awayName: "Opponent",
        home: DEFAULT_HOME.map((roster) => ({ coach: "", roster })),
        away: DEFAULT_AWAY.map((roster) => ({ coach: "", roster }))
      };
    }

    function loadState() {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!stored || !Array.isArray(stored.home) || !Array.isArray(stored.away) || stored.home.length !== 8 || stored.away.length !== 8) return freshState();
        const valid = (entry) => ({ coach: String(entry.coach || "").slice(0, 40), roster: ROSTERS.includes(entry.roster) ? entry.roster : ROSTERS[0] });
        const unique = (entries) => {
          const used = new Set();
          return entries.map(valid).map((entry) => {
            if (used.has(entry.roster)) entry.roster = ROSTERS.find((roster) => !used.has(roster));
            used.add(entry.roster);
            return entry;
          });
        };
        return { model: stored.model === "smart" ? "smart" : "classic", homeName: String(stored.homeName || "Slovenia").slice(0, 32), awayName: String(stored.awayName || "Opponent").slice(0, 32), home: unique(stored.home), away: unique(stored.away) };
      } catch { return freshState(); }
    }

    let state = loadState();
    const $ = (selector) => document.querySelector(selector);
    const pct = (value, digits = 1) => (value * 100).toFixed(digits) + "%";
    const points = (value) => Math.round(value * 100) / 100;
    const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
    const KAPPA = 6;
    const globalCounts = Object.values(DATA).flatMap(Object.values).reduce((sum, row) => [sum[0] + row[1], sum[1] + row[2], sum[2] + row[3]], [0, 0, 0]);
    const globalTotal = globalCounts.reduce((sum, value) => sum + value, 0);
    const PRIOR = globalCounts.map((value) => KAPPA * value / globalTotal);
    const options = (selected, side, index) => {
      const used = new Set(state[side].filter((_, slot) => slot !== index).map((entry) => entry.roster));
      return ROSTERS.map((roster) => {
        const unavailable = used.has(roster);
        return \`<option value="\${escapeHtml(roster)}"\${roster === selected ? " selected" : ""}\${unavailable ? " disabled" : ""}>\${escapeHtml(roster)}\${unavailable ? " · already selected" : ""}</option>\`;
      }).join("");
    };

    function normalCdf(value) {
      const sign = value < 0 ? -1 : 1;
      const x = Math.abs(value) / Math.sqrt(2);
      const t = 1 / (1 + .3275911 * x);
      const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x);
      return .5 * (1 + sign * erf);
    }

    function award(rate) {
      if (rate >= .6) return { verdict: "win", homePoints: 2, label: "secure win" };
      if (rate > .55) return { verdict: "edge-win", homePoints: 1.5, label: "edge" };
      if (rate >= .45) return { verdict: "draw", homePoints: 1, label: "draw" };
      if (rate > .4) return { verdict: "edge-loss", homePoints: .5, label: "at risk" };
      return { verdict: "loss", homePoints: 0, label: "secure loss" };
    }

    function matchup(home, away, model = state.model) {
      let raw = DATA[home] && DATA[home][away];
      let source = raw && raw[4] ? "derived from reciprocal record" : "direct";
      if (!raw) {
        const reciprocal = DATA[away] && DATA[away][home];
        if (reciprocal) {
          raw = [reciprocal[0], reciprocal[3], reciprocal[2], reciprocal[1]];
          source = "derived from reciprocal record";
        }
      }
      const [g, w, d, l] = raw || [0, 0, 0, 0];
      let pW, pD, pL, rate, low, high, homePoints;
      if (model === "smart") {
        const alpha = [w + PRIOR[0], d + PRIOR[1], l + PRIOR[2]];
        const total = g + KAPPA;
        [pW, pD, pL] = alpha.map((value) => value / total);
        rate = pW + .5 * pD;
        const variance = ((alpha[0] + .25 * alpha[1]) / total - rate * rate) / (total + 1);
        const sd = Math.sqrt(Math.max(variance, 0));
        low = Math.max(0, rate - 1.645 * sd);
        high = Math.min(1, rate + 1.645 * sd);
        const cdf = (threshold) => sd ? normalCdf((threshold - rate) / sd) : Number(rate <= threshold);
        const bandProb = [cdf(.4), cdf(.45) - cdf(.4), cdf(.55) - cdf(.45), cdf(.6) - cdf(.55), 1 - cdf(.6)];
        homePoints = bandProb.reduce((sum, probability, index) => sum + probability * index * .5, 0);
      } else {
        pW = g ? w / g : 0;
        pD = g ? d / g : 1;
        pL = g ? l / g : 0;
        rate = g ? pW + .5 * pD : .5;
        low = high = rate;
        homePoints = award(rate).homePoints;
      }
      const classification = award(rate);
      return { g, w, d, l, pW, pD, pL, rate, low, high, noLoss: pW + pD, verdict: classification.verdict, homePoints, awayPoints: 2 - homePoints, label: classification.label, source: raw ? source : "no data", strength: g >= 30 ? "high" : g >= 10 ? "medium" : g ? "low" : "model only" };
    }

    function nationProbability(rows) {
      let distribution = new Map([[0, 1]]);
      for (const row of rows) {
        const probabilities = [[1, row.pW], [0, row.pD], [-1, row.pL]];
        const next = new Map();
        for (const [score, chance] of distribution) {
          for (const [delta, probability] of probabilities) next.set(score + delta, (next.get(score + delta) || 0) + chance * probability);
        }
        distribution = next;
      }
      let win = 0, draw = 0, loss = 0;
      for (const [score, chance] of distribution) score > 0 ? win += chance : score < 0 ? loss += chance : draw += chance;
      return { win, draw, loss, distribution };
    }

    function exactAverageAssignment() {
      const n = 8, m = ROSTERS.length;
      const u = new Float64Array(n + 1), v = new Float64Array(m + 1);
      const p = new Int16Array(m + 1), way = new Int16Array(m + 1);
      for (let i = 1; i <= n; i++) {
        p[0] = i;
        let j0 = 0;
        const minv = new Float64Array(m + 1).fill(Infinity);
        const used = new Uint8Array(m + 1);
        do {
          used[j0] = 1;
          const i0 = p[j0];
          let delta = Infinity, j1 = 0;
          for (let j = 1; j <= m; j++) if (!used[j]) {
            const row = matchup(ROSTERS[j - 1], state.away[i0 - 1].roster, "smart");
            const cost = -(2 * row.pW + row.pD);
            const cur = cost - u[i0] - v[j];
            if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
            if (minv[j] < delta) { delta = minv[j]; j1 = j; }
          }
          for (let j = 0; j <= m; j++) used[j] ? (u[p[j]] += delta, v[j] -= delta) : (minv[j] -= delta);
          j0 = j1;
        } while (p[j0] !== 0);
        do {
          const j1 = way[j0];
          p[j0] = p[j1];
          j0 = j1;
        } while (j0 !== 0);
      }
      const assignment = Array(8);
      for (let j = 1; j <= m; j++) if (p[j]) assignment[p[j] - 1] = ROSTERS[j - 1];
      return assignment;
    }

    function searchAssignments() {
      const proxies = [
        (row) => 2 * row.pW + row.pD,
        (row) => row.pW - row.pL,
        (row) => -row.pL,
        (row) => row.homePoints
      ];
      const assignments = new Map();
      for (const proxy of proxies) {
        let beam = [{ chosen: [], used: new Set(), score: 0 }];
        for (let board = 0; board < 8; board++) {
          const next = [];
          for (const candidate of beam) for (const roster of ROSTERS) if (!candidate.used.has(roster)) {
            const row = matchup(roster, state.away[board].roster, "smart");
            next.push({ chosen: [...candidate.chosen, roster], used: new Set([...candidate.used, roster]), score: candidate.score + proxy(row) });
          }
          next.sort((a, b) => b.score - a.score);
          beam = next.slice(0, 1400);
        }
        beam.forEach((candidate) => assignments.set(candidate.chosen.join("|"), candidate.chosen));
      }
      const exact = exactAverageAssignment();
      assignments.set(exact.join("|"), exact);
      assignments.set(state.home.map((entry) => entry.roster).join("|"), state.home.map((entry) => entry.roster));
      return [...assignments.values()];
    }

    function evaluateAssignment(rosters) {
      const rows = rosters.map((roster, board) => matchup(roster, state.away[board].roster, "smart"));
      const probability = nationProbability(rows);
      let cumulative = 0, lowScore = 0, highScore = 16;
      const totals = [...probability.distribution].map(([difference, chance]) => [8 + difference, chance]).sort((a, b) => a[0] - b[0]);
      for (const [score, chance] of totals) {
        cumulative += chance;
        if (cumulative >= .1 && lowScore === 0) lowScore = score;
        if (cumulative >= .9) { highScore = score; break; }
      }
      return {
        rosters,
        rows,
        expected: rows.reduce((sum, row) => sum + 2 * row.pW + row.pD, 0),
        projected: rows.reduce((sum, row) => sum + row.homePoints, 0),
        lowScore,
        highScore,
        ...probability
      };
    }

    function calculateStrategies() {
      const button = $("#optimizeButton");
      button.disabled = true;
      button.textContent = "Calculating...";
      setTimeout(() => {
        const candidates = searchAssignments().map(evaluateAssignment);
        const currentKey = state.home.map((entry) => entry.roster).join("|");
        const exactAverage = evaluateAssignment(exactAverageAssignment());
        const bestWin = candidates.reduce((best, plan) => plan.win > best.win ? plan : best, candidates[0]);
        const safest = candidates.reduce((best, plan) => plan.loss < best.loss ? plan : best, candidates[0]);
        const current = candidates.find((plan) => plan.rosters.join("|") === currentKey) || evaluateAssignment(state.home.map((entry) => entry.roster));
        renderStrategies([
          { title: "Best average", note: "Exact assignment maximizing expected 2/1/0 coach points.", plan: exactAverage, exact: true },
          { title: "Highest win chance", note: "Best Nation-win probability found by multi-objective search.", plan: bestWin, exact: false },
          { title: "Lowest loss risk", note: "Lowest Nation-loss probability found by multi-objective search.", plan: safest, exact: false }
        ], current, candidates.length);
        button.disabled = false;
        button.textContent = "Recalculate strategies";
      }, 20);
    }

    function renderStrategies(strategies, current, searched) {
      const classicRows = state.home.map((entry, index) => matchup(entry.roster, state.away[index].roster, "classic"));
      const smartRows = state.home.map((entry, index) => matchup(entry.roster, state.away[index].roster, "smart"));
      const classicProjected = points(classicRows.reduce((sum, row) => sum + row.homePoints, 0));
      const smartProjected = points(smartRows.reduce((sum, row) => sum + row.homePoints, 0));
      const classicProbability = nationProbability(classicRows);
      const smartProbability = nationProbability(smartRows);
      $("#comparisonStrip").innerHTML = \`<div><small>Current classic projection</small><strong>\${classicProjected} / 16</strong></div><div><small>Current Smart projection</small><strong>\${smartProjected} / 16</strong></div><div><small>Classic win chance</small><strong>\${pct(classicProbability.win)}</strong></div><div><small>Smart win chance</small><strong>\${pct(smartProbability.win)}</strong></div>\`;
      $("#strategyGrid").innerHTML = strategies.map(({ title, note, plan, exact }, strategyIndex) => {
        const same = plan.rosters.every((roster, index) => roster === state.home[index].roster);
        const list = plan.rosters.map((roster, index) => \`<li><span>\${index + 1}</span><b>\${escapeHtml(roster)}</b></li>\`).join("");
        const comparison = points(plan.expected - current.expected);
        return \`<article class="strategy-card"><h3>\${title}<span class="model-badge">\${exact ? "exact" : "searched"}</span></h3><p>\${note} \${comparison === 0 ? "Matches" : (comparison > 0 ? "+" : "") + comparison + " expected points vs"} current. Likely score: \${plan.lowScore}–\${plan.highScore}.</p><div class="strategy-metrics"><div><small>Expected</small><strong>\${points(plan.expected)} / 16</strong></div><div><small>Win chance</small><strong>\${pct(plan.win)}</strong></div><div><small>Loss risk</small><strong>\${pct(plan.loss)}</strong></div></div><ul class="strategy-list">\${list}</ul><button class="button\${same ? "" : " primary"}" type="button" data-apply-strategy="\${strategyIndex}"\${same ? " disabled" : ""}>\${same ? "Current roster plan" : "Apply this plan"}</button></article>\`;
      }).join("");
      $("#strategyGrid").dataset.strategies = JSON.stringify(strategies.map(({ plan }) => plan.rosters));
      $("#strategyGrid").title = \`Risk strategies compared across \${searched} legal candidate assignments; best average is globally exact.\`;
    }

    function renderMatchups(rows) {
      $("#matchups").innerHTML = rows.map((row, index) => {
        const statusColor = \`var(--\${row.verdict})\`;
        const expanded = openDetails.has(index);
        const sourceNote = row.source === "direct" ? "Direct record from the selected Nation A roster file." : row.source === "no data" ? (state.model === "smart" ? "No direct games. Estimate uses the dataset-wide prior only." : "No supplied record in either direction. Classic mode treats it as neutral.") : "Nation A record reconstructed by reversing Nation B's supplied results.";
        const rateCaption = state.model === "smart" ? \`90% range \${pct(row.low, 0)}–\${pct(row.high, 0)}\` : "";
        return \`<div class="matchup-row" style="--status-color:\${statusColor}" data-row="\${index}">
          <span class="slot">\${String(index + 1).padStart(2, "0")}</span>
          <div class="team-entry home-entry">
            <input class="field coach" data-side="home" data-index="\${index}" value="\${escapeHtml(state.home[index].coach)}" placeholder="Coach" aria-label="Nation A coach \${index + 1}">
            <select class="field roster" data-side="home" data-index="\${index}" aria-label="Nation A roster \${index + 1}">\${options(state.home[index].roster, "home", index)}</select>
          </div>
          <div class="rate"><strong>\${state.model === "smart" || row.g ? pct(row.rate) : "N/A"}</strong>\${rateCaption ? \`<small>\${rateCaption}</small>\` : ""}</div>
          <div class="team-entry away-entry">
            <input class="field coach" data-side="away" data-index="\${index}" value="\${escapeHtml(state.away[index].coach)}" placeholder="Coach" aria-label="Nation B coach \${index + 1}">
            <select class="field roster" data-side="away" data-index="\${index}" aria-label="Nation B roster \${index + 1}">\${options(state.away[index].roster, "away", index)}</select>
          </div>
          <div class="stat history-stat"><strong>\${row.g ? \`\${row.w}–\${row.d}–\${row.l}\` : "No record"}</strong><small>W–D–L</small></div>
          <div class="stat games-stat"><strong>\${row.g || "—"}</strong><small>played</small></div>
          <div class="stat noloss-stat"><strong>\${row.g ? pct(row.noLoss) : "—"}</strong><small>W + D</small></div>
          <div class="stat sample-stat"><strong>\${row.strength}</strong><small>strength</small></div>
          <div class="outcome" title="\${row.label}">\${points(row.homePoints)}–\${points(row.awayPoints)} pts</div>
          <button class="detail-button" type="button" data-detail="\${index}" aria-expanded="\${expanded}" aria-label="Toggle details for pairing \${index + 1}">\${expanded ? "−" : "+"}</button>
          <div class="matchup-detail\${expanded ? " open" : ""}">
            <div class="detail-cell note"><small>Data source</small><strong>\${sourceNote}</strong></div>
            <div class="detail-cell"><small>Modeled win chance</small><strong>\${pct(row.pW)}</strong></div>
            <div class="detail-cell"><small>Modeled draw chance</small><strong>\${pct(row.pD)}</strong></div>
            <div class="detail-cell"><small>Modeled loss chance</small><strong>\${pct(row.pL)}</strong></div>
            <div class="detail-cell"><small>Edge from even</small><strong>\${row.g ? (row.rate >= .5 ? "+" : "") + ((row.rate - .5) * 100).toFixed(1) + " pp" : "—"}</strong></div>
            <div class="detail-cell"><small>Direct data weight</small><strong>\${state.model === "smart" ? pct(row.g / (row.g + KAPPA), 0) : "100% raw"}</strong></div>
          </div>
        </div>\`;
      }).join("");
    }

    function renderSummary(rows) {
      const homePoints = points(rows.reduce((sum, row) => sum + row.homePoints, 0));
      const awayPoints = points(rows.reduce((sum, row) => sum + row.awayPoints, 0));
      const result = homePoints > awayPoints ? "win" : homePoints < awayPoints ? "loss" : "draw";
      const probability = nationProbability(rows);
      $("#verdict").className = \`verdict c-\${result}\`;
      $("#verdict").innerHTML = \`<strong>\${homePoints}:\${awayPoints}</strong><span>Projected \${result}</span>\`;
      const probabilities = [
        [state.homeName + " nation win", probability.win, "win"],
        ["Nation draw", probability.draw, "draw"],
        [state.awayName + " nation win", probability.loss, "loss"]
      ];
      $("#probabilities").innerHTML = probabilities.map(([label, value, type]) => \`<div class="probability c-\${type}"><small>\${escapeHtml(label)}</small><strong>\${pct(value)}</strong><div class="prob-track"><i style="width:\${value * 100}%"></i></div></div>\`).join("");
    }

    function renderInsights(rows) {
      const ranked = rows.map((row, index) => ({ ...row, index, edge: Math.abs(row.rate - .5) })).sort((a, b) => b.edge - a.edge);
      $("#swingList").innerHTML = ranked.map((row, rank) => {
        const home = state.home[row.index], away = state.away[row.index];
        const labels = \`\${home.coach || home.roster} vs \${away.coach || away.roster}\`;
        const sub = \`\${home.roster} / \${away.roster} · \${row.g ? row.g + " games" : "no data"}\`;
        return \`<div class="swing-item" style="--status-color:var(--\${row.verdict})"><span class="num">\${String(rank + 1).padStart(2, "0")}</span><span><strong>\${escapeHtml(labels)}</strong><small>\${escapeHtml(sub)}</small></span><span class="swing-value">\${row.g ? (row.rate >= .5 ? "+" : "") + ((row.rate - .5) * 100).toFixed(1) + " pp" : "N/A"}</span></div>\`;
      }).join("");
      const direct = rows.filter((row) => row.source === "direct").length;
      const derived = rows.filter((row) => row.source.startsWith("derived")).length;
      const missing = rows.filter((row) => row.source === "no data").length;
      $("#dataNote").textContent = \`Current slate: \${direct} direct · \${derived} reciprocal-derived · \${missing} no-data. Dataset: 31 roster CSV exports embedded in this file.\`;
    }

    function render() {
      const smart = state.model === "smart";
      $("#classicModel").classList.toggle("active", !smart);
      $("#smartModel").classList.toggle("active", smart);
      $("#modelTitle").textContent = smart ? "Smart calculation" : "Classic calculation";
      $("#modelDescription").textContent = smart ? "Bayesian smoothing, uncertainty-aware point bands, and model-based missing matchups." : "Raw historical percentages and fixed threshold bands.";
      $("#homeName").value = state.homeName;
      $("#awayName").value = state.awayName;
      $("#homeNameDisplay").textContent = state.homeName;
      $("#awayNameDisplay").textContent = state.awayName;
      const rows = state.home.map((entry, index) => matchup(entry.roster, state.away[index].roster));
      renderSummary(rows);
      renderMatchups(rows);
      renderInsights(rows);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function clearStrategies() {
      $("#comparisonStrip").innerHTML = "";
      $("#strategyGrid").innerHTML = '<div class="strategy-placeholder">Inputs changed. Recalculate to compare updated roster strategies.</div>';
      delete $("#strategyGrid").dataset.strategies;
    }

    function editNation(side) {
      const input = $(\`#\${side}Name\`), display = $(\`#\${side}NameDisplay\`);
      display.hidden = true;
      input.classList.remove("sr-only");
      input.classList.add("field");
      input.focus();
      input.select();
    }

    function finishNationEdit(side) {
      const input = $(\`#\${side}Name\`), display = $(\`#\${side}NameDisplay\`);
      state[side + "Name"] = input.value.trim() || (side === "home" ? "Nation A" : "Nation B");
      input.classList.add("sr-only");
      input.classList.remove("field");
      display.hidden = false;
      render();
    }

    $("#matchups").addEventListener("input", (event) => {
      const target = event.target;
      if (!target.matches(".coach")) return;
      state[target.dataset.side][Number(target.dataset.index)].coach = target.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      const rows = state.home.map((entry, index) => matchup(entry.roster, state.away[index].roster));
      renderInsights(rows);
    });
    $("#matchups").addEventListener("change", (event) => {
      const target = event.target;
      if (!target.matches(".roster")) return;
      state[target.dataset.side][Number(target.dataset.index)].roster = target.value;
      clearStrategies();
      render();
    });
    $("#matchups").addEventListener("click", (event) => {
      const button = event.target.closest("[data-detail]");
      if (!button) return;
      const index = Number(button.dataset.detail);
      openDetails.has(index) ? openDetails.delete(index) : openDetails.add(index);
      render();
    });
    ["home", "away"].forEach((side) => {
      const display = $(\`#\${side}NameDisplay\`), input = $(\`#\${side}Name\`);
      display.addEventListener("click", () => editNation(side));
      display.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") editNation(side); });
      input.addEventListener("blur", () => finishNationEdit(side));
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
    });
    $("#swapButton").addEventListener("click", () => {
      [state.home, state.away] = [state.away, state.home];
      [state.homeName, state.awayName] = [state.awayName, state.homeName];
      openDetails.clear();
      clearStrategies();
      render();
    });
    $("#resetButton").addEventListener("click", () => {
      if (!confirm("Reset both nations, coaches and rosters?")) return;
      state = freshState();
      openDetails.clear();
      clearStrategies();
      render();
    });
    $("#classicModel").addEventListener("click", () => { state.model = "classic"; render(); });
    $("#smartModel").addEventListener("click", () => { state.model = "smart"; render(); });
    $("#optimizeButton").addEventListener("click", calculateStrategies);
    $("#strategyGrid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-apply-strategy]");
      if (!button) return;
      const strategies = JSON.parse($("#strategyGrid").dataset.strategies || "[]");
      const selected = strategies[Number(button.dataset.applyStrategy)];
      if (!selected) return;
      selected.forEach((roster, index) => { state.home[index].roster = roster; });
      state.model = "smart";
      clearStrategies();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    $("#printButton").addEventListener("click", () => window.print());
    render();
  </script>
</body>
</html>`;

fs.writeFileSync(new URL("./index.html", import.meta.url), html);
console.log(`Built index.html with ${rosters.length} rosters and ${Object.values(compact).reduce((sum, rows) => sum + Object.keys(rows).length, 0)} matchup records.`);

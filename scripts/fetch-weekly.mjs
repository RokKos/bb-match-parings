#!/usr/bin/env node
// Fetches every match per race from bbtv.akorus.de (EuroBowl stats, Dash app) and
// buckets the results into Monday–Sunday weeks so index.html can rebuild the
// matchup table for any week window.
//
// How the site works (from the HAR capture):
//   POST https://bbtv.akorus.de/_dash-update-component
//   output "eb-race-matches-table.children" returns a DataTable whose props.data
//   holds every game for the selected race in the date window (no paging server side):
//   { match_date, source, tournament, coach, opponent_coach, opponent_race,
//     result: "Win"|"Draw"|"Loss", td_for, td_against, cas_for, cas_against }
//   "eb-overview-winrates-store.data" returns per-race totals, used here to validate.
//
// One request per race over the whole window is equivalent to one request per week
// (every row carries its match date), but ~26x lighter on the server.
//
// Usage:
//   node scripts/fetch-weekly.mjs [--from 2026-04-18] [--to YYYY-MM-DD] [--delay 400]
//                                 [--sources naf,fumbbl-road-to-eurobowl-2026]
//   node scripts/fetch-weekly.mjs --from-cache   # re-bucket data/weekly/matches.json offline
//   node build.mjs   # re-embeds data/weekly/weekly.json into index.html

import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import crypto from "node:crypto";

const ENDPOINT = "https://bbtv.akorus.de/_dash-update-component";
const RULESET_RELEASE = "2026-04-18"; // site's "Since ruleset" preset
const EUROBOWL_START = "2026-10-16";
const RACES = ["Amazon", "Black Orc", "Bretonnian", "Chaos Chosen", "Chaos Dwarf", "Chaos Renegades", "Dark Elf", "Dwarf", "Elf Union", "Gnome", "Goblin", "Halfling", "High Elf", "Human", "Imperial Nobility", "Khorne", "Lizardmen", "Necromantic Horror", "Norse", "Nurgle", "Ogre", "Old World Alliance", "Orc", "Shambling Undead", "Skaven", "Slann", "Snotling", "Tomb Kings", "Underworld Denizens", "Vampire", "Wood Elf"];

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, index, all) => {
  if (arg.startsWith("--")) pairs.push([arg.slice(2), all[index + 1] && !all[index + 1].startsWith("--") ? all[index + 1] : true]);
  return pairs;
}, []));
const isoToday = new Date().toISOString().slice(0, 10);
const outDir = new URL("../data/weekly/", import.meta.url);
const matchesFile = new URL("matches.json", outDir);
const cached = args["from-cache"] ? JSON.parse(fs.readFileSync(matchesFile, "utf8")) : null;
const from = cached?.from || args.from || RULESET_RELEASE;
const to = cached?.to || args.to || isoToday;
const delay = Number(args.delay ?? 400);
const sources = String(args.sources || "naf,fumbbl-road-to-eurobowl-2026").split(",").map((value) => value.trim()).filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DAY = 86400000;
const toDate = (iso) => new Date(iso + "T00:00:00Z");
const toIso = (date) => date.toISOString().slice(0, 10);
const mondayOf = (iso) => {
  const date = toDate(iso);
  return new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY);
};

// bbtv.akorus.de serves its leaf certificate without the intermediate (Amazon RSA 2048 M04).
// Browsers and curl repair that through the certificate's AIA URL; Node does not. On the
// first verification failure we download the issuer named in the AIA field and trust it
// alongside the standard roots. Verification itself stays on.
let extraCa = [];

function request(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, ca: extraCa.length ? [...tls.rootCertificates, ...extraCa] : undefined }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function fetchDer(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function repairChain() {
  const { hostname } = new URL(ENDPOINT);
  const issuerUrl = await new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, rejectUnauthorized: false }, () => {
      const info = socket.getPeerCertificate().infoAccess || {};
      socket.end();
      resolve((info["CA Issuers - URI"] || [])[0]);
    });
    socket.on("error", reject);
  });
  if (!issuerUrl) throw new Error("certificate chain incomplete and no AIA issuer URL available");
  const der = await fetchDer(issuerUrl);
  const pem = new crypto.X509Certificate(der).toString();
  extraCa = [pem];
  console.log(`(TLS) server omits its intermediate certificate; trusting issuer from ${issuerUrl}`);
}

async function dash(body, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const response = await request(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "EB-team-theory weekly fetch (personal analysis)" },
        body: JSON.stringify(body)
      });
      if (response.status === 204) return null;
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(response.body.toString("utf8"));
    } catch (error) {
      if (error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" && !extraCa.length) { await repairChain(); attempt--; continue; }
      if (attempt === 4) throw new Error(`${label}: ${error.message}`);
      await sleep(1000 * attempt * attempt);
    }
  }
}

const sharedInputs = () => [
  { id: "eb-source-filter", property: "value", value: sources },
  { id: "eb-year-filter", property: "data", value: [from, to] }
];

async function fetchRaceMatches(race) {
  const json = await dash({
    output: "eb-race-matches-table.children",
    outputs: { id: "eb-race-matches-table", property: "children" },
    inputs: [
      ...sharedInputs(),
      { id: "eb-race-dropdown", property: "value", value: race },
      { id: "eb-tabs", property: "active_tab", value: "eb-tab-races" },
      { id: "eb-race-matches-opponent-filter", property: "value" }
    ],
    changedPropIds: ["eb-race-dropdown.value"]
  }, race);
  const data = json?.response?.["eb-race-matches-table"]?.children?.props?.data;
  if (!Array.isArray(data)) return [];
  return data;
}

async function fetchRaceTotals() {
  const json = await dash({
    output: "eb-overview-winrates-store.data",
    outputs: { id: "eb-overview-winrates-store", property: "data" },
    inputs: [...sharedInputs(), { id: "eb-tabs", property: "active_tab", value: "eb-tab-overview" }],
    changedPropIds: ["eb-year-filter.data"]
  }, "overview totals");
  const rows = json?.response?.["eb-overview-winrates-store"]?.data || [];
  return Object.fromEntries(rows.map((row) => [row.race, { games: row.games, w: row.wins, d: row.draws, l: row.losses }]));
}

// Week grid: Monday-based so a weekend tournament never splits across two buckets.
const firstMonday = mondayOf(from);
const lastMonday = mondayOf(to);
const weeks = [];
for (let time = firstMonday.getTime(); time <= lastMonday.getTime(); time += 7 * DAY) {
  const start = new Date(time);
  weeks.push({ start: toIso(start), end: toIso(new Date(time + 6 * DAY)) });
}
const weekIndex = (iso) => Math.floor((toDate(iso).getTime() - firstMonday.getTime()) / (7 * DAY));
const RESULT = { Win: "W", Draw: "D", Loss: "L" };
const SLOT = { W: 1, D: 2, L: 3 };

// The site files NAF games under "Chaos Renegade" and FUMBBL games under "Chaos Renegades".
// Its race dropdown only returns the FUMBBL rows for either spelling, so the NAF perspective
// of Chaos Renegades is rebuilt by reversing every other race's games against the alias.
const ALIASES = { "Chaos Renegade": "Chaos Renegades" };
const REVERSE = { W: "L", D: "D", L: "W" };

const warnings = [];
let raw, totals;
if (cached) {
  raw = cached.races;
  totals = cached.siteTotals || {};
  console.log(`Re-bucketing cached matches from ${cached.generatedAt} (${cached.from} → ${cached.to})`);
} else {
  console.log(`Window ${from} → ${to} · ${weeks.length} weeks · sources ${sources.join(", ")}`);
  totals = await fetchRaceTotals();
  raw = {};
  for (const race of RACES) {
    const rows = await fetchRaceMatches(race);
    raw[race] = rows.map((row) => [row.match_date, row.opponent_race, RESULT[row.result] || "?", row.source, row.td_for, row.td_against, row.cas_for, row.cas_against, row.tournament, row.coach, row.opponent_coach]);
    const expected = totals[race]?.games;
    const status = expected === undefined ? "no site total" : expected === rows.length ? "ok" : `site total ${expected}`;
    if (expected !== undefined && expected !== rows.length) warnings.push(`${race}: ${rows.length} rows vs site overview total ${expected}`);
    console.log(`${race.padEnd(20)} ${String(rows.length).padStart(5)} games  ${status}`);
    await sleep(delay);
  }
}

const records = Object.fromEntries(RACES.map((race) => [race, {}]));
const unknownOpponents = new Set();
let rebuilt = 0;
const add = (race, opponent, date, result) => {
  const week = weekIndex(date);
  if (week < 0 || week >= weeks.length) return;
  const cells = (records[race][opponent] ||= {});
  (cells[week] ||= [week, 0, 0, 0])[SLOT[result]]++;
};
for (const race of RACES) {
  for (const [date, rawOpponent, result] of raw[race] || []) {
    if (!SLOT[result] || !date) { warnings.push(`${race}: skipped row result=${result} date=${date}`); continue; }
    const opponent = ALIASES[rawOpponent] || rawOpponent;
    if (!RACES.includes(opponent)) { unknownOpponents.add(rawOpponent); continue; }
    add(race, opponent, date, result);
    if (ALIASES[rawOpponent] && opponent !== race) { add(opponent, race, date, REVERSE[result]); rebuilt++; }
  }
}
for (const race of RACES) {
  records[race] = Object.fromEntries(Object.entries(records[race]).sort().map(([opponent, cells]) => [opponent, Object.values(cells).sort((a, b) => a[0] - b[0])]));
}

// Every non-mirror game appears in both races' tables; check the two directions agree.
const sum = (cells) => cells.reduce((acc, [, w, d, l]) => [acc[0] + w, acc[1] + d, acc[2] + l], [0, 0, 0]);
for (const race of RACES) for (const opponent of RACES) {
  if (race >= opponent) continue;
  const a = sum(records[race][opponent] || []), b = sum(records[opponent][race] || []);
  if (a[0] !== b[2] || a[1] !== b[1] || a[2] !== b[0]) warnings.push(`asymmetry ${race} vs ${opponent}: ${a.join("-")} / reversed ${b[2]}-${b[1]}-${b[0]}`);
}
if (unknownOpponents.size) warnings.push(`unknown opponent races ignored: ${[...unknownOpponents].join(", ")}`);

fs.mkdirSync(outDir, { recursive: true });
const meta = { generatedAt: new Date().toISOString(), endpoint: ENDPOINT, sources, from, to, rulesetRelease: RULESET_RELEASE, eurobowl: EUROBOWL_START };
if (!args["from-cache"]) {
  fs.writeFileSync(matchesFile, JSON.stringify({ ...meta, siteTotals: totals, columns: ["date", "opponent_race", "result", "source", "td_for", "td_against", "cas_for", "cas_against", "tournament", "coach", "opponent_coach"], races: raw }));
}
fs.writeFileSync(new URL("weekly.json", outDir), JSON.stringify({ ...meta, weeks, races: RACES, aliases: ALIASES, siteTotals: totals, records }));

const games = Object.values(raw).reduce((total, rows) => total + rows.length, 0);
const weeklyGames = weeks.map((_, index) => RACES.reduce((total, race) => total + Object.values(records[race]).flat().filter((cell) => cell[0] === index).reduce((acc, cell) => acc + cell[1] + cell[2] + cell[3], 0), 0));
console.log(`\n${games} fetched race-perspective rows, ${rebuilt} rebuilt from aliases.`);
console.log("Games per week (race perspective):");
weeks.forEach((week, index) => console.log(`  ${week.start} – ${week.end}  ${String(weeklyGames[index]).padStart(5)}`));
console.log("Saved data/weekly/weekly.json" + (args["from-cache"] ? "" : " and data/weekly/matches.json"));
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  warnings.slice(0, 40).forEach((warning) => console.log("  - " + warning));
}

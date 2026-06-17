// tools/split-czerny.mjs — OFFLINE, DEV-ONLY data prep (not loaded by the app).
//
// Splits a combined Czerny Op. 139 MusicXML (partwise) into per-study files
// data/czerny/NNN.musicxml + index.json, which mode-czerny.js then fetches.
//
//   node tools/split-czerny.mjs <input.musicxml> [--out data/czerny] [--by attributes|map] [--map boundaries.json]
//
// Two boundary strategies:
//   --by attributes  (default) start a new study at every measure whose <attributes>
//                    contains a <time> change (a new time signature). Heuristic — works
//                    when consecutive studies differ in metre; verify the result renders
//                    and is split where you expect.
//   --by map --map boundaries.json   use an explicit array of 1-based measure indices
//                    where each study starts, e.g. [1, 17, 33, ...]. Most reliable once
//                    you've eyeballed the score.
//
// NOTE: the sample file currently in CZERNY/ is a ~160-measure music21 fragment with no
// study labels — it does NOT cleanly map to all 100 studies. Use this once you have a
// properly delimited Op. 139 source (or hand-author boundaries.json). The splitter keeps
// every <part> (e.g. both hands) and renumbers each slice's measures from 1, carrying the
// opening <attributes> (divisions/key/clef) into each study's first measure.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
if (!args.length || args[0].startsWith('--')) {
  console.error('usage: node tools/split-czerny.mjs <input.musicxml> [--out data/czerny] [--by attributes|map] [--map boundaries.json]');
  process.exit(1);
}
const input = args[0];
const opt = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };
const outDir = opt('--out', 'data/czerny');
const by = opt('--by', 'attributes');
const mapPath = opt('--map', null);

const xml = readFileSync(input, 'utf8');

// Split header / parts. Header = everything before the first <part id=...>.
const firstPart = xml.indexOf('<part ');
const header = xml.slice(0, firstPart);
const partListMatch = header.match(/<part-list>[\s\S]*?<\/part-list>/);

// Collect each <part> block and its <measure> children.
const partRe = /<part\b[^>]*>([\s\S]*?)<\/part>/g;
const parts = [];
let pm;
while ((pm = partRe.exec(xml)) !== null) {
  const open = pm[0].slice(0, pm[0].indexOf('>') + 1); // <part id="...">
  const measures = pm[1].match(/<measure\b[\s\S]*?<\/measure>/g) || [];
  parts.push({ open, measures });
}
if (!parts.length) { console.error('No <part> blocks found.'); process.exit(1); }

const measureCount = Math.max(...parts.map((p) => p.measures.length));
console.log(`parts: ${parts.length}, measures/part: ${parts.map((p) => p.measures.length).join(', ')}`);

// Determine 0-based study start indices.
let starts;
if (by === 'map') {
  if (!mapPath) { console.error('--by map requires --map boundaries.json'); process.exit(1); }
  starts = JSON.parse(readFileSync(mapPath, 'utf8')).map((n) => n - 1);
} else {
  // attributes strategy: measure 0, plus any measure (in part 0) whose <attributes> has <time>.
  starts = [0];
  const ms = parts[0].measures;
  for (let i = 1; i < ms.length; i++) {
    if (/<attributes>[\s\S]*?<time>/.test(ms[i])) starts.push(i);
  }
}
starts = [...new Set(starts)].sort((a, b) => a - b);
console.log(`studies detected: ${starts.length} (starts at measures ${starts.map((s) => s + 1).join(', ')})`);

// The opening <attributes> of part 0 measure 0 — carried into each slice's first measure
// so divisions/key/clef survive even when a boundary measure only re-states <time>.
function openingAttributes(part) {
  const m0 = part.measures[0] || '';
  const a = m0.match(/<attributes>[\s\S]*?<\/attributes>/);
  return a ? a[0] : '';
}

function renumber(measure, n) {
  return measure.replace(/<measure\b[^>]*>/, `<measure number="${n}">`);
}

// Ensure a slice's first measure has an <attributes> block (inject the opening one if absent).
function ensureAttributes(measure, openingAttrs) {
  if (/<attributes>/.test(measure)) return measure;
  return measure.replace(/(<measure\b[^>]*>)/, `$1\n      ${openingAttrs}`);
}

mkdirSync(outDir, { recursive: true });
const index = [];

for (let s = 0; s < starts.length; s++) {
  const from = starts[s];
  const to = s + 1 < starts.length ? starts[s + 1] : measureCount;
  const n = s + 1;

  let body = '';
  for (const part of parts) {
    const opening = openingAttributes(part);
    const slice = part.measures.slice(from, to);
    if (!slice.length) continue;
    const out = slice.map((mu, i) => {
      let m = renumber(mu, i + 1);
      if (i === 0) m = ensureAttributes(m, opening);
      return m;
    });
    body += `  ${part.open}\n    ${out.join('\n    ')}\n  </part>\n`;
  }

  const doc = `${header}${body}</score-partwise>\n`;
  const file = join(outDir, String(n).padStart(3, '0') + '.musicxml');
  writeFileSync(file, doc);
  index.push({ n, title: `Op. 139 No. ${n}`, measures: to - from });
}

writeFileSync(join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`wrote ${index.length} studies + index.json to ${outDir}/`);
console.log('Verify in the browser (Czerny mode) that each study renders and splits where expected.');

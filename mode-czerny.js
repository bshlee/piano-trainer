// Czerny mode — play-along verification of Czerny Op. 139 "100 Progressive Studies".
// Renders each study from MusicXML with OpenSheetMusicDisplay (OSMD, lazy-loaded
// from a CDN) and walks the score note-by-note: you must play each note/chord on
// your MIDI keyboard to advance the cursor. Tempo is ignored — note accuracy only.
// The app makes no sound; an external MIDI source (PianoTeq) does.
//
// Data: data/czerny/NNN.musicxml (1..100) + data/czerny/index.json, produced by the
// offline splitter tools/split-czerny.mjs from the user's combined Op. 139 MusicXML.
// Fetching those files needs an http(s) origin (the deployed site, or a local
// `python3 -m http.server`) — it won't work from a file:// URL.
//
// Exposes window.PT_Czerny = { start, onNoteOn, onNoteOff, handleResize }.

(function () {

const OSMD_SRC = 'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1/build/opensheetmusicdisplay.min.js';
const DATA_DIR = 'data/czerny/';
const CZERNY_KEY = 'piano-trainer:czerny:v1';

// ---- DOM ----
const numEl = document.getElementById('czerny-num');
const nameEl = document.getElementById('czerny-name');
const progressEl = document.getElementById('czerny-progress');
const studiesBtn = document.getElementById('czerny-studies');
const restartBtn = document.getElementById('czerny-restart');
const feedbackEl = document.getElementById('czerny-feedback');
const scoreEl = document.getElementById('czerny-score');
const pickerEl = document.getElementById('czerny-picker');
const gridEl = document.getElementById('czerny-grid');
const handsRadios = document.querySelectorAll('input[name="czerny-hands"]');

// ---- state ----
let osmd = null;            // OSMD instance
let osmdLoading = null;     // Promise while the CDN script loads
let index = null;          // [{n, title, ...}]
let indexIsReal = false;   // true when data/czerny/index.json actually loaded
let events = [];           // [{notes:[{midi,staff}]}] one per cursor position
let evIndex = 0;           // current cursor/event position
let accumulator = new Set(); // expected notes pressed so far for the current event
let locked = false;        // true after finishing a study
let started = false;       // has the user picked a study this session
let pickerBuilt = false;

const PT = () => window.PT_Settings;

function loadProgress() {
  try { return JSON.parse(localStorage.getItem(CZERNY_KEY) || '{}'); } catch (e) { return {}; }
}
function saveProgress(p) { localStorage.setItem(CZERNY_KEY, JSON.stringify(p)); }
function markComplete(n) {
  const p = loadProgress();
  p.completed = p.completed || {};
  p.completed[n] = true;
  saveProgress(p);
}

function setFeedback(text, cls) {
  if (!feedbackEl) return;
  feedbackEl.textContent = text || '';
  feedbackEl.className = 'czerny-feedback' + (cls ? ' ' + cls : '');
}

function pad3(n) { return String(n).padStart(3, '0'); }

// ---- OSMD lazy-load ----
function loadOSMDLib() {
  if (window.opensheetmusicdisplay) return Promise.resolve();
  if (osmdLoading) return osmdLoading;
  osmdLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = OSMD_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load OSMD'));
    document.head.appendChild(s);
  });
  return osmdLoading;
}

// ---- study index ----
async function ensureIndex() {
  if (index) return index;
  try {
    const res = await fetch(DATA_DIR + 'index.json');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length) { index = data; indexIsReal = true; return index; }
    }
  } catch (e) { /* fall through to default */ }
  // Default 1..100 with generic titles (used before the data is added).
  index = Array.from({ length: 100 }, (_, i) => ({ n: i + 1, title: 'Study ' + (i + 1) }));
  return index;
}

function studyMeta(n) {
  const m = index && index.find((x) => x.n === n);
  return m || { n, title: 'Study ' + n };
}

// ---- picker ----
function buildPicker() {
  if (!gridEl) return;
  ensureIndex().then(() => {
    const progress = loadProgress();
    const completed = progress.completed || {};
    const cur = PT().get().czernyStudy;
    const nums = indexIsReal ? index.map((x) => x.n) : Array.from({ length: 100 }, (_, i) => i + 1);
    gridEl.innerHTML = '';
    for (const n of nums) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(n);
      const m = studyMeta(n);
      btn.title = m.title || ('Study ' + n);
      if (completed[n]) btn.classList.add('done');
      if (n === cur) btn.classList.add('current');
      btn.addEventListener('click', () => {
        pickerEl.hidden = true;
        loadStudy(n);
      });
      gridEl.appendChild(btn);
    }
    pickerBuilt = true;
  });
}

function refreshPickerCurrent() {
  if (!gridEl) return;
  const cur = PT().get().czernyStudy;
  const progress = loadProgress();
  const completed = progress.completed || {};
  Array.from(gridEl.children).forEach((btn) => {
    const n = parseInt(btn.textContent, 10);
    btn.classList.toggle('current', n === cur);
    btn.classList.toggle('done', !!completed[n]);
  });
}

// ---- matching helpers ----
function handMatch(staff) {
  const hands = PT().get().czernyHands;
  if (hands === 'right') return staff === 0; // top staff
  if (hands === 'left') return staff === 1;  // bottom staff
  return true; // both
}

// Expected MIDI set for an event under the current hands setting (empty = rest/skip).
function expectedSet(ev) {
  const set = new Set();
  for (const note of ev.notes) {
    if (handMatch(note.staff)) set.add(note.midi);
  }
  return set;
}

// ---- score walking ----
function buildEvents() {
  events = [];
  if (!osmd || !osmd.cursor) return;
  try {
    osmd.cursor.reset();
    const it = osmd.cursor.Iterator;
    let guard = 0;
    while (it && !it.EndReached && guard < 200000) {
      guard++;
      const ves = it.CurrentVoiceEntries || [];
      const notes = [];
      for (const ve of ves) {
        // 0-based staff index within the sheet: 0 = top (right hand), 1 = bottom (left hand).
        // idInMusicSheet separates parts/staves even when each part numbers its own staff "1".
        let staff = 0;
        try {
          const st = ve.ParentSourceStaffEntry.ParentStaff;
          if (typeof st.idInMusicSheet === 'number') staff = st.idInMusicSheet;
          else if (typeof st.Id === 'number') staff = st.Id - 1;
        } catch (e) { /* keep default */ }
        const veNotes = ve.Notes || [];
        for (const n of veNotes) {
          if (n.isRest && n.isRest()) continue;
          if (typeof n.halfTone !== 'number') continue;
          notes.push({ midi: n.halfTone + 12, staff });
        }
      }
      events.push({ notes });
      it.moveToNext();
    }
  } catch (e) {
    events = [];
  }
  osmd.cursor.reset();
}

function totalPlayable() {
  let t = 0;
  for (const ev of events) if (expectedSet(ev).size > 0) t++;
  return t;
}
function donePlayable() {
  let d = 0;
  for (let i = 0; i < evIndex && i < events.length; i++) if (expectedSet(events[i]).size > 0) d++;
  return d;
}

function updateProgress() {
  if (!progressEl) return;
  progressEl.textContent = donePlayable() + ' / ' + totalPlayable();
}

// Advance the visible cursor + event index by one position.
function stepCursor() {
  evIndex += 1;
  try { osmd.cursor.next(); } catch (e) { /* may be at end */ }
}

// Skip past leading/rest positions that have nothing to play for this hand.
function skipRests() {
  let guard = 0;
  while (evIndex < events.length && expectedSet(events[evIndex]).size === 0 && guard < 200000) {
    guard++;
    stepCursor();
  }
}

function atStart() {
  evIndex = 0;
  accumulator = new Set();
  try { osmd.cursor.reset(); osmd.cursor.show(); } catch (e) {}
  skipRests();
  try { osmd.cursor.update(); } catch (e) {}
}

function finishStudy() {
  locked = true;
  const n = PT().get().czernyStudy;
  markComplete(n);
  refreshPickerCurrent();
  setFeedback('✓ Study ' + n + ' complete — well played!', 'done');
  updateProgress();
}

function onNoteOn(note) {
  if (locked || !started || !events.length) return;
  if (evIndex >= events.length) return;
  const expected = expectedSet(events[evIndex]);
  if (expected.size === 0) { skipRests(); return; }

  if (expected.has(note)) {
    accumulator.add(note);
    // Event complete when every expected note has been pressed.
    let complete = true;
    for (const m of expected) { if (!accumulator.has(m)) { complete = false; break; } }
    if (complete) {
      accumulator = new Set();
      stepCursor();
      skipRests();
      updateProgress();
      if (evIndex >= events.length) { finishStudy(); return; }
      setFeedback('', null);
    }
  } else {
    // Wrong note — block until the right note(s) are played (note accuracy first).
    setFeedback('✗ ' + window.PT_Pitch.describeMidi(note) + ' — expected ' + expectedNames(expected), 'wrong');
  }
}

function onNoteOff() { /* matching is onset-based; nothing to do */ }

function expectedNames(set) {
  return Array.from(set).sort((a, b) => a - b)
    .map((m) => window.PT_Pitch.describeMidi(m).split(' ')[0]).join(' + ');
}

// ---- load + render a study ----
async function loadStudy(n) {
  const s = PT().get();
  s.czernyStudy = n;
  PT().save();
  started = true;
  locked = false;
  evIndex = 0;
  accumulator = new Set();

  const meta = studyMeta(n);
  if (numEl) numEl.textContent = String(n);
  if (nameEl) nameEl.textContent = meta.title || ('Study ' + n);
  refreshPickerCurrent();

  if (location.protocol === 'file:') {
    setFeedback('Czerny needs to be served over http — run “python3 -m http.server”, or open the deployed site.', 'wrong');
    return;
  }

  setFeedback('Loading…', null);
  let xml;
  try {
    const res = await fetch(DATA_DIR + pad3(n) + '.musicxml');
    if (!res.ok) throw new Error('not found');
    xml = await res.text();
  } catch (e) {
    setFeedback('Study ' + n + ' data not found. Add data/czerny/' + pad3(n) + '.musicxml (see README).', 'wrong');
    if (scoreEl) scoreEl.innerHTML = '';
    return;
  }

  try {
    await loadOSMDLib();
    if (!osmd) {
      osmd = new window.opensheetmusicdisplay.OpenSheetMusicDisplay(scoreEl, {
        autoResize: true,
        backend: 'svg',
        drawingParameters: 'compact',
        followCursor: true,
      });
    }
    await osmd.load(xml);
    osmd.render();
    buildEvents();
    if (!events.length) {
      setFeedback('Could not read notes from this study.', 'wrong');
      return;
    }
    atStart();
    updateProgress();
    setFeedback('Play from the start — the cursor advances when you hit the right note.', null);
  } catch (e) {
    setFeedback('Could not render study ' + n + '. ' + (e && e.message ? e.message : ''), 'wrong');
  }
}

// ---- controls ----
if (studiesBtn) {
  studiesBtn.addEventListener('click', () => {
    if (!pickerBuilt) buildPicker();
    pickerEl.hidden = !pickerEl.hidden;
  });
}
if (restartBtn) {
  restartBtn.addEventListener('click', () => {
    if (!started) return;
    locked = false;
    atStart();
    updateProgress();
    setFeedback('Restarted — play from the top.', null);
  });
}
handsRadios.forEach((r) => {
  r.addEventListener('change', () => {
    if (!r.checked) return;
    const s = PT().get();
    s.czernyHands = ['both', 'right', 'left'].includes(r.value) ? r.value : 'both';
    PT().save();
    if (started && events.length) { locked = false; atStart(); updateProgress(); }
  });
});

function start() {
  const s = PT().get();
  handsRadios.forEach((r) => { r.checked = (r.value === s.czernyHands); });
  if (!pickerBuilt) buildPicker();
  // Auto-load the last study so the user lands on something playable.
  if (!started) loadStudy(s.czernyStudy || 1);
  else if (osmd) { try { osmd.render(); osmd.cursor.show(); } catch (e) {} }
}

function handleResize() {
  // OSMD autoResize handles width; keep the cursor visible after a reflow.
  if (osmd) { try { osmd.cursor.show(); osmd.cursor.update(); } catch (e) {} }
}

window.PT_Czerny = { start, onNoteOn, onNoteOff, handleResize };

})();

// Harmony mode — read a chord on the grand staff and play it on a MIDI keyboard.
// Walks common progressions (I–IV–V–I, ii–V–I, …) around the circle of fifths so
// the user learns how chords function within a key. LH plays the root (bass), RH
// plays the triad. Matching is octave-exact (the held MIDI set must equal the
// target set). The app makes no sound — an external MIDI source (PianoTeq) does.
//
// Exposes window.PT_Harmony = { start, onMidi, handleResize }.

(function () {

// ---- music theory ----

// Major keys in circle-of-fifths order. Strings double as VexFlow key-signature specs.
const CIRCLE = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11]; // semitones of each scale degree from tonic
const KEY_PC = { C: 0, G: 7, D: 2, A: 9, E: 4, B: 11, Gb: 6, Db: 1, Ab: 8, Eb: 3, Bb: 10, F: 5 };

// Diatonic triad qualities + Roman numerals for a major key.
const QUALITIES = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const QUALITY_NAME = { maj: 'major', min: 'minor', dim: 'dim' };

// Diatonic seventh chords (triad + the degree-7 note) for a major key.
const SEVENTH_QUALITY = ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'halfdim7'];
const SEVENTH_ROMAN = ['Imaj7', 'ii7', 'iii7', 'IVmaj7', 'V7', 'vi7', 'viiø7'];
const SEVENTH_NAME = { maj7: 'major 7', min7: 'minor 7', dom7: 'dominant 7', halfdim7: 'half-dim 7' };

// Progressions as 0-based scale-degree sequences.
const PROGRESSIONS = {
  'I-IV-V-I': [0, 3, 4, 0],
  'ii-V-I': [1, 4, 0],
  'I-V-vi-IV': [0, 4, 5, 3],
  'I-vi-IV-V': [0, 5, 3, 4],
};
const PROGRESSION_LIST = Object.keys(PROGRESSIONS);

const RH_OCT = 4; // right-hand triad root octave
const LH_OCT = 3; // left-hand bass-note octave

// Build the major scale of `key` as 7 notes { step, alter } (alter ∈ {-1,0,1}).
function majorScale(key) {
  const tonicLetterIdx = LETTERS.indexOf(key[0]);
  const tonicPc = KEY_PC[key];
  const out = [];
  for (let i = 0; i < 7; i++) {
    const letter = LETTERS[(tonicLetterIdx + i) % 7];
    const targetPc = (tonicPc + MAJOR_STEPS[i]) % 12;
    let alter = targetPc - LETTER_PC[letter];
    if (alter > 6) alter -= 12; else if (alter < -6) alter += 12;
    out.push({ step: letter, alter });
  }
  return out;
}

// Assign ascending octaves to a close-position chord (each note's letter ≥ previous;
// when it wraps past B→C the octave bumps). First note takes `startOctave`.
function assignOctaves(notes, startOctave) {
  const out = [];
  let oct = startOctave;
  let prevIdx = -1;
  for (const n of notes) {
    const li = LETTERS.indexOf(n.step);
    if (prevIdx >= 0 && li <= prevIdx) oct += 1;
    out.push({ step: n.step, alter: n.alter, octave: oct });
    prevIdx = li;
  }
  return out;
}

const ACC = (alter) => (alter === 1 ? '♯' : alter === -1 ? '♭' : alter === 2 ? '𝄪' : alter === -2 ? '𝄫' : '');

// ---- DOM ----
const staffEl = document.getElementById('harmony-staff');
const wrapEl = staffEl ? staffEl.parentElement : null; // .grand-staff-wrap
const nameEl = document.getElementById('harmony-name');
const romanEl = document.getElementById('harmony-roman');
const keynameEl = document.getElementById('harmony-keyname');
const stepEl = document.getElementById('harmony-step');
const totalEl = document.getElementById('harmony-total');
const feedbackEl = document.getElementById('harmony-feedback');
const revealBtn = document.getElementById('harmony-reveal');
const skipBtn = document.getElementById('harmony-skip');
const newBtn = document.getElementById('harmony-new');
const progressionSel = document.getElementById('harmony-progression');
const keymodeSel = document.getElementById('harmony-keymode');
const keysWrap = document.getElementById('harmony-keys');
const keyRow = document.getElementById('harmony-key-row');
const chordsSel = document.getElementById('harmony-chords');
const perRoundEl = document.getElementById('harmony-per-round');
const perRoundValEl = document.getElementById('harmony-per-round-val');
const keyChecks = keysWrap ? Array.from(keysWrap.querySelectorAll('input[type="checkbox"]')) : [];

// ---- state ----
// A "round" shows up to `perRound` consecutive chords of the progression on the
// grand staff at once (like Read Note's multi-note strip). `windowStart` is the
// progression index of the leftmost visible chord; `windowChords` holds the built
// chord objects for the window; `activeInWindow` is the one being played (caret).
let key = 'C';
let scale = majorScale('C');
let progression = PROGRESSIONS['I-IV-V-I'];
let windowStart = 0;
let windowChords = [];  // [{ spec, targetMidis:Set, name, roman, notesDisplay }]
let activeInWindow = 0;
let current = null;     // == windowChords[activeInWindow]; the chord being judged
let locked = false;
let revealed = false;

const PT = () => window.PT_Settings;
const MFO = (step, oct, alter) => window.PT_Pitch.midiFromStepOctave(step, oct, alter);

function rootDisplay(root) {
  return root.step + ACC(root.alter);
}

// Build the chord for scale `degree`: RH triad (+ 7th if `seventh`) + LH root,
// with target MIDIs.
function buildChord(degree, seventh) {
  const idxs = seventh
    ? [degree, (degree + 2) % 7, (degree + 4) % 7, (degree + 6) % 7]
    : [degree, (degree + 2) % 7, (degree + 4) % 7];
  const chordTones = idxs.map((i) => scale[i]);
  const rh = assignOctaves(chordTones, RH_OCT);
  const root = chordTones[0];
  const lh = [{ step: root.step, alter: root.alter, octave: LH_OCT }];

  const targetMidis = new Set();
  rh.forEach((n) => targetMidis.add(MFO(n.step, n.octave, n.alter)));
  lh.forEach((n) => targetMidis.add(MFO(n.step, n.octave, n.alter)));

  const all = lh.concat(rh);
  const notesDisplay = all.map((n) => `${n.step}${ACC(n.alter)}${n.octave}`).join(' · ');

  return {
    spec: {
      keySpec: key,
      treble: rh.map((n) => ({ step: n.step, octave: n.octave })),
      bass: lh.map((n) => ({ step: n.step, octave: n.octave })),
    },
    targetMidis,
    name: seventh
      ? rootDisplay(root) + ' ' + SEVENTH_NAME[SEVENTH_QUALITY[degree]]
      : rootDisplay(root) + ' ' + QUALITY_NAME[QUALITIES[degree]],
    roman: seventh ? SEVENTH_ROMAN[degree] : ROMAN[degree],
    notesDisplay,
  };
}

function setFeedback(text, cls) {
  if (!feedbackEl) return;
  feedbackEl.textContent = text || '';
  feedbackEl.className = 'harmony-feedback' + (cls ? ' ' + cls : '');
}

// The resting prompt: note names when "Show notes" is on, else a play hint that
// names whether one or several chords are on the staff.
function idleFeedback() {
  if (revealed && current) setFeedback('Notes: ' + current.notesDisplay, null);
  else setFeedback(windowChords.length > 1 ? 'Play the highlighted chord.' : 'Play the chord shown.', null);
}

function render(marks) {
  if (!windowChords.length || !staffEl) return;
  window.renderHarmony(staffEl, {
    keySpec: key,
    chords: windowChords.map((c) => c.spec),
    activeIndex: activeInWindow,
    marks: marks || null, // applies to the active chord
  });
}

// How many chords to show at once (1–4), clamped to what's left in the progression.
function perRound() {
  const n = PT().get().harmonyPerRound;
  return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1;
}

// Build the window of chord objects starting at `windowStart`, deciding triad vs
// seventh per chord (per the Chords setting).
function buildWindow() {
  const chordsMode = PT().get().harmonyChords;
  const n = Math.min(perRound(), progression.length - windowStart);
  windowChords = [];
  for (let i = 0; i < n; i++) {
    const seventh = chordsMode === 'sevenths' || (chordsMode === 'mixed' && Math.random() < 0.5);
    windowChords.push(buildChord(progression[windowStart + i], seventh));
  }
}

// Refresh the header + feedback to reflect the active chord.
function refreshHeader() {
  current = windowChords[activeInWindow] || null;
  if (!current) return;
  if (nameEl) nameEl.textContent = current.name;
  if (romanEl) romanEl.textContent = current.roman;
  if (keynameEl) keynameEl.textContent = key;
  if (stepEl) stepEl.textContent = String(windowStart + activeInWindow + 1);
  if (totalEl) totalEl.textContent = String(progression.length);
}

// Show the current window from scratch (caret on the first chord).
function showRound() {
  buildWindow();
  activeInWindow = 0;
  if (wrapEl) wrapEl.classList.remove('correct', 'wrong');
  refreshHeader();
  render(null);
  idleFeedback();
}

function pickProgression(setting) {
  if (setting && PROGRESSIONS[setting]) return PROGRESSIONS[setting];
  const k = PROGRESSION_LIST[Math.floor(Math.random() * PROGRESSION_LIST.length)];
  return PROGRESSIONS[k];
}

// Roll a fresh progression. `advanceKey` moves around the circle on completion.
function rollProgression(advanceKey) {
  const s = PT().get();
  if (s.harmonyKeyMode === 'random') {
    s.harmonyKeyIndex = Math.floor(Math.random() * CIRCLE.length);
    PT().save();
  } else if (s.harmonyKeyMode === 'circle' && advanceKey) {
    s.harmonyKeyIndex = (s.harmonyKeyIndex + 1) % CIRCLE.length;
    PT().save();
  } else if (s.harmonyKeyMode === 'fixed') {
    // Drill only the checked keys. One checked → stays put; many → pick a random
    // one each progression (avoiding an immediate repeat when possible).
    const picks = (s.harmonyKeys && s.harmonyKeys.length) ? s.harmonyKeys : [0];
    let next = picks[Math.floor(Math.random() * picks.length)];
    if (picks.length > 1 && next === s.harmonyKeyIndex) {
      next = picks[(picks.indexOf(next) + 1) % picks.length];
    }
    s.harmonyKeyIndex = next;
    PT().save();
  }
  key = CIRCLE[((s.harmonyKeyIndex % CIRCLE.length) + CIRCLE.length) % CIRCLE.length];
  scale = majorScale(key);
  progression = pickProgression(s.harmonyProgression);
  windowStart = 0;
  locked = false;
  showRound();
}

// Advance the caret to the next chord. When the visible window is exhausted, slide
// to the next window; when the whole progression is done, roll a fresh one.
function advanceChord() {
  if (wrapEl) wrapEl.classList.remove('correct', 'wrong');
  if (activeInWindow + 1 < windowChords.length) {
    activeInWindow += 1;
    locked = false;
    refreshHeader();
    render(null);
    idleFeedback();
    return;
  }
  // window finished → advance to the next chunk of the progression
  windowStart += windowChords.length;
  if (windowStart >= progression.length) {
    rollProgression(true); // progression complete → next key (circle mode)
  } else {
    locked = false;
    showRound();
  }
}

function onCorrect() {
  locked = true;
  if (wrapEl) wrapEl.classList.add('correct');
  render('correct');
  setFeedback('✓ ' + current.name + ' (' + current.roman + ')', 'correct');
  setTimeout(advanceChord, 650);
}

let wrongTimer = null;
function flashWrong(note) {
  setFeedback('✗ ' + window.PT_Pitch.describeMidi(note) + ' is not in ' + current.name, 'wrong');
  if (wrapEl) wrapEl.classList.add('wrong');
  clearTimeout(wrongTimer);
  wrongTimer = setTimeout(() => {
    if (locked) return;
    if (wrapEl) wrapEl.classList.remove('wrong');
    idleFeedback();
  }, 1100);
}

// Called on every note-on AND note-off (so releasing an extra note re-checks).
function onMidi(note, heldNotes, isOn) {
  if (locked || !current) return;
  const target = current.targetMidis;
  let allHeld = true;
  for (const t of target) { if (!heldNotes.has(t)) { allHeld = false; break; } }
  let extra = false;
  for (const n of heldNotes) { if (!target.has(n)) { extra = true; break; } }

  if (allHeld && !extra) { onCorrect(); return; }
  if (isOn && !target.has(note)) flashWrong(note);
}

// ---- controls ----
if (revealBtn) {
  revealBtn.addEventListener('click', () => {
    revealed = !revealed;
    revealBtn.textContent = revealed ? 'Hide notes' : 'Show notes';
    if (!locked && current) idleFeedback();
  });
}
if (skipBtn) {
  skipBtn.addEventListener('click', () => { if (!locked) advanceChord(); });
}
if (newBtn) {
  newBtn.addEventListener('click', () => rollProgression(false));
}
if (progressionSel) {
  progressionSel.addEventListener('change', () => {
    const s = PT().get();
    s.harmonyProgression = progressionSel.value;
    PT().save();
    rollProgression(false);
  });
}
function updateKeyRowVisibility() {
  if (keyRow) keyRow.style.display = (PT().get().harmonyKeyMode === 'fixed') ? '' : 'none';
}
if (keymodeSel) {
  keymodeSel.addEventListener('change', () => {
    const s = PT().get();
    s.harmonyKeyMode = ['random', 'fixed'].includes(keymodeSel.value) ? keymodeSel.value : 'circle';
    PT().save();
    updateKeyRowVisibility();
    rollProgression(false); // re-roll so a switch to fixed/circle takes effect now
  });
}
function syncKeyChecks() {
  const set = new Set(PT().get().harmonyKeys || []);
  keyChecks.forEach((cb) => { cb.checked = set.has(parseInt(cb.value, 10)); });
}
keyChecks.forEach((cb) => {
  cb.addEventListener('change', () => {
    const picked = keyChecks.filter((c) => c.checked).map((c) => parseInt(c.value, 10));
    if (picked.length === 0) { cb.checked = true; return; } // keep at least one key
    const s = PT().get();
    s.harmonyKeys = picked;
    PT().save();
    rollProgression(false);
  });
});
if (chordsSel) {
  chordsSel.addEventListener('change', () => {
    const s = PT().get();
    s.harmonyChords = ['triads', 'sevenths', 'mixed'].includes(chordsSel.value) ? chordsSel.value : 'triads';
    PT().save();
    rollProgression(false);
  });
}
if (perRoundEl) {
  perRoundEl.addEventListener('input', () => {
    const n = Math.max(1, Math.min(4, parseInt(perRoundEl.value, 10) || 1));
    const s = PT().get();
    s.harmonyPerRound = n;
    PT().save();
    if (perRoundValEl) perRoundValEl.textContent = String(n);
    rollProgression(false); // re-roll so the new window size takes effect now
  });
}

function start() {
  const s = PT().get();
  if (progressionSel) progressionSel.value = s.harmonyProgression;
  if (keymodeSel) keymodeSel.value = s.harmonyKeyMode;
  if (chordsSel) chordsSel.value = s.harmonyChords;
  if (perRoundEl) perRoundEl.value = String(s.harmonyPerRound);
  if (perRoundValEl) perRoundValEl.textContent = String(s.harmonyPerRound);
  syncKeyChecks();
  updateKeyRowVisibility();
  revealed = false;
  if (revealBtn) revealBtn.textContent = 'Show notes';
  rollProgression(false); // resume current key (or randomize in random mode)
}

function handleResize() {
  if (current) render(locked && wrapEl && wrapEl.classList.contains('correct') ? 'correct' : null);
}

window.PT_Harmony = { start, onMidi, handleResize };

})();

// Sheet Music Trainer — game logic, answer matching, persistence.

(function () {
const { renderNote } = window;

// ---------- constants ----------

const STEP_TO_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const PC_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const KO_TO_LETTER = {
  '도':'C','레':'D','미':'E','파':'F','솔':'G','라':'A','시':'B',
  // accept common variants
  '쏠':'G','띠':'B',
};
const LETTER_TO_KO = { C:'도', D:'레', E:'미', F:'파', G:'솔', A:'라', B:'시' };

// Diatonic notes per clef. Octaves chosen to cover staff lines/spaces with one ledger line above/below.
// Treble staff lines/spaces: E4 F4 G4 A4 B4 C5 D5 E5 F5 — extend with ledgers.
// Bass staff: G2 A2 B2 C3 D3 E3 F3 G3 A3 — extend with ledgers.
const RANGES = {
  treble: { minOct: 4, maxOct: 5, // we'll allow C4..C6 inclusive
            lowest: { step:'C', octave:4 }, highest: { step:'C', octave:6 } },
  bass:   { lowest: { step:'C', octave:2 }, highest: { step:'C', octave:4 } },
};

// ---------- pitch utilities ----------

function pitchClass(step, alter) {
  return ((STEP_TO_PC[step] + (alter || 0)) % 12 + 12) % 12;
}

function buildDiatonicList(clef) {
  const r = RANGES[clef];
  const steps = ['C','D','E','F','G','A','B'];
  const list = [];
  let oct = r.lowest.octave;
  let i = steps.indexOf(r.lowest.step);
  while (true) {
    const step = steps[i];
    list.push({ step, octave: oct });
    if (step === r.highest.step && oct === r.highest.octave) break;
    i++;
    if (i === 7) { i = 0; oct++; }
    if (oct > r.highest.octave + 1) break; // safety
  }
  return list;
}

const DIATONIC = {
  treble: buildDiatonicList('treble'),
  bass: buildDiatonicList('bass'),
};

function randomPitch(clefMode, accidentalRate) {
  const clef = clefMode === 'both'
    ? (Math.random() < 0.5 ? 'treble' : 'bass')
    : clefMode;

  const base = DIATONIC[clef][Math.floor(Math.random() * DIATONIC[clef].length)];

  let alter = 0;
  if (Math.random() < accidentalRate) {
    // pick sharp or flat, but avoid silly enharmonics on naturals adjacent to half-steps?
    // For simplicity allow any natural-with-accidental (E# / B# / Fb / Cb are valid notation).
    alter = Math.random() < 0.5 ? 1 : -1;
  }

  return { step: base.step, octave: base.octave, alter, clef };
}

// ---------- typed-answer parsing ----------

// Strip whitespace; map first Korean syllable to letter; pull out trailing accidental.
// Returns a pitch class (0..11) or null.
function parseAnswer(raw) {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  // Pull a leading Korean syllable if present.
  let letter = null;
  const first = s[0];
  if (KO_TO_LETTER[first]) {
    letter = KO_TO_LETTER[first];
    s = s.slice(1);
  } else {
    const ch = first.toUpperCase();
    if (ch >= 'A' && ch <= 'G') {
      letter = ch;
      s = s.slice(1);
    } else {
      return null;
    }
  }

  // Accidental: #, ♯, b, ♭ (also accept "샵"/"플랫" loosely)
  let alter = 0;
  const rest = s.trim().toLowerCase();
  if (rest === '#' || rest === '♯' || rest === '샵' || rest === 'sharp') alter = 1;
  else if (rest === 'b' || rest === '♭' || rest === '플랫' || rest === 'flat') alter = -1;
  else if (rest === '') alter = 0;
  else return null;

  return pitchClass(letter, alter);
}

// ---------- DOM refs ----------

const staffEl = document.getElementById('staff');
const staffWrap = document.getElementById('staff-wrap');
const feedbackEl = document.getElementById('feedback');
const answerInput = document.getElementById('answer');
const submitBtn = document.getElementById('submit');
const whiteRow = document.getElementById('white-row');
const blackRow = document.getElementById('black-row');
const scoreEl = document.getElementById('score');
const totalEl = document.getElementById('total');
const streakEl = document.getElementById('streak');
const bestEl = document.getElementById('best');
const resetBtn = document.getElementById('reset');
const clefToggle = document.getElementById('clef-toggle');
const accSlider = document.getElementById('accidental-rate');
const showLabelsCheckbox = document.getElementById('show-labels');
const pianoEl = document.getElementById('piano');
const accSliderVal = document.getElementById('accidental-rate-val');
const distPanel = document.getElementById('distribution-panel');
const distSummary = document.getElementById('dist-summary');
const distChart = document.getElementById('dist-chart');
const distResetBtn = document.getElementById('dist-reset');

// ---------- piano keyboard ----------

// midi values anchor the keyboard at C4 (middle C); the closing C is C5.
const WHITE_KEYS = [
  { letter: 'C', pc: 0,  midi: 60 },
  { letter: 'D', pc: 2,  midi: 62 },
  { letter: 'E', pc: 4,  midi: 64 },
  { letter: 'F', pc: 5,  midi: 65 },
  { letter: 'G', pc: 7,  midi: 67 },
  { letter: 'A', pc: 9,  midi: 69 },
  { letter: 'B', pc: 11, midi: 71 },
  { letter: 'C', pc: 0,  midi: 72 }, // closing C for visual octave
];

// Black-key positions: left offset as % of total piano width.
// Width is 9% (matches CSS). Center is on the boundary between two white keys
// (each white key = 12.5% of width with 8 keys).
const BLACK_KEYS = [
  { letter: 'C#', pc: 1,  midi: 61, leftPct: 12.5 - 4.5 }, // between C and D
  { letter: 'D#', pc: 3,  midi: 63, leftPct: 25.0 - 4.5 }, // between D and E
  { letter: 'F#', pc: 6,  midi: 66, leftPct: 50.0 - 4.5 }, // between F and G
  { letter: 'G#', pc: 8,  midi: 68, leftPct: 62.5 - 4.5 }, // between G and A
  { letter: 'A#', pc: 10, midi: 70, leftPct: 75.0 - 4.5 }, // between A and B
];

function buildPiano() {
  whiteRow.innerHTML = '';
  blackRow.innerHTML = '';

  for (const k of WHITE_KEYS) {
    const btn = document.createElement('button');
    btn.className = 'white';
    btn.dataset.pc = k.pc;
    btn.setAttribute('aria-label', k.letter);
    btn.innerHTML = `<span class="label"><span class="ko">${LETTER_TO_KO[k.letter]}</span><span class="en">${k.letter}</span></span>`;
    btn.addEventListener('click', () => handleKey(k.pc, k.midi, btn));
    whiteRow.appendChild(btn);
  }

  for (const k of BLACK_KEYS) {
    const btn = document.createElement('button');
    btn.className = 'black';
    btn.dataset.pc = k.pc;
    btn.style.left = k.leftPct + '%';
    btn.setAttribute('aria-label', k.letter);
    btn.addEventListener('click', () => handleKey(k.pc, k.midi, btn));
    blackRow.appendChild(btn);
  }
}

// ---------- audio (Web Audio API) ----------
//
// iOS quirk: AudioContext starts suspended and stays muted until "unlocked"
// inside a user gesture by playing a tiny silent buffer. If we only create
// the context when the user taps a piano key, the first tap is silent
// because resume() is async and the oscillator gets scheduled before the
// context is actually running. Workaround: unlock on the very first
// interaction anywhere on the page (any touch / click / key) so by the time
// a piano key is tapped, audio already flows.

let audioCtx = null;
let audioUnlocked = false;

function getAudioCtx() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function unlockAudio() {
  if (audioUnlocked) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  // Play a 1-sample silent buffer to flip iOS's audio gate.
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  audioUnlocked = true;
}

['touchstart', 'touchend', 'mousedown', 'click', 'keydown'].forEach(ev => {
  window.addEventListener(ev, unlockAudio, { once: false, passive: true, capture: true });
});

// Sine-partial additive synthesis with a hammer-strike noise burst.
// Each partial has its own amplitude + decay so higher harmonics fade first,
// which is what makes a piano tone evolve over time. Slight inharmonicity
// (higher partials a few cents sharp) adds a touch of acoustic-string realism.
const PARTIALS = [
  // [harmonic, amplitude, decay (s), inharmonicity (cents)]
  [1, 1.00, 3.0,  0],
  [2, 0.60, 2.0,  2],
  [3, 0.35, 1.5,  5],
  [4, 0.22, 1.1,  9],
  [5, 0.14, 0.8, 14],
  [6, 0.09, 0.6, 20],
  [7, 0.05, 0.45, 27],
];

function playMidi(midi) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const f0 = 440 * Math.pow(2, (midi - 69) / 12);
  // Schedule a few ms in the future so the audio thread has time to
  // pick up the events even if the context just resumed.
  const t0 = ctx.currentTime + 0.01;

  // Real pianos: higher notes decay faster. Halve the decay every 2 octaves above C4.
  const pitchDecay = Math.pow(0.5, (midi - 60) / 24);

  const master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);

  let maxEnd = 0;
  for (const [n, amp, baseDecay, cents] of PARTIALS) {
    const decay = baseDecay * pitchDecay;
    if (f0 * n > 16000) continue; // skip partials past Nyquist-ish range
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f0 * n;
    osc.detune.value = cents;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.004); // sharp attack
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + decay + 0.05);
    maxEnd = Math.max(maxEnd, decay + 0.05);
  }

  // Hammer-strike thud: short bandpassed noise burst, tuned to the 2nd partial.
  const thudDur = 0.05;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * thudDur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(f0 * 2, 6000);
  bp.Q.value = 3;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35, t0);
  noiseGain.gain.exponentialRampToValueAtTime(0.0005, t0 + thudDur);
  noise.connect(bp).connect(noiseGain).connect(master);
  noise.start(t0);
  noise.stop(t0 + thudDur);
}

function handleKey(pc, midi, btnEl) {
  playMidi(midi);
  submitPitchClass(pc, btnEl);
}

// ---------- game state ----------

const SETTINGS_KEY = 'piano-trainer:settings:v1';
const STATS_KEY = 'piano-trainer:stats:v1';
const DIST_KEY = 'piano-trainer:dist:v1';

const settings = loadSettings();
const stats = loadStats();
const distribution = loadDistribution();
let currentPitch = null;
let locked = false; // briefly true between answer and next question

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      clefMode: s.clefMode || 'treble',
      accidentalRate: typeof s.accidentalRate === 'number' ? s.accidentalRate : 0.30,
      showLabels: typeof s.showLabels === 'boolean' ? s.showLabels : false,
    };
  } catch { return { clefMode: 'treble', accidentalRate: 0.30, showLabels: false }; }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY) || '{}');
    return {
      correct: s.correct || 0,
      total: s.total || 0,
      streak: s.streak || 0,
      best: s.best || 0,
    };
  } catch { return { correct:0, total:0, streak:0, best:0 }; }
}
function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function emptyDistribution() {
  const byNote = {};
  for (const clef of ['treble', 'bass']) {
    for (const n of DIATONIC[clef]) byNote[`${clef}:${n.step}${n.octave}`] = 0;
  }
  return { byNote, naturals: 0, sharps: 0, flats: 0, treble: 0, bass: 0, total: 0 };
}
function loadDistribution() {
  try {
    const s = JSON.parse(localStorage.getItem(DIST_KEY) || 'null');
    if (!s) return emptyDistribution();
    const base = emptyDistribution();
    if (s.byNote) for (const k in s.byNote) if (k in base.byNote) base.byNote[k] = s.byNote[k] || 0;
    base.naturals = s.naturals || 0;
    base.sharps = s.sharps || 0;
    base.flats = s.flats || 0;
    base.treble = s.treble || 0;
    base.bass = s.bass || 0;
    base.total = s.total || 0;
    return base;
  } catch { return emptyDistribution(); }
}
function saveDistribution() {
  localStorage.setItem(DIST_KEY, JSON.stringify(distribution));
}
function recordPitch(p) {
  const key = `${p.clef}:${p.step}${p.octave}`;
  distribution.byNote[key] = (distribution.byNote[key] || 0) + 1;
  if (p.alter === 1) distribution.sharps++;
  else if (p.alter === -1) distribution.flats++;
  else distribution.naturals++;
  distribution[p.clef]++;
  distribution.total++;
  saveDistribution();
  if (distPanel.open) renderDistribution();
}

function renderStats() {
  scoreEl.textContent = stats.correct;
  totalEl.textContent = stats.total;
  streakEl.textContent = stats.streak;
  bestEl.textContent = stats.best;
}

function newQuestion() {
  locked = false;
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  staffWrap.classList.remove('correct','wrong');
  answerInput.value = '';
  currentPitch = randomPitch(settings.clefMode, settings.accidentalRate);
  recordPitch(currentPitch);
  renderNote(staffEl, currentPitch);
  // Don't auto-focus on mobile (would pop keyboard). Focus only if no touch capability detected.
  if (!('ontouchstart' in window)) answerInput.focus();
}

function submitTyped() {
  if (locked) return;
  const pc = parseAnswer(answerInput.value);
  if (pc === null) {
    feedbackEl.textContent = "Couldn't parse — try C, D, … or 도, 레, … (add # or b for sharps/flats)";
    feedbackEl.className = 'feedback wrong';
    return;
  }
  judge(pc);
}

function submitPitchClass(pc, btnEl) {
  if (locked) return;
  if (btnEl) {
    btnEl.classList.add('flash');
    setTimeout(() => btnEl.classList.remove('flash'), 180);
  }
  judge(pc);
}

function judge(answerPc) {
  if (!currentPitch) return;
  const targetPc = pitchClass(currentPitch.step, currentPitch.alter);
  const ok = answerPc === targetPc;

  locked = true;
  stats.total += 1;
  if (ok) {
    stats.correct += 1;
    stats.streak += 1;
    if (stats.streak > stats.best) stats.best = stats.streak;
    feedbackEl.textContent = '✓ ' + describePitch(currentPitch);
    feedbackEl.className = 'feedback correct';
    staffWrap.classList.add('correct');
  } else {
    stats.streak = 0;
    feedbackEl.textContent = '✗ was ' + describePitch(currentPitch);
    feedbackEl.className = 'feedback wrong';
    staffWrap.classList.add('wrong');
  }
  saveStats();
  renderStats();

  setTimeout(newQuestion, ok ? 600 : 1200);
}

function renderDistribution() {
  const total = distribution.total;
  if (total === 0) {
    distSummary.textContent = 'No data yet — play some notes.';
    distChart.innerHTML = '';
    return;
  }
  const accPct = ((distribution.sharps + distribution.flats) / total * 100).toFixed(1);
  distSummary.innerHTML =
    `Total: <b>${total}</b> &nbsp;•&nbsp; ` +
    `Treble: <b>${distribution.treble}</b> &nbsp; Bass: <b>${distribution.bass}</b><br>` +
    `Naturals: <b>${distribution.naturals}</b> &nbsp; ` +
    `♯: <b>${distribution.sharps}</b> &nbsp; ♭: <b>${distribution.flats}</b> ` +
    `<span style="color:var(--muted)">(${accPct}% accidentals)</span>`;

  const parts = [];
  for (const clef of ['treble', 'bass']) {
    const entries = DIATONIC[clef].map(n => ({
      label: `${n.step}${n.octave}`,
      count: distribution.byNote[`${clef}:${n.step}${n.octave}`] || 0,
    }));
    const clefTotal = entries.reduce((s, e) => s + e.count, 0);
    if (clefTotal === 0) continue;
    const max = Math.max(...entries.map(e => e.count));
    const expectedPct = max > 0 ? (clefTotal / entries.length) / max * 100 : 0;
    parts.push(`<div class="dist-clef">${clef === 'treble' ? 'Treble' : 'Bass'} (${clefTotal})</div>`);
    for (const e of entries) {
      const pct = max > 0 ? (e.count / max) * 100 : 0;
      parts.push(
        `<div class="hist-row">` +
          `<span class="hist-label">${e.label}</span>` +
          `<span class="hist-bar" style="--expected-pct:${expectedPct.toFixed(2)}%">` +
            `<span class="hist-fill" style="width:${pct.toFixed(2)}%"></span>` +
          `</span>` +
          `<span class="hist-count">${e.count}</span>` +
        `</div>`
      );
    }
  }
  distChart.innerHTML = parts.join('');
}

function describePitch(p) {
  const western = p.step + (p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : '');
  const ko = LETTER_TO_KO[p.step] + (p.alter === 1 ? '♯' : p.alter === -1 ? '♭' : '');
  return `${western} (${ko})`;
}

// ---------- event wiring ----------

submitBtn.addEventListener('click', submitTyped);
answerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitTyped();
  }
});

clefToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-clef]');
  if (!btn) return;
  settings.clefMode = btn.dataset.clef;
  saveSettings();
  syncClefToggle();
  newQuestion();
});
function syncClefToggle() {
  clefToggle.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.clef === settings.clefMode);
  });
}

accSlider.addEventListener('input', () => {
  const pct = Number(accSlider.value);
  settings.accidentalRate = pct / 100;
  accSliderVal.textContent = pct + '%';
  saveSettings();
});

showLabelsCheckbox.addEventListener('change', () => {
  settings.showLabels = showLabelsCheckbox.checked;
  saveSettings();
  applyShowLabels();
});

function applyShowLabels() {
  pianoEl.classList.toggle('no-labels', !settings.showLabels);
}

distPanel.addEventListener('toggle', () => {
  if (distPanel.open) renderDistribution();
});
distResetBtn.addEventListener('click', () => {
  const fresh = emptyDistribution();
  distribution.byNote = fresh.byNote;
  distribution.naturals = 0;
  distribution.sharps = 0;
  distribution.flats = 0;
  distribution.treble = 0;
  distribution.bass = 0;
  distribution.total = 0;
  saveDistribution();
  renderDistribution();
});

resetBtn.addEventListener('click', () => {
  stats.correct = 0;
  stats.total = 0;
  stats.streak = 0;
  // keep `best` — it's a personal record
  saveStats();
  renderStats();
});

// Physical keyboard shortcut: pressing a-g + optional # or b types it for you.
// (Just relies on the input field; nothing special needed.)

// ---------- boot ----------

buildPiano();
syncClefToggle();
accSlider.value = String(Math.round(settings.accidentalRate * 100));
accSliderVal.textContent = accSlider.value + '%';
showLabelsCheckbox.checked = settings.showLabels;
applyShowLabels();
renderStats();
newQuestion();

// Re-render the staff on resize so SVG width tracks the container.
let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    if (currentPitch) renderNote(staffEl, currentPitch);
  });
});

})();

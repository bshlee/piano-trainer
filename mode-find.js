// Find Note mode — prompt is a note name; user taps the staff at every position
// matching that pitch class (within the clef's range), then submits.
//
// Tap behavior: the click Y on the staff SVG snaps to the nearest diatonic line/space.
// VexFlow renders the placed note (with ledger lines if outside the staff). Tap the
// same Y again to remove that placement.
//
// Exposes window.PT_FindNote = { start, submit, refreshPrompt, handleResize }.

(function () {

const STEP_TO_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

// Reference is the bottom line of each clef (for click-Y → diatonic math).
const CLEF_REF = {
  treble: { step: 'E', octave: 4 },  // bottom line of treble staff
  bass:   { step: 'G', octave: 2 },  // bottom line of bass staff
};

const findHeaderEl = document.getElementById('find-header'); // optional
const findStaffEl = document.getElementById('find-staff');
const findNamePrimary = document.getElementById('find-name-primary');
const findNameSecondary = document.getElementById('find-name-secondary');
const findSelectedEl = document.getElementById('find-selected');
const findTargetEl = document.getElementById('find-target');
const findFeedbackEl = document.getElementById('find-feedback');
const findSubmitBtn = document.getElementById('find-submit');

let currentStep = null;     // 'C'..'B'
let currentClef = null;     // 'treble' | 'bass'
let targetMidis = null;     // Set<number>
const selectedMidis = new Set();  // user's placements
let staffRef = null;        // {bottomLineY, stepPx, svgWidth, svgHeight}
let locked = false;
let advanceTimer = null;

function settings() { return window.PT_Settings.get(); }

function rangeFor(clef) {
  return clef === 'bass'
    ? { low: 36, high: 64 }   // C2..E4
    : { low: 57, high: 88 };  // A3..E6
}

function midiFromStepOctave(step, octave) {
  return (octave + 1) * 12 + STEP_TO_PC[step];
}

function midiToStepOctave(midi) {
  const pc = ((midi % 12) + 12) % 12;
  // Only naturals are valid in Find Note. Sharps/flats won't be hit by snap
  // because the staff's diatonic positions are all naturals.
  const PC_TO_NAT = { 0:'C', 2:'D', 4:'E', 5:'F', 7:'G', 9:'A', 11:'B' };
  if (!(pc in PC_TO_NAT)) return null;
  return { step: PC_TO_NAT[pc], octave: Math.floor(midi / 12) - 1 };
}

function midisInRangeForStep(range, step) {
  const targetPc = STEP_TO_PC[step];
  const set = new Set();
  for (let m = range.low; m <= range.high; m++) {
    const pc = ((m % 12) + 12) % 12;
    if (pc === targetPc) set.add(m);
  }
  return set;
}

function pickStep(avoid) {
  let step = NATURALS[Math.floor(Math.random() * NATURALS.length)];
  if (step === avoid && Math.random() < 0.5) {
    step = NATURALS[Math.floor(Math.random() * NATURALS.length)];
  }
  return step;
}

function pickClef(clefMode) {
  if (clefMode === 'both') return Math.random() < 0.5 ? 'treble' : 'bass';
  return clefMode;
}

function selectedPitches() {
  const out = [];
  for (const m of selectedMidis) {
    const p = midiToStepOctave(m);
    if (p) out.push(p);
  }
  return out;
}

function rerenderStaff(marks) {
  staffRef = window.renderFindStaff(findStaffEl, currentClef, selectedPitches(), marks);
}

function start() {
  if (settings().mode !== 'find') return;
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }

  locked = false;
  selectedMidis.clear();
  findFeedbackEl.textContent = '';
  findFeedbackEl.className = 'find-feedback';
  findStaffEl.classList.remove('correct', 'wrong');

  currentClef = pickClef(settings().clefMode);
  currentStep = pickStep(currentStep);

  const range = rangeFor(currentClef);
  targetMidis = midisInRangeForStep(range, currentStep);

  refreshPrompt();
  updateCounter();
  rerenderStaff(null);
}

function refreshPrompt() {
  if (!currentStep) return;
  const ko = window.PT_Pitch.LETTER_TO_KO[currentStep];
  const en = currentStep;
  const lang = settings().findNoteLang;
  if (lang === 'en') {
    findNamePrimary.textContent = en;
    findNameSecondary.textContent = ko;
  } else {
    findNamePrimary.textContent = ko;
    findNameSecondary.textContent = en;
  }
}

function updateCounter() {
  findSelectedEl.textContent = String(selectedMidis.size);
  findTargetEl.textContent = String(targetMidis ? targetMidis.size : 0);
}

// Convert a click Y (relative to the staff SVG) to the nearest in-range natural MIDI.
function snapClickYToMidi(clickY) {
  if (!staffRef) return null;
  const ref = CLEF_REF[currentClef];
  const stepsAboveRef = Math.round((staffRef.bottomLineY - clickY) / staffRef.stepPx);
  const refIdx = STEPS.indexOf(ref.step);
  const absIdx = refIdx + stepsAboveRef;
  const octaveOffset = Math.floor(absIdx / 7);
  const stepIdx = ((absIdx % 7) + 7) % 7;
  const step = STEPS[stepIdx];
  const octave = ref.octave + octaveOffset;
  const midi = midiFromStepOctave(step, octave);
  const range = rangeFor(currentClef);
  if (midi < range.low || midi > range.high) return null;
  return midi;
}

function handleStaffClick(e) {
  if (locked) return;
  const svg = findStaffEl.querySelector('svg');
  if (!svg) return;
  const rect = svg.getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  const midi = snapClickYToMidi(clickY);
  if (midi == null) return;

  if (selectedMidis.has(midi)) {
    selectedMidis.delete(midi);
  } else {
    selectedMidis.add(midi);
    window.PT_Audio.play(midi);
  }
  updateCounter();
  rerenderStaff(null);
}

function submit() {
  if (locked || !targetMidis) return;

  let ok = selectedMidis.size === targetMidis.size;
  if (ok) {
    for (const m of selectedMidis) {
      if (!targetMidis.has(m)) { ok = false; break; }
    }
  }

  locked = true;
  if (ok) {
    findFeedbackEl.textContent = `✓ All ${targetMidis.size} ${currentStep}${targetMidis.size === 1 ? '' : 's'} found`;
    findFeedbackEl.className = 'find-feedback correct';
    findStaffEl.classList.add('correct');
    advanceTimer = setTimeout(start, 900);
  } else {
    let correctCount = 0;
    let extraCount = 0;
    for (const m of selectedMidis) {
      if (targetMidis.has(m)) correctCount++;
      else extraCount++;
    }
    const missedCount = targetMidis.size - correctCount;
    const parts = [`expected ${targetMidis.size}`];
    if (missedCount > 0) parts.push(`missed ${missedCount}`);
    if (extraCount > 0) parts.push(`${extraCount} wrong`);
    findFeedbackEl.textContent = `✗ ${parts.join(' · ')}`;
    findFeedbackEl.className = 'find-feedback wrong';
    findStaffEl.classList.add('wrong');

    // Annotate the placed notes: green if it matched a target, red otherwise.
    const marks = selectedPitches().map(p => {
      const m = midiFromStepOctave(p.step, p.octave);
      return { ...p, kind: targetMidis.has(m) ? 'correct' : 'wrong' };
    });
    rerenderStaff(marks);

    advanceTimer = setTimeout(start, 2000);
  }
}

function handleResize() {
  if (settings().mode !== 'find') return;
  rerenderStaff(null);
}

findStaffEl.addEventListener('click', handleStaffClick);
findSubmitBtn.addEventListener('click', submit);

// Inverse of snapClickYToMidi — used by tests to drive the staff click handler
// at a precise pitch. Returns Y relative to the staff SVG.
function midiToStaffY(midi) {
  if (!staffRef) return null;
  const ref = CLEF_REF[currentClef];
  const sp = midiToStepOctave(midi);
  if (!sp) return null;
  const refIdx = STEPS.indexOf(ref.step);
  const stepIdx = STEPS.indexOf(sp.step);
  const stepsAboveRef = (sp.octave - ref.octave) * 7 + (stepIdx - refIdx);
  return staffRef.bottomLineY - stepsAboveRef * staffRef.stepPx;
}

window.PT_FindNote = {
  start,
  submit,
  refreshPrompt,
  handleResize,
  // test-only helpers
  _midiToStaffY: midiToStaffY,
  _state: () => ({
    clef: currentClef,
    step: currentStep,
    targetMidis: targetMidis ? [...targetMidis] : null,
    selectedMidis: [...selectedMidis],
  }),
};

})();

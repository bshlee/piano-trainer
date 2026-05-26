// Find Note mode — prompt is a note name; user taps every key in the clef's
// range that matches that pitch class, then submits.
//
// Exposes window.PT_FindNote = { start, toggleKey, submit, refreshPrompt, handleResize }.
// app.js wires the shared piano-click handler + the clef toggle to call into us.

(function () {

const STEP_TO_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const findWrap = document.getElementById('find-wrap');
const findClefEl = document.getElementById('find-clef');
const findNamePrimary = document.getElementById('find-name-primary');
const findNameSecondary = document.getElementById('find-name-secondary');
const findSelectedEl = document.getElementById('find-selected');
const findTargetEl = document.getElementById('find-target');
const findFeedbackEl = document.getElementById('find-feedback');
const findSubmitBtn = document.getElementById('find-submit');

let currentStep = null;
let currentClef = null;
let targetMidis = null; // Set<number>
const selectedMidis = new Set();
let locked = false;
let advanceTimer = null;

function settings() { return window.PT_Settings.get(); }

function rangeFor(clef) {
  const r = window.PT_Piano.ranges;
  return clef === 'bass' ? r.findBass : r.findTreble;
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
  // Light anti-repeat: 50% chance to reroll if we drew the same step as last.
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

function start() {
  if (settings().mode !== 'find') return;
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }

  locked = false;
  selectedMidis.clear();
  findFeedbackEl.textContent = '';
  findFeedbackEl.className = 'find-feedback';
  findWrap.classList.remove('correct', 'wrong');

  currentClef = pickClef(settings().clefMode);
  currentStep = pickStep(currentStep);

  const range = rangeFor(currentClef);
  targetMidis = midisInRangeForStep(range, currentStep);

  window.PT_Piano.build(range, { extended: true });

  refreshPrompt();
  renderClefIndicator();
  updateCounter();

  // Auto-scroll the extended piano so the first matching key is visible.
  const sorted = [...targetMidis].sort((a, b) => a - b);
  if (sorted.length > 0) {
    const focusMidi = sorted[Math.floor(sorted.length / 2)];
    requestAnimationFrame(() => window.PT_Piano.scrollToMidi(focusMidi));
  }
}

function renderClefIndicator() {
  if (window.renderClefOnly) {
    window.renderClefOnly(findClefEl, currentClef);
  } else {
    findClefEl.textContent = currentClef === 'bass' ? 'Bass' : 'Treble';
  }
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

function toggleKey(midi, btnEl) {
  if (locked) return;
  if (selectedMidis.has(midi)) {
    selectedMidis.delete(midi);
    if (btnEl) btnEl.classList.remove('selected');
  } else {
    selectedMidis.add(midi);
    if (btnEl) btnEl.classList.add('selected');
    window.PT_Audio.play(midi);
  }
  updateCounter();
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
    findWrap.classList.add('correct');
    advanceTimer = setTimeout(start, 900);
  } else {
    let correctCount = 0;
    let extraCount = 0;
    for (const m of selectedMidis) {
      if (targetMidis.has(m)) correctCount++;
      else extraCount++;
    }
    const missedCount = targetMidis.size - correctCount;
    const parts = [];
    parts.push(`expected ${targetMidis.size}`);
    if (missedCount > 0) parts.push(`missed ${missedCount}`);
    if (extraCount > 0) parts.push(`${extraCount} wrong`);
    findFeedbackEl.textContent = `✗ ${parts.join(' · ')}`;
    findFeedbackEl.className = 'find-feedback wrong';
    findWrap.classList.add('wrong');
    advanceTimer = setTimeout(start, 1800);
  }
}

function handleResize() {
  // Piano is responsive via CSS; nothing to redraw here. Reserved for the
  // future multi-note strip add-on where layout depends on viewport width.
}

findSubmitBtn.addEventListener('click', submit);

window.PT_FindNote = {
  start,
  toggleKey,
  submit,
  refreshPrompt,
  handleResize,
};

})();

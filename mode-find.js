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
const opHistory = [];       // stack of {type:'add'|'remove'|'move', midi?, from?, to?}
let staffRef = null;        // {bottomLineY, stepPx, svgWidth, svgHeight}
let locked = false;
let awaitingNext = false;   // true after a wrong submit until user clicks Next
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
  awaitingNext = false;
  findSubmitBtn.textContent = 'Submit';
  selectedMidis.clear();
  opHistory.length = 0;
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

// --- drag-to-place interaction ----------------------------------------------
//
// pointerdown shows a snap preview marker at the tapped pitch. pointermove
// slides the preview through diatonic positions. pointerup commits.
//
// Two cases at pointerup:
//   - Stationary tap (snap never changed): toggle the tapped pitch
//     (add if empty, remove if already placed). Preserves the original
//     tap-to-toggle behavior.
//   - Drag (snap changed at least once): if the touch started on an existing
//     note, that note is "lifted off" the moment the snap first changes
//     (removed from selectedMidis), so the preview marker becomes its new
//     home. Release on empty staff = move. Release back on origin, or onto
//     another already-placed note = restore (cancel the move).
//
// Edge: drag that started on empty + ends on an occupied snap = remove that
// occupied note (preserves prior behavior of "drag to remove").

let dragPointerId = null;
let dragMidi = null;
let pickedUpMidi = null;  // midi of the note that was lifted off mid-drag (null = none)

function ensurePreviewEl() {
  let el = findStaffEl.querySelector('.find-preview');
  if (!el) {
    el = document.createElement('div');
    el.className = 'find-preview';
    findStaffEl.appendChild(el);
  }
  return el;
}

function clearPreviewEl() {
  const el = findStaffEl.querySelector('.find-preview');
  if (el) el.remove();
}

function showPreviewAtMidi(midi) {
  if (!staffRef) return;
  const svg = findStaffEl.querySelector('svg');
  if (!svg) return;
  const y = midiToStaffY(midi);
  if (y == null) return;
  const svgRect = svg.getBoundingClientRect();
  const wrapRect = findStaffEl.getBoundingClientRect();
  const el = ensurePreviewEl();
  el.style.top = (svgRect.top - wrapRect.top + y) + 'px';
  el.style.left = (svgRect.left - wrapRect.left + svgRect.width / 2) + 'px';
  el.dataset.midi = String(midi);
  // Red hint = "release here removes a note". Only meaningful when we're not
  // already carrying a picked-up note: when carrying one, dropping on
  // occupied just cancels (restores origin), and the origin slot is empty
  // because the note has been lifted off.
  const removeHint = pickedUpMidi == null && selectedMidis.has(midi);
  el.classList.toggle('remove-hint', removeHint);
}

function pointerY(e) {
  const svg = findStaffEl.querySelector('svg');
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  return e.clientY - rect.top;
}

function handlePointerDown(e) {
  if (locked) return;
  if (e.button !== undefined && e.button !== 0) return; // primary button / touch only
  const y = pointerY(e);
  if (y == null) return;
  const midi = snapClickYToMidi(y);
  if (midi == null) return;
  e.preventDefault();
  dragPointerId = e.pointerId;
  dragMidi = midi;
  pickedUpMidi = null;
  try { findStaffEl.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  showPreviewAtMidi(midi);
}

function handlePointerMove(e) {
  if (dragPointerId === null || e.pointerId !== dragPointerId) return;
  const y = pointerY(e);
  if (y == null) return;
  const midi = snapClickYToMidi(y);
  if (midi == null) {
    clearPreviewEl();
    dragMidi = null;
    return;
  }
  if (midi === dragMidi) return;

  // First time the snap changes: if we started on an existing note, lift it
  // off now (deferred so a pure tap doesn't visually flicker the note away).
  if (pickedUpMidi == null && dragMidi != null && selectedMidis.has(dragMidi)) {
    pickedUpMidi = dragMidi;
    selectedMidis.delete(pickedUpMidi);
    updateCounter();
    rerenderStaff(null);
  }

  dragMidi = midi;
  showPreviewAtMidi(midi);
}

function handlePointerUp(e) {
  if (dragPointerId === null || e.pointerId !== dragPointerId) return;
  const endMidi = dragMidi;
  const startMidi = pickedUpMidi;
  dragPointerId = null;
  dragMidi = null;
  pickedUpMidi = null;
  clearPreviewEl();
  try { findStaffEl.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }

  if (endMidi == null) {
    // Drag ended off-range: restore the picked-up note if any.
    if (startMidi != null) {
      selectedMidis.add(startMidi);
      updateCounter();
      rerenderStaff(null);
    }
    return;
  }

  if (startMidi != null) {
    // Drag carrying a picked-up note.
    if (endMidi === startMidi || selectedMidis.has(endMidi)) {
      // Released on origin or onto another existing note → restore origin.
      selectedMidis.add(startMidi);
    } else {
      selectedMidis.add(endMidi);
      opHistory.push({ type: 'move', from: startMidi, to: endMidi });
      window.PT_Audio.play(endMidi);
    }
  } else {
    // Stationary tap, or drag that started on empty space.
    if (selectedMidis.has(endMidi)) {
      selectedMidis.delete(endMidi);
      opHistory.push({ type: 'remove', midi: endMidi });
    } else {
      selectedMidis.add(endMidi);
      opHistory.push({ type: 'add', midi: endMidi });
      window.PT_Audio.play(endMidi);
    }
  }
  updateCounter();
  rerenderStaff(null);
}

function handlePointerCancel(e) {
  if (e.pointerId !== dragPointerId) return;
  dragPointerId = null;
  dragMidi = null;
  // Restore picked-up note if the gesture was canceled mid-drag.
  if (pickedUpMidi != null) {
    selectedMidis.add(pickedUpMidi);
    pickedUpMidi = null;
    updateCounter();
    rerenderStaff(null);
  }
  clearPreviewEl();
}

function clearSelection() {
  if (locked) return;
  if (selectedMidis.size === 0) return;
  selectedMidis.clear();
  opHistory.length = 0;
  updateCounter();
  rerenderStaff(null);
}

function undoLast() {
  if (locked) return;
  if (opHistory.length === 0) return;
  const op = opHistory.pop();
  if (op.type === 'add') {
    selectedMidis.delete(op.midi);
  } else if (op.type === 'remove') {
    selectedMidis.add(op.midi);
  } else if (op.type === 'move') {
    selectedMidis.delete(op.to);
    selectedMidis.add(op.from);
  }
  updateCounter();
  rerenderStaff(null);
}

function submit() {
  // Submit button doubles as Next during wrong-review — handle that first so
  // the `locked` guard below doesn't swallow the click.
  if (awaitingNext) { nextQuestion(); return; }
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

    // Annotate placements (green for correct, red for wrong) AND show the
    // missed targets as ghost-green notes so the user can study where the
    // answer should have been.
    const marks = selectedPitches().map(p => {
      const m = midiFromStepOctave(p.step, p.octave);
      return { ...p, kind: targetMidis.has(m) ? 'correct' : 'wrong' };
    });
    for (const m of targetMidis) {
      if (!selectedMidis.has(m)) {
        const p = midiToStepOctave(m);
        if (p) marks.push({ ...p, kind: 'miss' });
      }
    }
    rerenderStaff(marks);

    // No auto-advance on wrong — let the user study the corrected staff.
    // Submit button becomes Next; clicking it calls nextQuestion().
    awaitingNext = true;
    findSubmitBtn.textContent = 'Next';
  }
}

function nextQuestion() {
  if (!awaitingNext) return;
  start();
}

function handleResize() {
  if (settings().mode !== 'find') return;
  rerenderStaff(null);
}

findStaffEl.addEventListener('pointerdown', handlePointerDown);
findStaffEl.addEventListener('pointermove', handlePointerMove);
findStaffEl.addEventListener('pointerup', handlePointerUp);
findStaffEl.addEventListener('pointercancel', handlePointerCancel);
findStaffEl.addEventListener('lostpointercapture', handlePointerCancel);
findSubmitBtn.addEventListener('click', submit);

const findClearBtn = document.getElementById('find-clear');
if (findClearBtn) findClearBtn.addEventListener('click', clearSelection);

const findUndoBtn = document.getElementById('find-undo');
if (findUndoBtn) findUndoBtn.addEventListener('click', undoLast);

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

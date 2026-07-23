// Intervals mode: two stacked whole notes on a treble staff — name the
// interval by picking a quality + a number (1st–8th). Basic level uses
// natural notes only; Chromatic adds accidentals up to double sharps/flats
// and doubly diminished/augmented qualities.
//
// Loaded before app.js, so the window.PT_* namespaces don't exist yet at
// parse time — only touch them inside functions.

(function () {
  // ---------- theory ----------

  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const BASE_SEMITONES = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 8: 12 };
  const PERFECT_CLASS = new Set([1, 4, 5, 8]);
  // diff = actual semitones − base semitones for the number → quality code
  const PERFECT_DIFF = { '-2': 'dd', '-1': 'd', '0': 'P', '1': 'A', '2': 'AA' };
  const MAJOR_DIFF = { '-3': 'dd', '-2': 'd', '-1': 'm', '0': 'M', '1': 'A', '2': 'AA' };
  const Q_LABEL = { dd: 'Doubly dim', d: 'Diminished', m: 'Minor', P: 'Perfect', M: 'Major', A: 'Augmented', AA: 'Doubly aug' };
  const N_LABEL = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th' };

  function classify(number, semitones) {
    const diff = String(semitones - BASE_SEMITONES[number]);
    return (PERFECT_CLASS.has(number) ? PERFECT_DIFF : MAJOR_DIFF)[diff] || null;
  }

  // Inverse of classify: semitone offset from the base for a quality code.
  function qualityDiff(number, quality) {
    const table = PERFECT_CLASS.has(number) ? PERFECT_DIFF : MAJOR_DIFF;
    for (const k in table) if (table[k] === quality) return Number(k);
    return null;
  }

  // Qualities a chromatic question can ask for. Diminished (and doubly
  // diminished) unisons don't exist — an interval can't be smaller than a
  // perfect unison — so number 1 skips them.
  function chromaticQualities(number) {
    if (number === 1) return ['P', 'A', 'AA'];
    return PERFECT_CLASS.has(number)
      ? ['dd', 'd', 'P', 'A', 'AA']
      : ['dd', 'd', 'm', 'M', 'A', 'AA'];
  }

  const rand = (n) => Math.floor(Math.random() * n);

  function generate() {
    const level = settings().intervalsLevel;
    const MFO = window.PT_Pitch.midiFromStepOctave;

    const li = rand(7);            // lower letter index; the lower note lives in octave 4
    const number = 1 + rand(8);
    const ui = li + number - 1;    // upper letter index on the diatonic ladder
    const low = { step: LETTERS[li], octave: 4, alter: 0 };
    const up = { step: LETTERS[ui % 7], octave: 4 + Math.floor(ui / 7), alter: 0 };
    const natSemis = MFO(up.step, up.octave, 0) - MFO(low.step, low.octave, 0);

    let quality;
    if (level === 'chromatic') {
      const qs = chromaticQualities(number);
      quality = qs[rand(qs.length)];
      // Solve alterUp − alterLow = required − natural, keeping both in [-2, 2].
      // The gap k stays within [-4, 3], so the alterLow window is never empty.
      const k = BASE_SEMITONES[number] + qualityDiff(number, quality) - natSemis;
      const lo = Math.max(-2, -2 - k);
      const hi = Math.min(2, 2 - k);
      low.alter = lo + rand(hi - lo + 1);
      up.alter = low.alter + k;
    } else {
      quality = classify(number, natSemis); // naturals: P/M/m plus A4 (F–B), d5 (B–F)
    }

    return {
      notes: [low, up],
      midiLow: MFO(low.step, low.octave, low.alter),
      midiHigh: MFO(up.step, up.octave, up.alter),
      quality,
      number,
    };
  }

  // ---------- DOM ----------

  const sectionEl = document.getElementById('intervals');
  const staffWrapEl = document.getElementById('intervals-staff-wrap');
  const staffEl = document.getElementById('intervals-staff');
  const feedbackEl = document.getElementById('intervals-feedback');
  const qualityGroupEl = document.getElementById('intervals-quality');
  const numberGroupEl = document.getElementById('intervals-number');
  const lettersGroupEl = document.getElementById('intervals-letters');
  const submitBtn = document.getElementById('intervals-submit');
  const levelRadios = document.querySelectorAll('input[name="intervals-level"]');
  const nameNotesToggle = document.getElementById('intervals-name-notes');

  function settings() { return window.PT_Settings.get(); }

  // ---------- state ----------

  let current = null;        // {notes, midiLow, midiHigh, quality, number}
  let pickedQ = null;        // quality code ('P', 'm', …)
  let pickedN = null;        // interval number (1–8)
  let locked = false;        // true during feedback (correct flash / reveal)
  let awaitingNext = false;  // wrong answer shown; Submit button acts as Next
  let advanceTimer = null;
  let phase = 'interval';    // 'notes' (name notes first setting) | 'interval'
  let noteIdx = 0;           // which note is being named: 0 = lower, 1 = upper

  function playCurrent() {
    if (!current || !window.PT_Audio) return;
    window.PT_Audio.play(current.midiLow);
    window.PT_Audio.play(current.midiHigh);
  }

  function syncLevelUI() {
    const level = settings().intervalsLevel;
    if (sectionEl) sectionEl.dataset.level = level;
    levelRadios.forEach((r) => { r.checked = (r.value === level); });
    if (nameNotesToggle) nameNotesToggle.checked = !!settings().intervalsNameNotes;
  }

  const ALTER_GLYPH = { '-2': '♭♭', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };
  function noteName(n) { return n.step + ALTER_GLYPH[String(n.alter)]; }

  function promptNote() {
    feedbackEl.textContent = noteIdx === 0 ? 'Name the lower note' : 'Name the upper note';
    feedbackEl.className = 'feedback';
  }

  function clearMarks() {
    [qualityGroupEl, numberGroupEl, lettersGroupEl].forEach((group) => {
      if (!group) return;
      group.querySelectorAll('button').forEach((b) => {
        b.classList.remove('on', 'reveal-correct', 'reveal-wrong');
      });
    });
  }

  function start() {
    if (settings().mode !== 'intervals') return;
    if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
    locked = false;
    awaitingNext = false;
    pickedQ = null;
    pickedN = null;
    submitBtn.textContent = 'Submit';
    clearMarks();
    feedbackEl.textContent = '';
    feedbackEl.className = 'feedback';
    staffWrapEl.classList.remove('correct', 'wrong');
    syncLevelUI();
    current = generate();
    phase = settings().intervalsNameNotes ? 'notes' : 'interval';
    noteIdx = 0;
    if (sectionEl) sectionEl.dataset.phase = phase;
    if (phase === 'notes') promptNote();
    window.renderInterval(staffEl, current.notes);
    playCurrent();
  }

  // Highlight the correct button in a group; mark the user's differing pick red.
  function markReveal(groupEl, dataAttr, correctVal, pickedVal) {
    groupEl.querySelectorAll('button').forEach((b) => {
      const v = b.dataset[dataAttr];
      if (v === correctVal) b.classList.add('reveal-correct');
      else if (v === pickedVal) b.classList.add('reveal-wrong');
    });
  }

  function submit() {
    if (awaitingNext) { start(); return; }
    if (locked || !current || phase === 'notes') return;
    if (!pickedQ || !pickedN) {
      feedbackEl.textContent = 'Pick a quality and a number';
      feedbackEl.className = 'feedback';
      return;
    }
    locked = true;
    playCurrent();
    const label = `${Q_LABEL[current.quality]} ${N_LABEL[current.number]}`;
    if (pickedQ === current.quality && pickedN === current.number) {
      feedbackEl.textContent = `✓ ${label}`;
      feedbackEl.className = 'feedback correct';
      staffWrapEl.classList.add('correct');
      advanceTimer = setTimeout(start, 900);
    } else {
      feedbackEl.textContent = `✗ was ${label}`;
      feedbackEl.className = 'feedback wrong';
      staffWrapEl.classList.add('wrong');
      markReveal(qualityGroupEl, 'q', current.quality, pickedQ);
      markReveal(numberGroupEl, 'n', String(current.number), String(pickedN));
      awaitingNext = true;
      submitBtn.textContent = 'Next';
    }
  }

  function handleResize() {
    if (settings().mode !== 'intervals' || !current) return;
    window.renderInterval(staffEl, current.notes);
  }

  // ---------- wiring ----------

  function wireGroup(groupEl, dataAttr, setPick) {
    if (!groupEl) return;
    groupEl.addEventListener('click', (e) => {
      const btn = e.target.closest(`button[data-${dataAttr}]`);
      if (!btn || locked || awaitingNext) return;
      setPick(btn.dataset[dataAttr]);
      groupEl.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    });
  }
  wireGroup(qualityGroupEl, 'q', (v) => { pickedQ = v; });
  wireGroup(numberGroupEl, 'n', (v) => { pickedN = Number(v); });

  // Note-naming phase: judged instantly per tap, retry on wrong (no reveal).
  function flashBtn(btn, cls) {
    btn.classList.add(cls);
    setTimeout(() => btn.classList.remove(cls), 400);
  }
  if (lettersGroupEl) lettersGroupEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-letter]');
    if (!btn || phase !== 'notes' || locked || !current) return;
    if (btn.dataset.letter === current.notes[noteIdx].step) {
      if (window.PT_Audio) window.PT_Audio.play(noteIdx === 0 ? current.midiLow : current.midiHigh);
      flashBtn(btn, 'reveal-correct');
      if (noteIdx === 0) {
        noteIdx = 1;
        promptNote();
      } else {
        phase = 'interval';
        if (sectionEl) sectionEl.dataset.phase = phase;
        feedbackEl.textContent = `✓ ${noteName(current.notes[0])} · ${noteName(current.notes[1])} — now the interval`;
        feedbackEl.className = 'feedback correct';
      }
    } else {
      feedbackEl.textContent = '✗ try again';
      feedbackEl.className = 'feedback wrong';
      flashBtn(btn, 'reveal-wrong');
    }
  });

  if (submitBtn) submitBtn.addEventListener('click', submit);

  levelRadios.forEach((r) => {
    r.addEventListener('change', () => {
      if (!r.checked) return;
      const s = settings();
      s.intervalsLevel = r.value === 'chromatic' ? 'chromatic' : 'basic';
      window.PT_Settings.save();
      if (s.mode === 'intervals') start();
    });
  });

  if (nameNotesToggle) nameNotesToggle.addEventListener('change', () => {
    const s = settings();
    s.intervalsNameNotes = nameNotesToggle.checked;
    window.PT_Settings.save();
    if (s.mode === 'intervals') start();
  });

  window.PT_Intervals = {
    start,
    submit,
    handleResize,
    // test/console helpers
    _classify: classify,
    _generate: generate,
  };
})();

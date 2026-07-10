// VexFlow staff rendering for all modes. Exposes render functions on window.

(function () {
const VF = window.Vex.Flow;

// Render a single-note question. A one-pitch strip renders identically
// (no caret, no spreading), so this just delegates to renderStrip.
function renderNote(container, pitch) {
  renderStrip(container, [pitch], 0);
}

// Draw an empty staff showing only the chosen clef. Used by Find Note's prompt area.
function renderClefOnly(container, clef) {
  container.innerHTML = '';
  const width = 70;
  const height = 90;
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  const stave = new VF.Stave(0, 8, width);
  stave.addClef(clef === 'bass' ? 'bass' : 'treble');
  stave.setContext(ctx).draw();
}

// Render a tall staff with the chosen clef and N notes. VexFlow auto-draws
// ledger lines for notes off the staff. Returns {bottomLineY, stepPx, svgWidth,
// svgHeight} so the caller can map click Y → diatonic position.
//
// `pitches` is an array of { step, octave } — the user's placements.
// `marks` (optional) is an array of {step, octave, kind} that drives feedback:
//   - kind 'correct' — pitch is in `pitches` AND was a target (rendered green)
//   - kind 'wrong'   — pitch is in `pitches` but NOT a target (rendered red)
//   - kind 'miss'    — pitch is NOT in `pitches` but WAS a target. Rendered as
//                       a ghost-green note in the same voice so the user sees
//                       where the answer should have been.
function renderFindStaff(container, clef, pitches, marks) {
  container.innerHTML = '';

  const STEP_TO_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  const pitchKey = (p) => `${p.step}${p.octave}`;
  const midiOf = (p) => (p.octave + 1) * 12 + STEP_TO_PC[p.step];

  // SCALE makes the whole rendering bigger via the SVG context, so glyphs and
  // line spacing both grow proportionally. Cap the displayed width on wide
  // screens — keeps the staff "short" so the cluster of notes is prominent
  // rather than hugging the left edge of a stretched staff.
  const SCALE = 1.3;
  const parentW = (container.parentElement && container.parentElement.clientWidth) || 480;
  const width = Math.min(Math.max(parentW - 16, 280), 480);
  const height = 200;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();
  ctx.scale(SCALE, SCALE);

  // VexFlow works in internal (pre-scale) coords. We divide displayed targets
  // by SCALE to compute them, then multiply VexFlow's results back by SCALE
  // before returning so the click handlers can use SVG-canvas units directly.
  const internalW = width / SCALE;
  const stavLeftPad = 8 / SCALE;
  const staveTopY = 60 / SCALE;  // displayed ~60 → enough room above for E6 ledger
  const staveInnerWidth = internalW - 2 * stavLeftPad;

  const stave = new VF.Stave(stavLeftPad, staveTopY, staveInnerWidth);
  stave.addClef(clef === 'bass' ? 'bass' : 'treble');
  stave.setContext(ctx).draw();

  // Build the unified note list: every placement (with kind from marks if any),
  // plus every 'miss' from marks (as ghost notes the user didn't place).
  const placedKeys = new Set((pitches || []).map(pitchKey));
  const markMap = new Map();
  if (marks) for (const m of marks) markMap.set(pitchKey(m), m.kind);

  const items = [];
  for (const p of (pitches || [])) {
    items.push({ pitch: p, kind: markMap.get(pitchKey(p)) || 'placed' });
  }
  if (marks) {
    for (const m of marks) {
      if (m.kind === 'miss' && !placedKeys.has(pitchKey(m))) {
        items.push({ pitch: { step: m.step, octave: m.octave }, kind: 'miss' });
      }
    }
  }

  const noteXs = {};
  if (items.length > 0) {
    items.sort((a, b) => midiOf(a.pitch) - midiOf(b.pitch));

    const notes = items.map(({ pitch, kind }) => {
      const note = new VF.StaveNote({
        clef: clef === 'bass' ? 'bass' : 'treble',
        keys: [`${pitch.step.toLowerCase()}/${pitch.octave}`],
        duration: 'w',
      });
      if (kind === 'wrong') {
        note.setStyle({ fillStyle: '#a02020', strokeStyle: '#a02020' });
      } else if (kind === 'correct') {
        note.setStyle({ fillStyle: '#1e7a32', strokeStyle: '#1e7a32' });
      } else if (kind === 'miss') {
        // Ghost green — what the user should have placed.
        note.setStyle({ fillStyle: 'rgba(30,122,50,0.42)', strokeStyle: 'rgba(30,122,50,0.55)' });
      }
      return note;
    });

    // formatWidth in internal units → displayed ≈ value * SCALE.
    const formatWidth = Math.min(
      Math.max(items.length * 70 + 40, 120),
      staveInnerWidth - 80
    );
    const voice = new VF.Voice({ num_beats: notes.length, beat_value: 1 });
    voice.addTickables(notes);
    new VF.Formatter().joinVoices([voice]).format([voice], formatWidth);
    voice.draw(ctx, stave);

    // Each placed note's X in SVG-canvas (displayed) coords. +7 ≈ half a
    // whole-note head in internal units to land on the head's visual center,
    // then * SCALE to convert from internal to canvas.
    for (let i = 0; i < items.length; i++) {
      const midi = midiOf(items[i].pitch);
      noteXs[midi] = (notes[i].getAbsoluteX() + 7) * SCALE;
    }
  }

  // Return values in SVG-canvas units (post-scale) so mode-find.js can use
  // them directly against click coords without knowing about SCALE.
  return {
    bottomLineY: stave.getYForLine(4) * SCALE,
    stepPx: 5 * SCALE, // one diatonic step in canvas units
    svgWidth: width,
    svgHeight: height,
    noteXs,
  };
}

// Render N notes side-by-side on a single staff for Read Note's multi-note
// strip mode. All pitches must share the same clef. `currentIndex` is the
// note the user is currently answering — when N > 1, a small triangular
// caret is drawn under it as a positional cue (per the design decision to
// keep note heads black rather than recolor them). N == 1 falls through to
// a clean look identical to `renderNote` — no caret, no spreading.
function renderStrip(container, pitches, currentIndex) {
  container.innerHTML = '';
  if (!pitches || pitches.length === 0) return;

  const clef = pitches[0].clef === 'bass' ? 'bass' : 'treble';
  const width = Math.min((container.parentElement && container.parentElement.clientWidth - 20) || 480, 480);
  const height = 180;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new VF.Stave(10, 20, width - 20);
  stave.addClef(clef);
  stave.setContext(ctx).draw();

  const notes = pitches.map((p) => {
    const accChar = p.alter === 1 ? '#' : p.alter === -1 ? 'b' : '';
    const key = `${p.step.toLowerCase()}${accChar}/${p.octave}`;
    const note = new VF.StaveNote({ clef, keys: [key], duration: 'w' });
    if (p.alter !== 0) note.addModifier(new VF.Accidental(p.alter === 1 ? '#' : 'b'), 0);
    return note;
  });

  // ~80 px per note for spacing; capped so dense strips still fit narrow screens.
  const formatWidth = Math.min(Math.max(notes.length * 80 + 40, 120), width - 80);
  const voice = new VF.Voice({ num_beats: notes.length, beat_value: 1 });
  voice.addTickables(notes);
  new VF.Formatter().joinVoices([voice]).format([voice], formatWidth);
  voice.draw(ctx, stave);

  // Caret under the current note (multi-note only). Drawn as a raw SVG
  // <path> appended to the rendered SVG — VexFlow's SVGContext doesn't
  // expose a polygon helper and this avoids fighting its group structure.
  if (pitches.length > 1 && currentIndex >= 0 && currentIndex < notes.length) {
    const note = notes[currentIndex];
    const x = note.getAbsoluteX() + 7; // ~half a whole-note head
    const yBase = height - 10;          // caret base near bottom of canvas
    const yTip = yBase - 12;            // pointer extends up toward the staff
    const half = 7;
    const svg = container.querySelector('svg');
    if (svg) {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', `M ${x - half} ${yBase} L ${x + half} ${yBase} L ${x} ${yTip} Z`);
      pathEl.setAttribute('fill', '#7b8cff');
      svg.appendChild(pathEl);
    }
  }
}

// Render a grand staff (treble + bass joined by a brace) with one OR several
// chords side-by-side, for Harmony mode. `spec`:
//   { keySpec, chords:[{treble:[{step,octave}], bass:[{step,octave}]}, …],
//     activeIndex, marks }
// Legacy single-chord shape { keySpec, treble, bass, marks } is still accepted.
// - keySpec: a VexFlow major-key signature spec ('C','G','D',… 'Gb','Db','Ab','Eb','Bb','F').
//   Notes are passed by letter+octave only; the key signature implies their accidentals
//   (all chord tones here are diatonic to the key), matching real notation.
// - activeIndex: which chord the caret marks (multi-chord rounds only).
// - marks: 'correct' | 'wrong' | null — colors the active chord green / red for feedback.
//   Already-completed chords (index < activeIndex) render green; the rest black.
function renderHarmony(container, spec) {
  container.innerHTML = '';
  if (!spec) return;

  // Normalize to a multi-chord shape; legacy specs carry treble/bass at top level.
  const chords = spec.chords || [{ treble: spec.treble, bass: spec.bass }];
  const activeIndex = Number.isInteger(spec.activeIndex) ? spec.activeIndex : -1;
  const multi = chords.length > 1;

  const parentW = (container.parentElement && container.parentElement.clientWidth - 20) || 460;
  const width = Math.min(Math.max(parentW, 280), 480);
  const height = 230;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const staveX = 10;
  const staveW = width - 20;
  const treble = new VF.Stave(staveX, 10, staveW);
  treble.addClef('treble');
  const bass = new VF.Stave(staveX, 110, staveW);
  bass.addClef('bass');
  if (spec.keySpec && spec.keySpec !== 'C') {
    treble.addKeySignature(spec.keySpec);
    bass.addKeySignature(spec.keySpec);
  }
  treble.setContext(ctx).draw();
  bass.setContext(ctx).draw();

  // Brace on the left + barlines joining the two staves into a grand staff.
  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.BRACE).setContext(ctx).draw();
  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
  new VF.StaveConnector(treble, bass).setType(VF.StaveConnector.type.SINGLE_RIGHT).setContext(ctx).draw();

  const DONE = '#1e7a32', WRONG = '#a02020';
  const STEP_ORDER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  const rank = (n) => n.octave * 7 + STEP_ORDER[n.step];

  // Per-chord feedback color: completed chords green, the active chord green/red on
  // a mark, everything else black. Single-chord specs apply the mark to the one chord.
  function colorFor(i) {
    if (multi && i < activeIndex) return DONE;
    if (i === activeIndex || !multi) {
      if (spec.marks === 'correct') return DONE;
      if (spec.marks === 'wrong') return WRONG;
    }
    return null;
  }

  function chordNote(clef, notes, i) {
    const keys = notes
      .slice()
      .sort((a, b) => rank(a) - rank(b))
      .map((n) => `${n.step.toLowerCase()}/${n.octave}`);
    const sn = new VF.StaveNote({ clef, keys, duration: 'w' });
    const c = colorFor(i);
    if (c) sn.setStyle({ fillStyle: c, strokeStyle: c });
    return sn;
  }

  const tNotes = chords.map((ch, i) => chordNote('treble', ch.treble, i));
  const bNotes = chords.map((ch, i) => chordNote('bass', ch.bass, i));

  // beat_value:1 means one whole note per beat, so N whole-note chords = N beats.
  const count = chords.length;
  const tVoice = new VF.Voice({ num_beats: count, beat_value: 1 });
  tVoice.addTickables(tNotes);
  const bVoice = new VF.Voice({ num_beats: count, beat_value: 1 });
  bVoice.addTickables(bNotes);

  const formatW = multi
    ? Math.min(Math.max(count * 80 + 20, 120), staveW - 70)
    : Math.max(staveW - 90, 120);
  new VF.Formatter().joinVoices([tVoice]).joinVoices([bVoice]).format([tVoice, bVoice], formatW);
  tVoice.draw(ctx, treble);
  bVoice.draw(ctx, bass);

  // Caret under the active chord (multi-chord rounds only), mirroring renderStrip.
  if (multi && activeIndex >= 0 && activeIndex < tNotes.length) {
    const x = tNotes[activeIndex].getAbsoluteX() + 7;
    const yBase = height - 8;
    const yTip = yBase - 12;
    const half = 7;
    const svg = container.querySelector('svg');
    if (svg) {
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', `M ${x - half} ${yBase} L ${x + half} ${yBase} L ${x} ${yTip} Z`);
      pathEl.setAttribute('fill', '#7b8cff');
      svg.appendChild(pathEl);
    }
  }
}

// Render a harmonic dyad (two stacked whole notes) on a treble staff for
// Intervals mode. `notes` is [{step, octave, alter}, {step, octave, alter}],
// lower note first; alter ranges -2..2 (double flats/sharps allowed).
//
// The dyad is built as TWO voices formatted together rather than one two-key
// StaveNote: VexFlow only auto-displaces noteheads whose staff lines differ
// by exactly 0.5 (a second), so a unison inside a single chord note would
// draw both heads in the same spot. Joined voices go through the collision
// formatter, which x-shifts the second voice's head for unisons and seconds
// and leaves wider intervals stacked normally — so the lower note must be
// voice 1 (shifting the upper note right is the engraving convention).
const INTERVAL_ACC = { '-2': 'bb', '-1': 'b', '1': '#', '2': '##' };
function renderInterval(container, notes) {
  container.innerHTML = '';

  const width = Math.min(container.parentElement.clientWidth - 20, 480);
  const height = 180;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new VF.Stave(10, 20, width - 20);
  stave.addClef('treble');
  stave.setContext(ctx).draw();

  const mkVoice = (p) => {
    const acc = INTERVAL_ACC[String(p.alter || 0)] || '';
    const note = new VF.StaveNote({
      clef: 'treble',
      keys: [`${p.step.toLowerCase()}${acc}/${p.octave}`],
      duration: 'w',
    });
    if (acc) note.addModifier(new VF.Accidental(acc), 0);
    const voice = new VF.Voice({ num_beats: 1, beat_value: 1 });
    voice.addTickables([note]);
    return voice;
  };

  const lower = mkVoice(notes[0]);
  const upper = mkVoice(notes[1]);
  new VF.Formatter().joinVoices([lower, upper]).format([lower, upper], width - 80);
  lower.draw(ctx, stave);
  upper.draw(ctx, stave);
}

window.renderNote = renderNote;
window.renderInterval = renderInterval;
window.renderClefOnly = renderClefOnly;
window.renderFindStaff = renderFindStaff;
window.renderStrip = renderStrip;
window.renderHarmony = renderHarmony;
})();

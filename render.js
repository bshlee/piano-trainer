// VexFlow staff rendering for a single-note question.
// Exposes one function on window: renderNote(container, pitch).

(function () {
const VF = window.Vex.Flow;

function renderNote(container, pitch) {
  container.innerHTML = '';

  const width = Math.min(container.parentElement.clientWidth - 20, 480);
  const height = 180;

  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new VF.Stave(10, 20, width - 20);
  stave.addClef(pitch.clef === 'bass' ? 'bass' : 'treble');
  stave.setContext(ctx).draw();

  // VexFlow key format: "c/4", "c#/4", "cb/5"
  const accChar = pitch.alter === 1 ? '#' : pitch.alter === -1 ? 'b' : '';
  const key = `${pitch.step.toLowerCase()}${accChar}/${pitch.octave}`;

  const note = new VF.StaveNote({
    clef: pitch.clef === 'bass' ? 'bass' : 'treble',
    keys: [key],
    duration: 'w',
  });

  if (pitch.alter !== 0) {
    note.addModifier(new VF.Accidental(pitch.alter === 1 ? '#' : 'b'), 0);
  }

  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
  voice.addTickables([note]);

  new VF.Formatter().joinVoices([voice]).format([voice], width - 80);
  voice.draw(ctx, stave);
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

window.renderNote = renderNote;
window.renderClefOnly = renderClefOnly;
window.renderFindStaff = renderFindStaff;
window.renderStrip = renderStrip;
})();

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

  // Width: fill the parent (no cap). Re-rendered on resize.
  const parentW = (container.parentElement && container.parentElement.clientWidth) || 480;
  const width = Math.max(parentW - 16, 280);
  const height = 170; // ~50 above stave (room for E6) + 40 stave + ~70 below (room for C2)
  const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const staveTopY = 50;
  const stave = new VF.Stave(8, staveTopY, width - 16);
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

    // Tight clustering: ~70 px per note rather than spreading across the full
    // staff. Caps at the staff width so dense rounds still fit.
    const formatWidth = Math.min(Math.max(items.length * 70 + 40, 120), width - 100);
    const voice = new VF.Voice({ num_beats: notes.length, beat_value: 1 });
    voice.addTickables(notes);
    new VF.Formatter().joinVoices([voice]).format([voice], formatWidth);
    voice.draw(ctx, stave);

    // Record each placed note's X (SVG internal coords) so the drag preview
    // can align horizontally with the note it's modifying. +7 ≈ half a whole-
    // note head-width to land on the head's visual center.
    for (let i = 0; i < items.length; i++) {
      const midi = midiOf(items[i].pitch);
      noteXs[midi] = notes[i].getAbsoluteX() + 7;
    }
  }

  return {
    bottomLineY: stave.getYForLine(4),
    stepPx: 5, // VexFlow default: one diatonic step = 5px vertical
    svgWidth: width,
    svgHeight: height,
    noteXs,
  };
}

window.renderNote = renderNote;
window.renderClefOnly = renderClefOnly;
window.renderFindStaff = renderFindStaff;
})();

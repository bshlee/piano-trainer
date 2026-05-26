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

// Render a tall staff with the chosen clef and N placed pitches (whole notes,
// sorted by pitch, spread horizontally). VexFlow auto-draws ledger lines for
// notes off the staff. Returns {bottomLineY, stepPx, svgWidth, svgHeight} so
// the caller can map click Y → diatonic position.
//
// `pitches` is an array of { step, octave }.
// `marks` (optional) is an array of {step, octave, kind: 'correct'|'wrong'|'miss'}
//   that overrides per-note styling during post-submit feedback.
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

  if (pitches && pitches.length > 0) {
    const sorted = [...pitches].sort((a, b) => midiOf(a) - midiOf(b));

    const markMap = new Map();
    if (marks) for (const m of marks) markMap.set(pitchKey(m), m.kind);

    const notes = sorted.map(p => {
      const note = new VF.StaveNote({
        clef: clef === 'bass' ? 'bass' : 'treble',
        keys: [`${p.step.toLowerCase()}/${p.octave}`],
        duration: 'w',
      });
      const kind = markMap.get(pitchKey(p));
      if (kind === 'wrong') note.setStyle({ fillStyle: '#a02020', strokeStyle: '#a02020' });
      else if (kind === 'correct') note.setStyle({ fillStyle: '#1e7a32', strokeStyle: '#1e7a32' });
      return note;
    });

    const voice = new VF.Voice({ num_beats: notes.length, beat_value: 1 });
    voice.addTickables(notes);
    new VF.Formatter().joinVoices([voice]).format([voice], Math.max(width - 100, 120));
    voice.draw(ctx, stave);
  }

  return {
    bottomLineY: stave.getYForLine(4),
    stepPx: 5, // VexFlow default: one diatonic step = 5px vertical
    svgWidth: width,
    svgHeight: height,
  };
}

window.renderNote = renderNote;
window.renderClefOnly = renderClefOnly;
window.renderFindStaff = renderFindStaff;
})();

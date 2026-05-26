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

window.renderNote = renderNote;
window.renderClefOnly = renderClefOnly;
})();

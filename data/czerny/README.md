# Czerny Op. 139 data

Czerny mode (`mode-czerny.js`) fetches study scores from this folder at runtime:

- `NNN.musicxml` — one **uncompressed MusicXML** file per study (`001.musicxml` … `100.musicxml`).
  OSMD renders these; the cursor walks them for the play-along check.
- `index.json` — `[{ "n": 1, "title": "...", "measures": 16 }, ...]` driving the study picker.

These are **fetched over http**, so Czerny mode needs a real origin (the deployed Pages site, or
`python3 -m http.server` locally) — `file://` blocks the fetch.

## Generating the files

Run the offline splitter on a combined Op. 139 MusicXML:

```sh
node tools/split-czerny.mjs <combined.musicxml> --out data/czerny --by attributes
# or, with hand-checked study boundaries (1-based starting measure of each study):
node tools/split-czerny.mjs <combined.musicxml> --out data/czerny --by map --map boundaries.json
```

## Current state

`001.musicxml` is the sample MusicXML provided so far (`CZERNY/1780848490171722_716.musicxml`):
a ~160-measure, 2-part, music21-processed export with **no per-study delimiters and no tempo
marks** — so it is **not** the full, cleanly-split 100 studies. It's wired up as a single
playable "study 1" so the engine is usable end-to-end. To get all 100 individually, supply a
properly delimited Op. 139 MusicXML and run the splitter (verify the split renders in the browser).

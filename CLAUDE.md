# JamDraw: notes for Claude

A vector drawing PWA by Jimmy Jam Studio (the owner, James Caldwell, "Jimmy FNC"), built to draw the studio logo with a PC drawing tablet
and a Galaxy S25 Ultra's S Pen. Plain HTML/CSS/JS modules, no build step, no framework. See README.md for features and
layout, CHANGELOG.md for history.

## Rules

- **Keep it simple.** Web only on purpose: one installable PWA covers desktop and phone (the owner decided against
  Godot or native ports). No build step; libraries are vendored in `vendor/` with their licenses.
- **Phone and PC equally.** Test both layouts: 1280x800 and 384x832 @ 2.8125 (the owner's phone). Under 820 px the tools
  sit at the bottom and the panels are sheets.
- **Bump `VERSION` in sw.js** whenever files change, and list new files in its `FILES`, or installed copies keep old ones.
- **Every change gets a CHANGELOG.md entry** (`## X.Y.Z - date`, Added / Changed / Fixed, written so the owner can
  follow it) and the version in package.json. 0.x until the owner calls it 1.0.
- **Run `npm test -- --min=100`** before committing: every suite in tests/ and 100% line coverage of js/. New code
  gets checks in the right suite (or a new `suite-N-name.cjs`); code no test can reach is usually dead and goes. Helpers
  are on the `t` object in tests/run.cjs (`add` shapes, `V` drawing-to-screen, `pointer` for pen and touch,
  `bootWith` to start with broken storage, `stopServer` for offline). Paper.js gotchas the tests caught: segment
  handles are live objects (clone before changing), open paths need `trace: false` in boolean ops, moving a layer
  changes the active one, a CompoundPath fill hit has no point.
- **Fonts:** only free-for-commercial-use fonts (OFL, Apache) go in the library; add them in `tools/fetch-fonts.mjs`
  and run `npm run fonts`, which rewrites `fonts/fonts.json` and `fonts/LICENSES.md`.
- Repo: `JimmyJamStudio/JamDraw`, **public** since 2026-10-19 (MIT, as-is; copyright James Caldwell until Jimmy FNC LLC
  is formed and the IP is assigned to it). Hosted at https://jimmyjamstudio.com/draw/ by the studio site
  (`JimmyJamStudio/website`, whose `tools/build.py` copies this repo's runtime files into `dist/draw/`).

## How it works

- Paper.js holds the drawing (`paper.project`, layers = paper Layers). The overlay canvas (`#overlay`) draws selection
  and previews in screen space; the page and the sketch are HTML elements lined up with the view (`view.js changed()`).
- Pointer input is ours (`main.js`), not Paper's tools: pen pressure, coalesced events, pinch, palm rejection
  (`S.sawPen`). Tools in `tools.js` get `{ pt, vp, pressure, shift, alt, ctrl, pointerType, detail }`.
- Undo is whole-drawing JSON snapshots (`history.js commit()` after every finished change).
- Text items are `CompoundPath`s with `applyMatrix = false` and `data.text`; `setTextData` re-lays them, `bake()` turns
  them into plain shapes (done automatically before combine, outline, erase and point editing).
- Ink brush strokes work the same way (`ink.js`): `applyMatrix = false` and `data.ink = { spine, r }` (middle line and
  widths, in the stroke's own coordinates). The Points tool edits a temporary spine path (`spineOf`, not in the
  project, so undo snapshots never hold it) and `rebuildInk` replaces the stroke after each change. Merge, erase,
  combine and outline bake them into plain shapes.
- Symbols (`symbols.js`) are Paper `SymbolItem`s sharing a `SymbolDefinition` (`definition.item.data.symbol` =
  `{ id, name }`). Editing puts the drawing on a layer with `data.symbolEdit` and hides the copy (`data.symbolEditing`);
  both live in the project, so undo and autosave carry them. `editableLayer` allows only that layer meanwhile. Hit
  tests inside a copy run on its drawing (no layer) before reporting the copy, so `match` lets layerless items through
  and the result is checked after. Exports `expandAll` copies into plain shapes; paste `relink`s copies by id.
- Exports clone the visible items into a group and build the SVG document ourselves (`export.js buildSVG`), stripping
  Paper's invalid placeholder attributes (they broke PDF export).
- Pixels to shapes (`trace.js`): the fill bucket rasterizes the visible drawing (`exportItems` + Paper `rasterize`),
  flood-fills with gap closing (`areaAt`), and Auto trace labels the sketch's pixels by its main colors
  (`store.js sketchColors`). Both turn masks into curves with `traceMask`: pixel-edge outlines, corners kept sharp,
  runs between corners fitted with Paper's `simplify` (fitting a whole closed loop at once collapses small loops).

## Gotchas

- Windows: don't patch JS through PowerShell strings or `sed` with backticks; use the Edit tool or a Node script.
- GNU tar (Git Bash) reads `C:` in a path as a host name; run it with relative paths (fetch-fonts does).
- Chrome opens PDF blobs in its viewer, so PDFs are downloaded as `application/octet-stream`.

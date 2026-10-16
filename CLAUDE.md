# JamDraw: notes for Claude

A vector drawing PWA by Jimmy Jam Studio (the owner, Jimmy FNC), built to draw the studio logo with a PC drawing tablet
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
- **Run `npm test`** (tests/browser-test.cjs, headless Chrome) before committing; add checks for new features.
- **Fonts:** only free-for-commercial-use fonts (OFL, Apache) go in the library; add them in `tools/fetch-fonts.mjs`
  and run `npm run fonts`, which rewrites `fonts/fonts.json` and `fonts/LICENSES.md`.
- Repo: `JimmyJamStudio/JamDraw`, private until the owner decides to publish it (MIT, as-is). If it goes public, the
  plan is jimmyjamstudio.com/draw.

## How it works

- Paper.js holds the drawing (`paper.project`, layers = paper Layers). The overlay canvas (`#overlay`) draws selection
  and previews in screen space; the page and the sketch are HTML elements lined up with the view (`view.js changed()`).
- Pointer input is ours (`main.js`), not Paper's tools: pen pressure, coalesced events, pinch, palm rejection
  (`S.sawPen`). Tools in `tools.js` get `{ pt, vp, pressure, shift, alt, ctrl, pointerType, detail }`.
- Undo is whole-drawing JSON snapshots (`history.js commit()` after every finished change).
- Text items are `CompoundPath`s with `applyMatrix = false` and `data.text`; `setTextData` re-lays them, `bake()` turns
  them into plain shapes (done automatically before combine, outline, erase and point editing).
- Exports clone the visible items into a group and build the SVG document ourselves (`export.js buildSVG`), stripping
  Paper's invalid placeholder attributes (they broke PDF export).

## Gotchas

- Windows: don't patch JS through PowerShell strings or `sed` with backticks; use the Edit tool or a Node script.
- GNU tar (Git Bash) reads `C:` in a path as a host name; run it with relative paths (fetch-fonts does).
- Chrome opens PDF blobs in its viewer, so PDFs are downloaded as `application/octet-stream`.

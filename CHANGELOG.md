# Changelog

## 0.4.1 - 2026-10-19

JamDraw is public, and online at https://jimmyjamstudio.com/draw/.

### Changed
- The repository is public under JimmyJamStudio. The license's copyright holder is James Caldwell (was "Jimmy FNC",
  a handle rather than a legal name; it moves to Jimmy FNC LLC once the company exists).
- README links the hosted copy.

## 0.4.0 - 2026-10-16

Exact sizes and snapping, for lining things up (a pair of eyes that match).

### Added
- **Position and size** (top of the Style panel, `js/transform.js`): X, Y, W, H and Angle of the selection in drawing
  units, following along live while you drag. Type a number and press Enter (or leave the box). The lock keeps
  proportions when changing W or H (on by default). Angle is kept per shape (`data.angle`): the rotate handle and
  the box both update it, Flip mirrors it, several shapes at different angles show 0 and a new angle turns each by
  that much. A straight line has no width or height to scale, and says so.
- **Snapping** (`js/snap.js`, on by default): moving, scaling from a handle, drawing shapes, placing pen points and
  dragging points or whole paths snap edges and centers to the page's edges and center and to other shapes' edges
  and centers, within 7 screen pixels, with pink guide lines. **Hold Ctrl while dragging to place freely.**
- **Grid** (off by default, any size from 2 to 1024): drawn over the page when it's at least 6 screen pixels apart,
  and things snap to it as well. Snap and grid settings are saved with the drawing.

### Fixed
- After clicking a checkbox, keyboard shortcuts stayed off until you clicked somewhere else; only typing in a box
  pauses them now.

### Tests
- `suite-10-transform.cjs`: every box, the lock, angles, flat lines, live updates, and snapping for move, scale,
  shapes, pen, points and paths, Ctrl, page center, grid on its own, grid limits, saved settings. 100% coverage kept.

## 0.3.0 - 2026-10-16

Tests for everything (100% coverage), and the bugs they found.

### Fixed
- **The eraser deleted a whole line when you erased part of it.** Paper.js returns nothing when an open path is cut
  the normal way; lines now use `trace: false` and keep both ends (also lines already cut once).
- **Smooth points kinked when you dragged a handle.** Paper's handle objects are live, so "was it smooth?" was checked
  against the new position; the old handle is copied first now. Alt still breaks a point on purpose.
- **From the second text on, typing went to the shortcuts** (the "a" in "Jam" switched to the Points tool). With the
  font already loaded, the panel focused its box before the browser finished the click, which then took focus back;
  canvas clicks no longer move focus.
- **Shortcuts didn't work while the text panel was open,** even outside its boxes. Only pop-up dialogs block them now.
- **Moving a layer up or down made a different layer active.**
- **Cancel on a text whose font is gone crashed;** Cancel now puts back the exact outlines, no font needed.
- **Clicking inside a compound shape with Points always picked its first piece.**
- **PDF export stayed broken for the session if its tools failed to load once** (offline); the next try loads them.
- **A file that couldn't be read failed silently;** it says so now. Copying SVG when the browser blocks it says to use
  Export instead.
- Font previews follow your text as you type.

### Changed
- Dead code removed (a dozen checks for situations the app can't get into, unused helpers); the file-name rule lives
  in one place (`fileName` in state.js); export clones carry their layer's opacity.

### Tests
- `tests/run.cjs` runs every `tests/suite-*.cjs` from a fresh drawing and reports V8 block coverage for each file in
  js/ (snapshotted before every reload, since Chrome drops counts on navigation), with the exact code any test missed.
  `--only=name`, `--min=100`. 375+ checks, about 1.5 minutes: select, actions, tools, interface, files, text,
  export and phone suites, plus failure cases (blocked storage, failing database, missing fonts, the PDF tools not
  loading, a refused image) and working offline with the server switched off.

## 0.2.0 - 2026-10-16

Text with a font library, and proper export.

### Added
- **Text tool (T).** Tap the page to add text, tap a text (or double-click it with Select) to change it. The panel has
  the text, size, letter spacing (thousandths of an em), line height and left / center / right alignment, and changes
  show live on the page; Done keeps them (`Ctrl+Enter`), Cancel or `Esc` puts things back. New text uses the Fill color
  and the last font and settings you used (`S.text`).
- **Text is vector outlines from the start** (`js/text.js`): opentype.js reads the font and the glyph outlines go into a
  `CompoundPath` with `applyMatrix` off, so the layout stays editable while moves, scales and turns live in its matrix;
  re-laying keeps the text anchored by its alignment (left edge, center or right edge). Exports never depend on the
  font being installed anywhere.
- **Text to shapes** (Select options): plain shapes for point editing. Done for you, with a note, before combining,
  outlining, erasing or point-editing a text.
- **Font library: 66 families, 81 styles**, all free for commercial use (76 OFL-1.1, 5 Apache-2.0), Latin characters,
  WOFF, 2.6 MB, loaded only when used. Groups: Bubbly (Lilita One, Titan One, Fredoka, Luckiest Guy...), Display
  (Bungee, Orbitron, Monoton, Press Start 2P...), Handwritten, Spooky (Creepster, Nosifer...), Fantasy (Cinzel, Uncial
  Antiqua, MedievalSharp, UnifrakturMaguntia...), Sans and Serif. The font browser searches, filters by group and
  shows each font's name in itself, written with your own text. `tools/fetch-fonts.mjs` (`npm run fonts`) rebuilds
  `fonts/`, `fonts/fonts.json` and `fonts/LICENSES.md` (with each font's attribution) from Fontsource.
- **Load your own font** (TTF, OTF, WOFF; not WOFF2). It's kept in the browser (IndexedDB) under the Yours group.
- **Export dialog (`Ctrl+E`)** (`js/export.js`): SVG, PNG, JPG, WebP or PDF; the whole page, the selection only, or
  trimmed to the drawing, with padding; any width (presets 256 to 4096) with the height shown; background same as the
  page, transparent, white or a color; JPG / WebP quality; SVG decimals; Copy SVG; a size estimate. Settings are
  remembered. The File menu keeps quick SVG and PNG 1024 exports.
- **PDF export** with jsPDF + svg2pdf.js, loaded only when you export a PDF; vector, page size = export area in points.
- **`npm test`** (`tests/browser-test.cjs`, puppeteer-core): every tool, text and fonts, combine, outlines, undo,
  autosave, all five export formats (checking the files) and the phone layout, 50+ checks.

### Fixed
- **Cleaner SVG.** Paper.js writes placeholder attributes on groups (`stroke-width="none"`, `font-size="none"`, an empty
  `stroke-dasharray`, `mix-blend-mode: normal`) that aren't valid SVG; they're stripped on export. `stroke-width="none"`
  made PDF conversion fail.
- **PDFs download** instead of opening in the browser's viewer (saved as a plain download).
- **A slow export can't close a newer dialog.** The Export button says "Exporting…" while it works, and only closes
  the dialog it came from.
- Phones: the top bar fits (zoom buttons hide, the zoom level stays), and tool option buttons no longer squash together.

## 0.1.0 - 2026-10-16

First version.

### Added
- Pen, pressure brush (Ink: filled outlines whose width follows the pen, fitted to curves; Merge joins touching
  strokes of the same color; Line: plain stroked lines), eraser (cuts shapes and lines), shapes (rectangle with corner
  radius, ellipse, polygon, star), eyedropper, hand.
- Select: move, scale from 8 handles (Shift keeps proportions), rotate just outside a corner (Shift snaps 15°),
  Alt-drag to copy, marquee. Point editing: drag points and handles (smooth points stay smooth unless Alt), Alt-click a
  line to add a point, double-click for smooth or corner, delete points.
- Combine (unite, subtract, intersect, exclude), outline stroke, sticker outline (paperjs-offset), arrange, group,
  flip, align (to each other or the page).
- Layers, a sketch image to trace (opacity, size, move), fill and stroke colours, hex input, swatches.
- Undo / redo by snapshots, autosave in IndexedDB, `.jamdraw` files, open and place SVG, SVG and PNG export.
- Pointer input for mouse, tablets and phones: coalesced pen events for smooth strokes, pinch zoom, palm rejection once
  a pen is used. Desktop and phone layouts. Installable and offline (manifest, service worker).

# Changelog

## 0.11.0 - 2026-10-26

Brush strokes you can reshape.

### Added
- **Editable ink:** an Ink brush stroke now keeps its middle line and its widths. With the Points tool (A), click a
  stroke to see the points of its middle line; drag a point or a curve handle and the whole stroke bends with it,
  keeping its taper and pressure. Alt-click adds a point, double-click (or Smooth / Corner) changes a point, Delete
  removes points. It works after moving, turning, sizing or tilting the stroke too.
- With a stroke selected, switching to the Points tool opens it straight away.

### Changed
- A stroke becomes a plain shape (no longer editable this way) when it's merged with another (Merge), erased,
  combined or outlined. Turn Merge off in the brush options to keep every stroke editable.
- The brush's shape code moved into its own file (`js/ink.js`).

## 0.10.0 - 2026-10-25

Drawing like on paper: turn the page, and let rough shapes come out clean.

### Added
- **Turn the view:** `,` and `.` (or the turn buttons next to zoom, or twisting two fingers on the phone) turn the
  page on screen, the way you turn paper to draw a curve comfortably. The drawing itself doesn't turn. While it's
  turned a badge shows the angle; tap it to straighten (`0` fits the page and straightens it too). Selecting,
  panning, the grid, guides and every tool work as usual in a turned view.
- **Shape assist** (brush, on by default, under More…): draw a rough line, circle, ellipse or arc and hold still for
  a moment at the end; it turns into a clean one (you see it before you lift). Nearly round becomes a perfect
  circle. Keep moving instead and it carries on freehand. In Ink mode a circle becomes an exact ring with no seam; in
  Line mode an exact ellipse.

## 0.9.0 - 2026-10-25

Tracing paper, colors from Auto trace, and the loose ends from the review.

### Added
- **Tracing paper** (the page button on each layer in Layers): shows that layer faded and a little soft, like a
  drawing under a sheet of paper, and locks it. Add a layer above (+ Layer) and ink over it. Tracing paper is a guide:
  exports leave it out, and the fill bucket only sees your own lines. Click again to take the paper off.
- **Auto trace adds its colors to the swatches** when you keep it (the ones not there yet), ready for inking and
  filling.

### Fixed
- **Auto trace could stop at "Tracing…"** on some pictures (the mascot at High detail among them): a shape with
  just one sharp corner late in its outline crashed the curve fitting. Since 0.6.0; fixed, with a test.
- **New text lands where you tap:** its middle for centered text (its left or right edge for left or right
  aligned), half way down the line. It used to start from its top left corner and then grow from its middle.
- **The magnet near big solid black areas** (hair, a dark hoodie) pulled lines into the middle of them; it now pulls
  onto their edge. Thin lines work as before.
- **On the phone every tool fits across the bottom,** no scrolling to reach the last ones. Hand is left out there
  (two fingers always pan).
- **Undo keeps fewer steps for very big drawings** (at least 10), so it can't use up a phone's memory. A drawing like
  the traced mascot still keeps all 120.

## 0.8.0 - 2026-10-25

Tilting shapes in 3D, for things seen at an angle (the mascot's headphones).

### Added
- **Tilt ↔ and Tilt ↕** (Position and size, under Angle, 0 to 85 degrees): turn the selection away from you as if it
  were a flat card in 3D. Tilt ↔ turns it round its up-down line (a circle becomes a narrower ellipse, like a
  headphone seen from the side); Tilt ↕ round its left-right line (like a plate seen from above). Use Angle to point
  it any way. Everything selected tilts together, so the strawberry on an earcup tilts with it. Each shape remembers
  its tilt: typing a new one replaces the old (back to 0 undoes it), and several shapes at different tilts show 0
  and all go to a new one. Outlines keep their thickness.

## 0.7.0 - 2026-10-25

How the brush feels: steadier lines, a magnet for tracing, and pressure the way you like it.

### Added
- **Steady** (brush options, 0 to 10): the line trails the pointer on an invisible string (shown while drawing), so
  shaky bits shorter than the string never reach the line; when you lift, the line catches up to the pen. On a
  test line it took out two thirds of the wobble. Great for drawing with a mouse.
- **Magnet** (brush options): with a sketch loaded, your strokes are pulled onto the middle of the sketch's dark
  lines as you trace over them. Points within about 14 screen pixels of a line are drawn onto it; elsewhere you draw
  as usual. Hold Ctrl to draw freely. How strongly it pulls is under More… (70% by default, 100% lands right on the
  line).
- **More…** next to the brush options: Smooth (moved here), pressure **feel** (Soft needs a lighter touch for a full
  line, Firm a heavier one), **Thinnest %** (how thin a light touch gets; 100% turns pressure off for width), and
  **Taper ends without pressure** (mouse strokes, or with Pressure off, start and end thin).

### Fixed
- **The canvas jumped up and down when switching tools.** Some tools' options didn't fit at 1280 pixels wide and
  got a scrollbar; long hints now end in "…" (hover for the whole hint), so every tool's options fit and the canvas
  stays put.

## 0.6.0 - 2026-10-25

Coloring in, and turning pictures into shapes.

### Added
- **Fill bucket (G):** ink your lines, then tap inside an area to fill it with the Fill color, like coloring in. The
  fill goes under the lines (at the bottom of the active layer, or just above the fill you tapped, to recolor it)
  and tucks a little under them so no white seam shows. **Close gaps** (in its options) bridges small gaps in
  hand-drawn lines; an area that still isn't closed says so instead of flooding the page. Every fill is an
  ordinary shape you can select, recolor or edit.
- **Auto trace** (Sketch to trace): turns the sketch into vector shapes on a new layer named "Trace", lined up
  exactly over it. **Colors** gives one shape per main color, biggest at the bottom, each tucked under the ones above
  so no seams show, with the paper color left out if you like; **Ink only** traces everything darker than a setting
  (for pen-on-paper drawings). Detail (Low, Medium, High), Smooth and Ignore specks, all with a live preview; Trace
  keeps it (undo takes it back), Cancel or Esc takes it away. Settings are remembered. The mascot traces at High
  detail in about a second and a half, all nine colors.
- The shape outlines from both keep real corners sharp (letters, toast corners) and curves smooth.

### Changed
- Pop-up panels block keyboard shortcuts while open (the Auto trace panel too, not just the export dialog).

## 0.5.0 - 2026-10-25

Getting ready to redraw the mascot: the sketch helps more, and two fixes from a hands-on review.

### Added
- **Get colors** (Sketch to trace): adds the sketch's main colors to the swatches in one go. It skips the in-between
  colors where two areas meet, and keeps small colors that stand out, like a green leaf or toast brown. On the
  mascot it finds all ten: cream, red, blue, skin, white, black, trouser grey, jam pink, brown and green.
- **The eyedropper picks colors from the sketch:** tap the sketch (anywhere no shape is on top) and its color goes
  into Fill or Stroke, whichever the color panel is on.
- **Turn** and **Flip** for the sketch: straighten a photo of a drawing, or mirror it. Both are saved with the drawing.

### Fixed
- **A brush stroke that merged into a shape jumped it to the front.** Touching up a dark sticker outline with a dark
  brush put the whole outline on top and turned the drawing black. The merged shape now stays where the shape it
  joined was.
- **Sticker outline left holes:** the insides of letters (o, d, A), a gap cut by the eraser, and tiny specks where
  shapes met showed through in white. The outline is now solid, as a sticker should be.
- **Sticker outline now goes around strokes,** so it sticks out by its full width past a shape's outline, not half
  hidden under it.

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

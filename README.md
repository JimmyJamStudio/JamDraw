# JamDraw

A friendly vector drawing app that runs in the browser and installs like an app on desktop and phone. Made by
Jimmy Jam Studio to draw our own logo and art; offered as-is, free to use (MIT).

- **Draw:** pen tool (click corners, drag curves), a pressure brush for drawing tablets and phone pens that turns
  strokes into clean vector shapes (Merge joins touching strokes into one), a Line brush, an eraser that cuts through
  shapes, and shapes (rounded rectangles, ellipses, polygons, stars)
- **Brush feel:** Steady (the line trails the pointer on a string, smoothing out wobbles, great with a mouse), a
  Magnet that pulls your strokes onto the sketch's lines as you trace (Ctrl to draw freely), and under More…:
  pressure feel (Soft, Normal, Firm), the thinnest a pressure line gets, and tapered ends for strokes without pressure.
  **Shape assist:** hold still at the end of a stroke and a rough line, circle, ellipse or arc becomes a clean one.
  Turn the view like a sheet of paper for comfortable strokes
- **Color it in:** a fill bucket: tap inside an area closed by lines and it fills with a flat color, tucked under
  the lines, bridging small gaps (Close gaps). **Auto trace** turns the sketch into vector shapes on a new layer:
  one shape per main color (or just the dark ink), with a live preview and settings for colors, detail, smoothing
  and specks
- **Text with a font library:** 66 families / 81 styles bundled, sorted into Bubbly, Display, Handwritten, Spooky,
  Fantasy, Sans and Serif, every one free for commercial use (OFL or Apache, `fonts/LICENSES.md`); load your own
  TTF, OTF or WOFF too. Text is real vector outlines from the start, stays editable (font, size, spacing, lines,
  alignment) and turns into plain shapes for point editing
- **Exact and lined up:** X, Y, width, height and angle boxes for the selection (with a lock for proportions), and
  a 3D tilt (a circle turned away becomes the ellipse of a headphone seen from the side; everything selected tilts
  together, so a logo on it tilts too);
  snapping to the page's edges and center and to other shapes' edges and centers, with pink guides, plus an optional
  grid; hold Ctrl while dragging to place freely
- **Edit:** move, scale, rotate, flip, group, arrange, point and curve-handle editing (brush strokes too: the Points
  tool reshapes a stroke's middle line and it keeps its widths), combine shapes (unite,
  subtract, intersect, exclude), outline a stroke, and **Sticker outline** (one solid outline under the selection: the
  cartoon-logo look), align to each other or to the page
- **Symbols:** use one drawing in many places (the cap in every pose): duplicate a symbol for more copies, double-click
  one to edit it, and every copy changes; Unlink turns a copy back into ordinary shapes
- **Organise:** layers (show, hide, lock, rename, reorder, and **Tracing paper**: a layer shown faded and soft, as if
  under a sheet of paper, to ink over on a layer above; left out of exports and fills), a sketch to trace under the
  page (move, size, turn, flip;
  pick its colors with the eyedropper or add its main colors to the swatches in one go), fill and stroke colors
  with saved swatches, undo and redo
- **Export:** SVG, PNG, JPG, WebP and PDF, of the whole page, the selection or the drawing trimmed to its edges, any
  size, transparent or with a background; copy SVG code; `.jamdraw` files keep everything editable
- **Anywhere:** mouse and keyboard, drawing tablets (pressure through Windows Ink), phones and their pens, fingers
  (pinch to zoom; once a pen has been used, fingers only pan, so your palm can rest on the screen). Saves itself in the
  browser and works offline once installed
- Plain HTML, CSS and JavaScript modules: no build step, no framework, no server

**Use it now:** https://jimmyjamstudio.com/draw/ (installs like an app; works offline).

## Run it

```
node serve.mjs        # or: npm start
```

Open http://localhost:5173. In Chrome or Edge, **Install app** (address bar) gives it its own window and offline use.
On a phone, open a hosted copy and use **Add to Home screen**.

**Drawing tablets on Windows:** pressure reaches the browser through Windows Ink. If brush lines all come out the same
width, turn on *Use Windows Ink* in the tablet's settings (Wacom: Wacom Tablet Properties › Mapping), and check that
*Pressure* is on in the Brush options.

## Shortcuts

| Keys | Does |
| --- | --- |
| `V` `A` `P` `B` `E` `R` `G` `T` `I` `H` | Select, points, pen, brush, eraser, shapes, fill, text, pick color, pan |
| Space + drag, middle mouse, two fingers | Pan |
| Wheel, pinch, `+` `-` | Zoom; `0` fits the page (and straightens it), `1` is 100% |
| `,` `.`, twist two fingers | Turn the view (like turning paper), tap the angle badge to straighten |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+C` `X` `V` `D` | Copy, cut, paste, duplicate |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `[` `]`, `Ctrl+[` `Ctrl+]` | Backward, forward; to back, to front |
| Arrows | Nudge (Shift: 10x) |
| Ctrl + drag | Place freely, without snapping |
| `X` | Swap fill and stroke |
| `Ctrl+S` / `Ctrl+E` | Save a .jamdraw file / Export |
| Double-click a text | Edit it (`Ctrl+Enter` done, `Esc` cancel) |

The `?` button in the app shows these too.

## Test

```
npm install                  # once: puppeteer-core, to drive Chrome
npm test                     # 450+ checks in headless Chrome, then code coverage for every file in js/
npm test -- --only=text      # just the suites whose name contains "text"
npm test -- --min=100        # also fail if any file's coverage drops under 100%
```

The suites (`tests/suite-*.cjs`, run by `tests/run.cjs`) drive the real app with the mouse, keyboard, a simulated pen
with pressure and two-finger touch: every tool and option, text and fonts, combining and outlines, layers, swatches,
menus and dialogs, saving and opening files, all five export formats, the phone layout, and working offline with the
server switched off. They also break things on purpose (blocked storage, a failing database, fonts that won't load,
an image too big for the browser, the PDF tools failing to load) to check the app says so and carries on.
**Every line in `js/` is run by the tests (100% coverage);** when a few lines are missed the report shows exactly which
code. `CHROME_PATH` picks the browser; screenshots, exported files and `coverage.json` go to a temp folder (printed).

## Project layout

| Path | What |
| --- | --- |
| `index.html`, `css/app.css` | The page and its look (desktop: side panels; under 820 px: tools at the bottom, panels as sheets) |
| `js/main.js` | Boot, pointer input (mouse, pen, touch, pinch, palm rejection), keyboard shortcuts |
| `js/tools.js` | The tools: select, points, pen, brush, eraser, shapes, text, eyedropper, hand |
| `js/snap.js`, `js/transform.js` | Snapping and guides; the Position and size boxes |
| `js/trace.js` | Pixels to shapes: outlines of pixel areas fitted to curves, the fill bucket, Auto trace and its panel |
| `js/ink.js` | Brush strokes as shapes: pressure outlines, taper, and editable ink (a stroke's middle line and widths) |
| `js/symbols.js` | Symbols: making them, editing one (every copy changes), unlinking, and drawing copies as shapes for export |
| `js/actions.js` | Things done to the selection: arrange, group, align, combine, outline stroke, sticker outline |
| `js/text.js`, `js/textui.js` | Fonts and text layout (opentype.js), the text panel and font browser |
| `js/export.js` | Export dialog and SVG / PNG / JPG / WebP / PDF output |
| `js/store.js` | Autosave (IndexedDB), .jamdraw files, opening and placing SVGs, the sketch |
| `js/view.js`, `js/history.js`, `js/state.js` | Zoom and pan, undo, shared state |
| `fonts/` | The font library (`npm run fonts` rebuilds it from `tools/fetch-fonts.mjs`) |
| `vendor/` | Bundled libraries and their licenses |
| `sw.js`, `manifest.webmanifest` | Offline and install; bump `VERSION` in sw.js when files change |

See CHANGELOG.md for what changed.

## Credits

- [Paper.js](http://paperjs.org) (MIT): the vector engine, shape combining, curve fitting
- [paperjs-offset](https://github.com/glenzli/paperjs-offset) (MIT): outline stroke and sticker outlines
- [opentype.js](https://opentype.js.org) (MIT): reading fonts into outlines
- [jsPDF](https://github.com/parallax/jsPDF) and [svg2pdf.js](https://github.com/yWorks/svg2pdf.js) (MIT): PDF export
- Fonts from [Google Fonts](https://fonts.google.com) via [Fontsource](https://fontsource.org) (OFL-1.1 and Apache-2.0)
- Tool icons adapted from [Lucide](https://lucide.dev) (ISC)

License texts for the libraries are in `vendor/`, for the fonts in `fonts/licenses/`.

© 2026 James Caldwell. MIT licensed (LICENSE).

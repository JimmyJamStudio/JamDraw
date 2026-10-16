# JamDraw

A friendly vector drawing app that runs in the browser and installs like an app on desktop and phone. Made by
Jimmy Jam Studio to draw our own logo and art; offered as-is, free to use (MIT).

- **Draw:** pen tool (click corners, drag curves), a pressure brush for drawing tablets and phone pens that turns
  strokes into clean vector shapes (Merge joins touching strokes into one), a Line brush, an eraser that cuts through
  shapes, and shapes (rounded rectangles, ellipses, polygons, stars)
- **Text with a font library:** 66 families / 81 styles bundled, sorted into Bubbly, Display, Handwritten, Spooky,
  Fantasy, Sans and Serif, every one free for commercial use (OFL or Apache, `fonts/LICENSES.md`); load your own
  TTF, OTF or WOFF too. Text is real vector outlines from the start, stays editable (font, size, spacing, lines,
  alignment) and turns into plain shapes for point editing
- **Edit:** move, scale, rotate, flip, group, arrange, point and curve-handle editing, combine shapes (unite,
  subtract, intersect, exclude), outline a stroke, and **Sticker outline** (one solid outline under the selection: the
  cartoon-logo look), align to each other or to the page
- **Organise:** layers (show, hide, lock, rename, reorder), a sketch to trace under the page, fill and stroke colors
  with saved swatches, undo and redo
- **Export:** SVG, PNG, JPG, WebP and PDF, of the whole page, the selection or the drawing trimmed to its edges, any
  size, transparent or with a background; copy SVG code; `.jamdraw` files keep everything editable
- **Anywhere:** mouse and keyboard, drawing tablets (pressure through Windows Ink), phones and their pens, fingers
  (pinch to zoom; once a pen has been used, fingers only pan, so your palm can rest on the screen). Saves itself in the
  browser and works offline once installed
- Plain HTML, CSS and JavaScript modules: no build step, no framework, no server

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
| `V` `A` `P` `B` `E` `R` `T` `I` `H` | Select, points, pen, brush, eraser, shapes, text, pick color, pan |
| Space + drag, middle mouse, two fingers | Pan |
| Wheel, pinch, `+` `-` | Zoom; `0` fits the page, `1` is 100% |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+C` `X` `V` `D` | Copy, cut, paste, duplicate |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `[` `]`, `Ctrl+[` `Ctrl+]` | Backward, forward; to back, to front |
| Arrows | Nudge (Shift: 10x) |
| `X` | Swap fill and stroke |
| `Ctrl+S` / `Ctrl+E` | Save a .jamdraw file / Export |
| Double-click a text | Edit it (`Ctrl+Enter` done, `Esc` cancel) |

The `?` button in the app shows these too.

## Test

```
npm install           # once: puppeteer-core, to drive Chrome
npm test              # every tool, text and fonts, undo, autosave, all five exports, the phone layout
```

`CHROME_PATH` picks the browser if Chrome isn't in the usual place. The test prints where it left its screenshots and
exported files.

## Project layout

| Path | What |
| --- | --- |
| `index.html`, `css/app.css` | The page and its look (desktop: side panels; under 820 px: tools at the bottom, panels as sheets) |
| `js/main.js` | Boot, pointer input (mouse, pen, touch, pinch, palm rejection), keyboard shortcuts |
| `js/tools.js` | The tools: select, points, pen, brush, eraser, shapes, text, eyedropper, hand |
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

© 2026 Jimmy FNC. MIT licensed (LICENSE).

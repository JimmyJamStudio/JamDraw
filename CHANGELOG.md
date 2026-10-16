# Changelog

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

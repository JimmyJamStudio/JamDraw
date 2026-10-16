# JamDraw

A friendly vector drawing app that runs in your browser and installs like an app on desktop and phone.
Made by Jimmy Jam Studio for drawing our own logo and art. Offered as-is, free to use (MIT).

## What it does

- **Pen tool**: click for corners, drag for curves, click the first point to close.
- **Brush with pressure**: drawing tablets and phone pens give thick-to-thin ink lines that become clean vector
  shapes. *Merge* joins touching strokes of the same color into one shape (great for inking). *Line* mode draws
  plain stroked lines instead.
- **Eraser** that cuts through shapes and lines.
- **Shapes**: rectangles (rounded corners), ellipses, polygons and stars.
- **Edit points**: drag points and curve handles, Alt-click a line to add a point, double-click a point for
  smooth or corner.
- **Select**: move, scale (Shift keeps proportions), rotate (drag just outside a corner), Alt-drag to copy, flip,
  group, arrange.
- **Combine shapes**: unite, subtract, intersect, exclude, outline a stroke, and **Sticker outline**: one solid
  outline around the selection, placed underneath (the cartoon-logo look).
- **Align** to each other or to the page.
- **Layers**: show, hide, lock, rename, reorder, move the selection between layers.
- **Sketch to trace**: load a photo of your drawing under the page, fade it, size and move it.
- **Colors**: fill and stroke, hex input, saved swatches.
- **Saving**: your drawing saves itself in the browser; File › Save keeps a `.jamdraw` file. Export **SVG** or
  **PNG** (512, 1024, 2048). Open or place SVG files.
- Works with a mouse, a drawing tablet, a phone stylus or fingers. Once a pen has touched the screen, fingers
  only pan and zoom, so your palm can rest on it.

## Run it

No build step and nothing to install:

```
node serve.mjs        # or: npm start
```

Then open http://localhost:5173. In Chrome or Edge, *Install app* (in the address bar) gives it its own window and
lets it work offline. On a phone, use *Add to Home screen* from a hosted copy.

**Drawing tablets on Windows:** pressure reaches the browser through Windows Ink. If lines come out the same
width, turn on *Use Windows Ink* in your tablet's settings (Wacom: Wacom Tablet Properties › Mapping), and make
sure *Pressure* is on in the Brush options.

## Shortcuts

`V` select · `A` points · `P` pen · `B` brush · `E` eraser · `R` shapes · `I` pick color · `H` pan (or hold Space) ·
wheel or pinch to zoom · `0` fit · `1` 100% · `Ctrl+Z` / `Ctrl+Shift+Z` undo / redo · `Ctrl+C X V D` copy, cut,
paste, duplicate · `Ctrl+G` group (`+Shift` ungroup) · `[` `]` arrange · arrows nudge · `X` swap fill and stroke.
The `?` button in the app lists them too.

## How it's built

Plain HTML, CSS and JavaScript modules, no framework. `js/main.js` (input and shortcuts), `js/tools.js` (the
tools), `js/actions.js` (things done to the selection), `js/ui.js` (panels), `js/view.js` (zoom, pan, overlay),
`js/store.js` (autosave, files, export), `js/history.js` (undo). `sw.js` makes it work offline: bump its
`VERSION` when files change.

## Credits

- [Paper.js](http://paperjs.org) (MIT): the vector engine, shape combining and curve fitting.
- [paperjs-offset](https://github.com/glenzli/paperjs-offset) (MIT): outline stroke and sticker outlines.
- Tool icons adapted from [Lucide](https://lucide.dev) (ISC).

Licenses for the bundled libraries are in `vendor/`.

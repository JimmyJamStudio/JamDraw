// Turning the view: keys, buttons, two fingers, the badge that straightens it, and everything still lining up.
module.exports = (test) => {
  test('view: turning the view', async (t) => {
    const { check, app, key, page, V } = t;
    const angle = () => app(() => Math.round(__jamdraw.paper.view.rotation));
    const badge = () => app(() => { const b = document.getElementById('rotlabel'); return b.hidden ? null : b.textContent; });
    check(await badge() === null, 'no badge while the view is straight');
    await key('.');
    check(await angle() === 15 && await badge() === '15°', '. turns the view right, and a badge says how far');
    await key(',');
    await key(',');
    check(await angle() === -15, ', turns it left');
    await t.act('rotate-right');
    await t.act('rotate-right');
    check(await angle() === 15, 'and the buttons');
    await t.act('rotate-reset');
    check(await angle() === 0 && await badge() === null, 'the badge straightens it');
    // Turned 90°: dragging with the hand moves the drawing along with the pointer, and a selection box turns too.
    await app(async () => (await import('/js/view.js')).rotateView(90));
    await t.add({ x: 300, y: 300, w: 200, h: 100 });
    const before = await V(400, 350);
    await key('h');
    await t.drag(before, [before[0] + 100, before[1] + 40], 6);
    const after = await V(400, 350);
    check(Math.abs(after[0] - before[0] - 100) < 1.5 && Math.abs(after[1] - before[1] - 40) < 1.5, 'panning follows the pointer in a turned view');
    await key('v');
    await t.click(await V(400, 350));
    check(await app(() => __jamdraw.S.sel.length) === 1, 'shapes are still picked where they show');
    const corner = await V(300, 300); // the top left corner: turned, rotating is just outside it
    const c = await V(250, 250);
    await t.drag([corner[0] + (c[0] - corner[0]) * 0.4, corner[1] + (c[1] - corner[1]) * 0.4], c, 6);
    check(await app(() => Math.round(__jamdraw.S.sel[0].data.angle || 0)) !== 0, 'and the rotate handle still works');
    await app(() => { __jamdraw.S.snap.grid = true; });
    await t.wait(50); // the grid draws turned
    await key('0');
    check(await angle() === 0, '0 fits the page and straightens the view');
  });

  test('view: two fingers turn it', async (t) => {
    const { check, app } = t;
    await t.fresh({ width: 384, height: 832, deviceScaleFactor: 2.8125, isMobile: true, hasTouch: true });
    await app(() => {
      const el = document.getElementById('overlay'), r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const fire = (type, id, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
      fire('pointerdown', 1, cx - 80, cy);
      fire('pointerdown', 2, cx + 80, cy);
      for (let i = 1; i <= 10; i++) { // twist a quarter turn
        const a = (i / 10) * (Math.PI / 2);
        fire('pointermove', 1, cx - 80 * Math.cos(a), cy - 80 * Math.sin(a));
        fire('pointermove', 2, cx + 80 * Math.cos(a), cy + 80 * Math.sin(a));
      }
      fire('pointerup', 1, cx, cy);
      fire('pointerup', 2, cx, cy);
    });
    check(Math.abs(await app(() => __jamdraw.paper.view.rotation) - 90) < 2, 'twisting two fingers turns the view');
  });
};

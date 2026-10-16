// The phone layout (the owner's phone: 384 x 832 at 2.8125).
const path = require('path');
module.exports = (test) => {
  test('phone: layout, sheets, text panel', async (t) => {
    const { check, page, wait } = t;
    await t.fresh({ width: 384, height: 832, deviceScaleFactor: 2.8125, isMobile: true, hasTouch: true });
    await page.screenshot({ path: path.join(t.OUT, 'phone.png') });
    await t.act('sheet-style');
    await wait(300);
    check(await t.app(() => document.body.classList.contains('sheet-style')), 'Style opens the sheet');
    await page.screenshot({ path: path.join(t.OUT, 'phone-style.png') });
    await t.act('sheet-style');
    await wait(400);
    await page.click('#toolbar [data-tool="text"]');
    await page.touchscreen.tap(...t.P(0.3, 0.3));
    await wait(800);
    await page.screenshot({ path: path.join(t.OUT, 'phone-text.png') });
    check(await t.app(() => document.getElementById('textdlg').open), 'the text panel opens on the phone');
    check(!(await t.app(() => document.documentElement.scrollWidth > innerWidth)), 'no sideways scrolling');
  });
};

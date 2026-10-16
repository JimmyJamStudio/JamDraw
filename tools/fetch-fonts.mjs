// Downloads the bundled font library from Fontsource (Google Fonts, all free for commercial use: OFL or Apache)
// into fonts/, and writes fonts/fonts.json and fonts/LICENSES.md. Run: node tools/fetch-fonts.mjs
// Add a font by adding a line to LIBRARY (the Fontsource id, its group, and the weights to bundle).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LIBRARY = [
  // Bubbly and cartoon
  ['lilita-one', 'Bubbly', [400]], ['titan-one', 'Bubbly', [400]], ['fredoka', 'Bubbly', [400, 700]],
  ['baloo-2', 'Bubbly', [800]], ['luckiest-guy', 'Bubbly', [400]], ['chewy', 'Bubbly', [400]],
  ['sniglet', 'Bubbly', [800]], ['modak', 'Bubbly', [400]], ['bowlby-one', 'Bubbly', [400]],
  ['carter-one', 'Bubbly', [400]], ['paytone-one', 'Bubbly', [400]], ['boogaloo', 'Bubbly', [400]],
  ['bangers', 'Bubbly', [400]], ['knewave', 'Bubbly', [400]], ['shrikhand', 'Bubbly', [400]], ['coiny', 'Bubbly', [400]],
  // Bold display, neon and games
  ['bungee', 'Display', [400]], ['righteous', 'Display', [400]], ['passion-one', 'Display', [400, 700]],
  ['anton', 'Display', [400]], ['bebas-neue', 'Display', [400]], ['archivo-black', 'Display', [400]],
  ['black-ops-one', 'Display', [400]], ['fugaz-one', 'Display', [400]], ['russo-one', 'Display', [400]],
  ['orbitron', 'Display', [700]], ['audiowide', 'Display', [400]], ['monoton', 'Display', [400]],
  ['press-start-2p', 'Display', [400]], ['silkscreen', 'Display', [400]],
  // Handwritten
  ['permanent-marker', 'Handwritten', [400]], ['caveat', 'Handwritten', [400, 700]], ['pacifico', 'Handwritten', [400]],
  ['dancing-script', 'Handwritten', [700]], ['kalam', 'Handwritten', [400]], ['patrick-hand', 'Handwritten', [400]],
  ['gochi-hand', 'Handwritten', [400]], ['indie-flower', 'Handwritten', [400]],
  // Spooky
  ['creepster', 'Spooky', [400]], ['nosifer', 'Spooky', [400]], ['butcherman', 'Spooky', [400]], ['eater', 'Spooky', [400]],
  // Fantasy and medieval
  ['cinzel', 'Fantasy', [400, 700]], ['cinzel-decorative', 'Fantasy', [700]], ['uncial-antiqua', 'Fantasy', [400]],
  ['medievalsharp', 'Fantasy', [400]], ['almendra', 'Fantasy', [400]], ['metamorphous', 'Fantasy', [400]],
  ['pirata-one', 'Fantasy', [400]], ['im-fell-english', 'Fantasy', [400]], ['grenze-gotisch', 'Fantasy', [700]],
  ['unifrakturmaguntia', 'Fantasy', [400]], ['new-rocker', 'Fantasy', [400]], ['macondo', 'Fantasy', [400]],
  // Everyday sans and serif
  ['inter', 'Sans', [400, 800]], ['montserrat', 'Sans', [400, 800]], ['poppins', 'Sans', [400, 700]],
  ['nunito', 'Sans', [400, 800]], ['oswald', 'Sans', [400, 700]], ['roboto', 'Sans', [400, 700]], ['lato', 'Sans', [400, 900]],
  ['playfair-display', 'Serif', [400, 800]], ['lora', 'Serif', [400, 700]], ['merriweather', 'Serif', [400, 900]],
  ['dm-serif-display', 'Serif', [400]], ['roboto-slab', 'Serif', [400, 800]],
];

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = join(root, 'fonts');
mkdirSync(join(outDir, 'licenses'), { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'jamdraw-fonts-'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const list = [];
const licenses = [];
const failed = [];

for (const [id, group, weights] of LIBRARY) {
  try {
    const tgz = execFileSync(npm, ['pack', `@fontsource/${id}`, '--silent'], { cwd: tmp, shell: process.platform === 'win32' }).toString().trim().split('\n').pop();
    const dir = join(tmp, id);
    mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xzf', tgz, '-C', id], { cwd: tmp }); // relative paths: GNU tar reads C: as a host name
    const pkg = join(dir, 'package');
    const meta = JSON.parse(readFileSync(join(pkg, 'metadata.json'), 'utf8'));
    for (const want of weights) {
      const w = meta.weights.includes(want) ? want : meta.weights.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a));
      const src = join(pkg, 'files', `${id}-latin-${w}-normal.woff`);
      if (!existsSync(src)) throw new Error(`no latin ${w} file`);
      const file = `${id}-${w}.woff`;
      copyFileSync(src, join(outDir, file));
      list.push({ id: `${id}-${w}`, family: meta.family, weight: w, group, file, license: meta.license.type });
    }
    copyFileSync(join(pkg, 'LICENSE'), join(outDir, 'licenses', `${id}.txt`));
    licenses.push(`- **${meta.family}** (${meta.license.type}): ${meta.license.attribution.replace(/\s+/g, ' ')}`);
    process.stdout.write(`${meta.family} `);
  } catch (e) {
    failed.push(`${id}: ${e.message.split('\n')[0]}`);
  }
}
rmSync(tmp, { recursive: true, force: true });

writeFileSync(join(outDir, 'fonts.json'), JSON.stringify(list, null, 1) + '\n');
writeFileSync(join(outDir, 'LICENSES.md'), `# Bundled fonts

All from Google Fonts via [Fontsource](https://fontsource.org), Latin characters only. Every one is free to use,
including commercially, and in logos and artwork. OFL-1.1 fonts can't be sold on their own; Apache-2.0 fonts need
their license kept with the font files. Full license texts are in \`licenses/\`.

${licenses.join('\n')}
`);
console.log(`\n${list.length} font files from ${licenses.length} families.`);
if (failed.length) { console.log('Failed:\n' + failed.join('\n')); process.exitCode = 1; }

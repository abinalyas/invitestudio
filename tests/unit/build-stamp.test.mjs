// Every script address carries a build id (scripts/stamp-build.mjs), so a page can never mix with an older cached script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBuild, stamp, stampedFiles } from '../../scripts/stamp-build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('the build stamp in index.html is current (npm run stamp)', () => {
  assert.equal(stamp(html).html, html, 'run `npm run stamp` after changing a script or style');
});

test('every script in the page, and the build id the loader uses, carry the same build id', () => {
  const build = computeBuild(html);
  const tags = [...html.matchAll(/<script src="(\/[^"]+)"><\/script>/g)].map(match => match[1]);
  assert.ok(tags.length > 10, 'the page loads its scripts');
  for (const src of tags) assert.ok(src.endsWith(`?v=${build}`), `${src} carries the build id ${build}`);
  assert.ok(html.includes(`<meta name="invitestudio-build" content="${build}"/>`));
  assert.ok(html.indexOf('invitestudio-build') < html.indexOf('/template-loader.js'), 'the id is in the page before the loader runs');
});

test('the build id changes when a script changes, and covers what the loader fetches', () => {
  const files = stampedFiles(html);
  for (const file of ['/figma-host.js', '/figma/dist/figma-islands.js', '/template-loader.js', '/packaged-templates.js', '/template-widgets.js', '/scene-templates.js', '/scene-templates.css', '/templates/dist/velvet-reveal.js']) assert.ok(files.includes(file), `${file} is covered`);
  const loader = readFileSync(join(root, 'template-loader.js'), 'utf8');
  assert.match(loader, /invitestudio-build/);
  assert.ok(loader.includes('el.src = url + V') && loader.includes('SCENE_CSS + V'), 'every address the loader fetches carries the id');
});

// Guards for phone rules found by the phone audit (docs/MOBILE_QA.md). They check the source, so a later edit cannot drop one unnoticed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTemplates } from '../../scripts/build-templates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => readFileSync(join(root, file), 'utf8');

test('fields are 16px on touch screens, so iPhones do not zoom the page in when one is tapped', () => {
  assert.match(read('figma/islands/islands.css'), /@media \(pointer: coarse\)[^}]*\n?\s*input:not\(\[type="checkbox"\]\)[^}]*font-size: 16px !important/);
  assert.match(read('index.html'), /@media\(pointer:coarse\)\{input:not\(\[type=checkbox\]\):not\(\[type=radio\]\):not\(\[type=range\]\),select,textarea\{font-size:16px\}\}/);
});

test('every packaged template gets the touch-target rules, without changing any display', () => {
  const touch = read('templates/_shared/touch.css');
  assert.match(touch, /\[data-menu-toggle\]\{min-width:44px;min-height:44px\}/);
  assert.equal(/display\s*:/.test(touch), false, 'touch.css must only set minimum sizes, never display');
  for (const { manifest, css } of loadTemplates()) assert.ok(css.includes('min-width:44px'), `${manifest.id} does not include the touch rules`);
});

test('the pages never stop people from zooming', () => {
  for (const file of ['index.html', 'functions/_shared/landing.js']) assert.equal(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1\b/i.test(read(file)), false, file);
});

test('the setup steps and the template page keep their phone controls', () => {
  const setup = read('figma/islands/Setup.tsx');
  assert.ok(setup.includes('setup-selected') && setup.includes('className="setup-actions"'), 'the chosen design (desktop) and the pinned buttons stay in the setup steps');
  assert.equal(setup.includes('setup-actions-top'), false, 'the buttons are pinned at the bottom only');
  assert.match(read('figma/islands/islands.css'), /@media \(max-width: 900px\) \{[^@]*\n  \.setup-selected \{ display: none; \}/, 'on a phone the chosen design is not shown, so the form starts under the steps');
  assert.ok(read('figma/islands/TemplateDetail.tsx').includes('detail-sticky'), 'the template page keeps its pinned Start button');
  assert.match(read('figma/islands/islands.css'), /\.detail-device \{ --pw: min\(300px, calc\(100vw - 96px\)\); width: var\(--pw\); height: calc\(var\(--pw\) \* 2\.1111\)/);
  assert.match(read('figma/islands/islands.css'), /input\[type="date"\][^}]*min-width: 0/);
});

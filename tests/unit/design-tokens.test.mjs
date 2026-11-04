// Accessibility checks on the built design stylesheet (docs/DESIGN_SYSTEM.md, section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDesignTokens } from '../../figma/build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cream = '#fbf7f2';
const white = '#ffffff';

function luminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test('every hard-coded text colour in the built design CSS reaches 4.5:1 on cream', () => {
  const css = readFileSync(join(root, 'figma/dist/figma-islands.css'), 'utf8');
  const colours = [...css.matchAll(/(?<![-\w])color:\s*(#[0-9a-fA-F]{6})/g)].map(match => match[1].toLowerCase());
  assert.ok(colours.length > 20, 'expected the design CSS to contain text colours');
  for (const colour of new Set(colours)) {
    assert.ok(contrast(colour, cream) >= 4.5, `${colour} is ${contrast(colour, cream).toFixed(2)}:1 on cream`);
  }
});

test('input and select borders reach 3:1 against white and cream', () => {
  const css = readFileSync(join(root, 'figma/dist/figma-islands.css'), 'utf8');
  const borders = [...css.matchAll(/([^{}]*\b(?:input|select|textarea)\b[^{}]*)\{([^}]*)\}/g)]
    .flatMap(match => [...match[2].matchAll(/border(?:-color)?:[^;]*?(#[0-9a-fA-F]{6})/g)].map(hit => hit[1].toLowerCase()));
  for (const colour of new Set(borders)) {
    assert.ok(contrast(colour, cream) >= 3 && contrast(colour, white) >= 3, `${colour} is too faint for a control border`);
  }
});

test('the approved replacements are applied and the decorative gold is kept', () => {
  const sample = '.section-kicker { color: var(--gold); }\n.x { color: #6c746e; }\n.y { color: #a67d24; }\n.editor-form input { border: 1px solid #d5cec7; }';
  const out = applyDesignTokens(sample);
  assert.match(out, /\.section-kicker \{ color: var\(--gold-text\); \}/);
  assert.match(out, /color: #6b6760/);
  assert.match(out, /color: #a67d24/, 'decorative gold is left alone');
  assert.match(out, /border: 1px solid #8a8276/);
});

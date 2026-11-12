// Unit tests for the D0 defect fixes: media in invitation JSON, payload limits, and
// explicit template registration. See docs/DEFECTS_D0.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateWeddingInput } from '../../functions/_shared/api.js';
import { LAUNCH_TEMPLATE_IDS, isLaunchTemplate } from '../../functions/_shared/templates.js';
import { launchTemplateIds, readCatalogue } from '../../scripts/template-catalogue.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function rejects(input, field) {
  assert.throws(
    () => validateWeddingInput(input, { create: true }),
    error => error.code === 'VALIDATION_ERROR' && Boolean(error.fields?.[field]),
    `expected a validation error on ${field}`
  );
}

test('defect 1: image and audio data URLs are refused in invitation JSON', () => {
  rejects({ title: 'Couple', templateId: 'eternal', introSettings: { image: 'data:image/png;base64,AAAA' } }, 'introSettings');
  rejects({ title: 'Couple', templateId: 'eternal', introSettings: { audio: 'data:audio/mpeg;base64,AAAA' } }, 'introSettings');
  rejects({ title: 'Couple', templateId: 'eternal', sections: [{ id: 'story', content: 'data:text/html,x' }] }, 'sections');
});

test('defect 1: a nested media URL is refused even inside a list', () => {
  rejects({ title: 'Couple', templateId: 'eternal', animationSettings: { frames: ['data:image/gif;base64,AAAA'] } }, 'animationSettings');
});

test('defect 1: oversized JSON fields are refused with a clear limit, not a generic 413', () => {
  const big = { title: 'Couple', templateId: 'eternal', sections: [{ id: 'story', content: 'a'.repeat(40 * 1024) }] };
  rejects(big, 'sections');
  const message = (() => { try { validateWeddingInput(big, { create: true }); } catch (error) { return error.fields.sections; } })();
  assert.match(message, /too large to save/);
});

test('defect 1: ordinary intro settings without media are accepted', () => {
  const output = validateWeddingInput({
    title: 'Couple',
    templateId: 'eternal',
    animationSettings: { enabled: true, effect: 'fade', speed: 'slow' },
    introSettings: { enabled: true, style: 'floral', transition: 'floral', duration: 3 }
  }, { create: true });
  assert.deepEqual(output.intro_settings, { enabled: true, style: 'floral', transition: 'floral', duration: 3 });
});

test('defect 2: templates outside the registry are refused on create and change', () => {
  // birthday is a seeded non-wedding design; the starter and unknown IDs are not in the catalogue.
  for (const templateId of ['birthday', 'starter-wedding-anniversary', 'no-such-design']) {
    rejects({ title: 'Couple', templateId }, 'templateId');
  }
  assert.equal(isLaunchTemplate('birthday'), false);
  assert.equal(isLaunchTemplate('south-temple'), true);
});

test('defect 2: every registered template is accepted', () => {
  for (const templateId of LAUNCH_TEMPLATE_IDS) {
    const output = validateWeddingInput({ title: 'Couple', templateId }, { create: true });
    assert.equal(output.template_id, templateId);
  }
});

test('defect 2: the server registry is exactly the launch catalogue (regenerate with npm run gen:templates)', () => {
  // Compares against the catalogue as the browser builds it, including generated designs.
  assert.deepEqual([...LAUNCH_TEMPLATE_IDS], launchTemplateIds());
  assert.equal(new Set(LAUNCH_TEMPLATE_IDS).size, LAUNCH_TEMPLATE_IDS.length);
});

test('defect 2: every design is launch-scoped, or deliberately held back (under review, or not a wedding)', () => {
  const { templates } = readCatalogue();
  const held = templates.filter(template => !isLaunchTemplate(template.id));
  for (const template of held) {
    assert.ok(template.review === true || template.category !== 'Wedding', template.id);
  }
});

test('review designs render but cannot be created until approved', () => {
  const { templates } = readCatalogue();
  const kerala = templates.find(template => template.id === 'kerala-kasavu');
  assert.equal(kerala.review, true);
  assert.equal(kerala.motif, 'kerala-kasavu');
  assert.equal(isLaunchTemplate('kerala-kasavu'), false);
  assert.throws(() => validateWeddingInput({ title: 'Couple', templateId: 'kerala-kasavu' }, { create: true }));
});

test('defect 2: every design used by the Figma islands is registered', () => {
  const shared = readFileSync(join(root, 'figma/islands/shared.tsx'), 'utf8');
  const mapped = [...shared.matchAll(/^\s+backendId: "([^"]+)"/gm)].map(match => match[1]);
  assert.equal(mapped.length, 13); // the four scene templates, Modern Heritage, Minimalist, Cinematic, Fairy Tale, Blue Hydrangea, Bloom Reveal, Velvet Reveal, Under the Same Moon and Golden Butterfly are the only designs offered for now
  for (const templateId of mapped) assert.ok(isLaunchTemplate(templateId), templateId);
});

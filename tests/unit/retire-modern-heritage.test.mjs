// Modern Heritage is off the shelf: nobody can pick it, no new draft can use it, but invitations that already use it keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLaunchTemplate } from '../../functions/_shared/templates.js';
import { TEMPLATE_TIERS, quote, tierFor } from '../../functions/_shared/pricing.js';
import { TEMPLATES } from '../../functions/_shared/seo.js';
import { LANDING } from '../../functions/_shared/landing.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => readFileSync(join(root, file), 'utf8');

test('Modern Heritage is not offered anywhere a person chooses a design', () => {
  assert.doesNotMatch(read('index.html'), /const offeredTemplateIds=\[[^\]]*modern-heritage/);
  assert.doesNotMatch(read('figma/islands/shared.tsx'), /backendId: "modern-heritage"/);
  assert.equal(TEMPLATES.some(template => /modern heritage/i.test(template.title)), false, 'not in the sitemap or the search-engine pages');
  assert.equal(TEMPLATES.some(template => template.id === 13), false);
  // Landing pages point at designs that are still offered.
  const numbers = new Set(TEMPLATES.map(template => template.id));
  for (const page of LANDING) for (const pick of page.picks) assert.ok(numbers.has(pick), `${page.slug} picks ${pick}`);
});

test('no new draft can use it, but invitations that already do keep showing and can still be published', () => {
  const migration = 'supabase/migrations/202611200001_retire_modern_heritage.sql';
  assert.ok(existsSync(join(root, migration)));
  assert.match(read(migration), /update public\.templates\s+set is_active = false\s+where id = 'modern-heritage'/);
  assert.equal(isLaunchTemplate('modern-heritage'), true, 'still allowed on the server for existing invitations');
  assert.ok(existsSync(join(root, 'templates/modern-heritage/template.html')), 'the design itself is kept');
  assert.match(read('index.html'), /\{id:'modern-heritage',name:'Modern Heritage'/, 'its catalogue entry is kept so it still draws');
});

test('an existing Modern Heritage invitation is still priced as Classic', () => {
  assert.equal(TEMPLATE_TIERS['modern-heritage'], undefined, 'no tier is kept for a design that is not offered');
  assert.equal(tierFor('modern-heritage'), 'classic');
  assert.equal(quote('modern-heritage', 'in').amountMinor, quote('minimalist', 'in').amountMinor);
  assert.equal(quote('modern-heritage', 'in').amountMinor, 99900);
});

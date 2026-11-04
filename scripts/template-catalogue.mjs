// Reads the frontend template catalogue exactly as the browser builds it.
//
// The catalogue in index.html is partly generated (animated definitions, category
// starters). Evaluating its definitions here gives the same list the browser shows, so the
// server registry (functions/_shared/templates.js) can be generated from the truth and
// checked against it by tests.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readCatalogue() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const start = html.indexOf('const categories=');
  const end = html.indexOf('const defaultFunctions=');
  if (start < 0 || end < 0 || end <= start) throw new Error('catalogue boundaries not found in index.html');
  // The catalogue code has no DOM dependencies; crypto is the only global it reads.
  const { templates, categories } = new Function('crypto', `${html.slice(start, end)}\nreturn { templates, categories };`)({
    randomUUID: () => '00000000-0000-4000-8000-000000000000'
  });
  return { templates, categories };
}

// Launch scope: weddings only. Other occasions stay in the catalogue but are not offered.
export const LAUNCH_CATEGORY = 'Wedding';

export function launchTemplateIds() {
  const { templates } = readCatalogue();
  return [...new Set(templates.filter(template => template.category === LAUNCH_CATEGORY).map(template => template.id))];
}

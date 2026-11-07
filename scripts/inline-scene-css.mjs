// Keeps the inline copy of scene-templates.css in index.html in sync with the file.
// The editor preview is drawn inside a shadow root that copies only inline <style> blocks
// (figma-host.js), so the styles must be inline. scene-templates.css is the source of truth.
// Run `npm run build:scene-css` after editing it. tests/unit/scene-templates.test.mjs fails if they differ.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const START = '<style id="scene-templates-css">';
export const END = '</style><!--/scene-templates-css-->';

export function inlineBlock() {
  return `${START}\n${readFileSync(join(root, 'scene-templates.css'), 'utf8').trim()}\n${END}`;
}
export function currentBlock(html) {
  const start = html.indexOf(START);
  const end = html.indexOf(END);
  return start < 0 || end < 0 ? null : html.slice(start, end + END.length);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = join(root, 'index.html');
  const html = readFileSync(path, 'utf8');
  const existing = currentBlock(html);
  if (!existing) throw new Error('scene-templates-css block not found in index.html');
  writeFileSync(path, html.replace(existing, () => inlineBlock()));
  console.log('scene template styles synced into index.html');
}

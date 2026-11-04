// Builds the Figma islands that run inside the existing InviteStudio shell.
//
//   figma/islands/*.tsx   adapted React screens and the bridge to the vanilla app
//   figma/source/src/     the unmodified Figma Make stylesheet (design source of truth)
//
// Outputs (committed, so Cloudflare Pages needs no build step):
//   figma/dist/figma-islands.js   IIFE bundle; exposes window.InviteStudioFigma
//   figma/dist/figma-islands.css  stylesheet scoped under .figma-app
//
// Run with `npm run build:figma`. `npm run check:figma` type-checks the islands.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scopeName = '.figma-app';

// --- CSS scoping -----------------------------------------------------------------

// Splits CSS into top-level statements and blocks, respecting strings and comments.
function parseBlocks(css) {
  const blocks = [];
  let i = 0;
  const n = css.length;
  while (i < n) {
    if (/\s/.test(css[i])) { i++; continue; }
    if (css.startsWith('/*', i)) { i = css.indexOf('*/', i + 2) + 2; continue; }
    let j = i;
    let quote = null;
    for (; j < n; j++) {
      const c = css[j];
      if (quote) { if (c === quote && css[j - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '/' && css[j + 1] === '*') { j = css.indexOf('*/', j + 2) + 1; continue; }
      if (c === ';' || c === '{' || c === '}') break;
    }
    const prelude = css.slice(i, j).trim();
    if (j >= n) break;
    if (css[j] === ';') { blocks.push({ type: 'statement', prelude }); i = j + 1; continue; }
    if (css[j] === '}') { i = j + 1; continue; }
    let depth = 1;
    let k = j + 1;
    quote = null;
    for (; k < n && depth > 0; k++) {
      const c = css[k];
      if (quote) { if (c === quote && css[k - 1] !== '\\') quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '/' && css[k + 1] === '*') { k = css.indexOf('*/', k + 2) + 1; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    const body = css.slice(j + 1, k - 1);
    blocks.push({ type: prelude.startsWith('@') ? 'at' : 'rule', prelude, body });
    i = k;
  }
  return blocks;
}

// Splits a selector list on top-level commas (ignoring commas inside parentheses).
function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const c of list) {
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function scopeSelector(selector) {
  if (/^:root\b/.test(selector)) return selector.replace(/^:root/, scopeName);
  // :host only matches a shadow host. The islands render inside a container, so
  // rules written for the host apply to the island's root element instead.
  if (/^:host\b/.test(selector)) return selector.replace(/^:host/, scopeName);
  if (/^(html|body)\b/.test(selector)) return selector.replace(/^(html|body)/, scopeName);
  return `${scopeName} ${selector}`;
}

function emit(blocks) {
  return blocks.map(block => {
    if (block.type === 'statement') return '';
    if (block.type === 'rule') {
      return `${splitSelectors(block.prelude).map(scopeSelector).join(', ')}{${block.body}}`;
    }
    const name = block.prelude.match(/^@([a-zA-Z-]+)/)?.[1] || '';
    // Containers hold rules that need scoping. Keyframes, font-face and property blocks do not.
    if (['layer', 'media', 'supports', 'container'].includes(name)) {
      return `${block.prelude}{${emit(parseBlocks(block.body))}}`;
    }
    return `${block.prelude}{${block.body}}`;
  }).filter(Boolean).join('\n');
}

export function scopeStylesheet(css) {
  return emit(parseBlocks(css));
}

// --- Build ------------------------------------------------------------------------

// Accessible token replacements (docs/DESIGN_SYSTEM.md, section 2), approved in D1.
// Every replacement is listed here so it can be reviewed. Decorative uses of the gold
// (rules, icons, ornaments) are left as they are.
const TEXT_COLOR_REPLACEMENTS = {
  '#856b49': '#86681c', // bronze caption, 4.69:1 before, gold-text after
  '#986c2c': '#86681c', // bronze text, 4.36:1
  '#99770e': '#86681c', // gold text, 3.94:1
  '#9d831e': '#86681c', // gold text, 3.45:1
  '#8d822b': '#86681c', // olive-gold text, 3.67:1
  '#6c746e': '#6b6760', // muted grey, 4.51:1 on cream (passes only just; unified to the token)
  '#7b7f7b': '#6b6760'  // muted grey, 3.81:1
};
// Control borders below 3:1 against cream become the approved control border (#8a8276).
const CONTROL_BORDER_REPLACEMENTS = { default: '#8a8276' };

function relativeLuminanceContrast(a, b) {
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function applyDesignTokens(css) {
  // Text colours below AA on cream.
  let out = css.replace(/(?<![-\w])color:\s*(#[0-9a-fA-F]{6})/g, (match, hex) => {
    const to = TEXT_COLOR_REPLACEMENTS[hex.toLowerCase()];
    return to ? `color: ${to}` : match;
  });
  // Form controls: the border must reach 3:1 against its background.
  out = out.replace(/([^{}]*\b(?:input|select|textarea)\b[^{}]*)\{([^}]*)\}/g, (match, selector, body) => {
    const fixed = body.replace(/(border[^;]*?)(#[0-9a-fA-F]{6})/g, (whole, prefix, hex) =>
      relativeLuminanceContrast(hex, '#fbf7f2') < 3 ? `${prefix}${CONTROL_BORDER_REPLACEMENTS.default}` : whole);
    return `${selector}{${fixed}}`;
  });
  // Section kickers are text, so they use the accessible gold rather than the decorative one.
  out = out.replace(/(\.section-kicker\s*\{[^}]*?)color:\s*var\(--gold\)/, '$1color: var(--gold-text)');
  return out;
}

async function buildCss() {
  const preflight = readFileSync(join(root, 'node_modules/tailwindcss/preflight.css'), 'utf8');
  // The design's Google Fonts import is dropped: index.html already loads these families.
  const design = readFileSync(join(root, 'figma/source/src/index.css'), 'utf8')
    .replace(/@import url\([^)]*\);?/g, '')
    .replace(/@import "tailwindcss";?/g, '');
  const extras = readFileSync(join(root, 'figma/islands/islands.css'), 'utf8');
  const css = `/* Generated by figma/build.mjs from the Figma Make export. Do not edit. */\n${scopeStylesheet(preflight)}\n${scopeStylesheet(applyDesignTokens(design))}\n${scopeStylesheet(extras)}\n`;
  mkdirSync(join(root, 'figma/dist'), { recursive: true });
  writeFileSync(join(root, 'figma/dist/figma-islands.css'), css);
  return css.length;
}

async function buildJs() {
  await build({
    entryPoints: [join(root, 'figma/islands/entry.tsx')],
    outfile: join(root, 'figma/dist/figma-islands.js'),
    bundle: true,
    format: 'iife',
    target: 'es2020',
    jsx: 'automatic',
    minify: true,
    legalComments: 'none',
    loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning'
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cssBytes = await buildCss();
  await buildJs();
  console.log(`figma islands built: CSS ${cssBytes} bytes, JS bundle written`);
}

// Stamps a build id on every script address in index.html (/figma-host.js?v=<id>) and on the files the template loader fetches.
//
// Why: a browser or a cache in front of the site can keep serving an older copy of a script after a deploy. The page (index.html)
// is always fresh, so the page and an old script then disagree, and screens break (for example the template page stuck on
// "Loading design…"). A new id changes every address, so a new page can only ever load files from the same build.
//
// The id is a hash of the scripts and styles themselves (index.html is left out: it is always fresh). Run `npm run stamp` after
// changing any of them; `npm run build:templates` and `npm run build:figma` do it for you. tests/unit/build-stamp.test.mjs fails
// if the stamp is out of date.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = /<script src="(\/[^"?]+\.js)(?:\?v=[0-9a-f]+)?"><\/script>/g;
const META = /<meta name="invitestudio-build" content="[0-9a-f]*"\/>\n?/;

// Files the template loader fetches on demand (template-loader.js), besides the script tags in the page.
export function loaderFiles() {
  const dist = join(root, 'templates/dist');
  return [
    '/packaged-templates.js', '/template-widgets.js', '/scene-templates.js', '/scene-templates.css',
    ...(existsSync(dist) ? readdirSync(dist).filter(name => name.endsWith('.js')).sort().map(name => `/templates/dist/${name}`) : [])
  ];
}

export function stampedFiles(html) {
  const tags = [...html.matchAll(SCRIPT)].map(match => match[1]);
  return [...new Set([...tags, ...loaderFiles()])].sort();
}

export function computeBuild(html) {
  const hash = createHash('sha256');
  for (const path of stampedFiles(html)) hash.update(path).update('\0').update(readFileSync(join(root, path.slice(1)))).update('\0');
  return hash.digest('hex').slice(0, 12);
}

export function stamp(html) {
  const build = computeBuild(html);
  let out = html.replace(SCRIPT, (_, path) => `<script src="${path}?v=${build}"></script>`);
  const meta = `<meta name="invitestudio-build" content="${build}"/>\n`;
  if (META.test(out)) out = out.replace(META, meta);
  else out = out.replace('<link rel="preconnect"', `${meta}<link rel="preconnect"`);
  return { html: out, build };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = join(root, 'index.html');
  const html = readFileSync(path, 'utf8');
  const { html: next, build } = stamp(html);
  if (next !== html) writeFileSync(path, next);
  console.log(`build ${build}${next === html ? ' (unchanged)' : ' stamped into index.html'}`);
}

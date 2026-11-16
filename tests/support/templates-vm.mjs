// Loads the built design bundles (templates/dist/<id>.js) into a vm context, the way template-loader.js does in a page.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../../templates/dist');

// Defines InviteTemplates.register (storing into ctx.PACKAGED_TEMPLATES) and runs the bundles (all of them, or only `ids`).
export function loadBundles(ctx, ids) {
  ctx.PACKAGED_TEMPLATES = ctx.PACKAGED_TEMPLATES || {};
  ctx.InviteTemplates = { register: (id, data) => { ctx.PACKAGED_TEMPLATES[id] = data; } };
  for (const file of readdirSync(dist).filter(name => name.endsWith('.js')).sort()) {
    if (ids && !ids.includes(file.replace(/\.js$/, ''))) continue;
    vm.runInContext(readFileSync(join(dist, file), 'utf8'), ctx);
  }
}

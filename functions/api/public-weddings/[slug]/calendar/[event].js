import { db } from '../../../../_shared/api.js';
import engine from '../../../../../packaged-templates.js';

// One event of a published invitation as a calendar entry: GET /api/public-weddings/<slug>/calendar/<event>.ics
// An iPhone or iPad offers "Add to Calendar" for a calendar file a website serves (it does not for a downloaded data link), so the
// "Add to calendar" button sends Apple devices here (template-widgets.js). <event> is the event's id, or "event-<n>" for one without
// an id: packaged-templates.js calendarKey names it the same way. The entry is built by the same calendarFor as the downloaded file.
// Only published, public invitations and their visible events are served; anything else is a plain 404.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function notFound() {
  return new Response('Not found.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed.', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  const slug = String(params.slug || '').toLowerCase();
  const key = String(params.event || '').replace(/\.ics$/i, '');
  if (!SLUG.test(slug) || !/^[A-Za-z0-9-]{1,64}$/.test(key)) return notFound();

  let wedding = null;
  try {
    const query = new URLSearchParams({
      select: 'title,name,location,content',
      slug: `eq.${slug}`,
      status: 'eq.published',
      visibility: 'eq.public',
      limit: '1'
    });
    wedding = (await db(env, `weddings?${query}`))?.[0] || null;
  } catch {
    wedding = null;
  }
  if (!wedding) return notFound();

  // The same events, in the same order, as the invitation shows (packaged-templates.js derive): visible ones with a title.
  const list = Array.isArray(wedding.content?.functions) ? wedding.content.functions : [];
  const events = list.filter(f => f && typeof f === 'object' && f.visible !== false && String(f.title || '').trim());
  const index = events.findIndex((f, i) => engine.calendarKey(f, i) === key);
  if (index < 0) return notFound();

  const invitation = `${new URL(request.url).origin}/s/${slug}`;
  const entry = engine.calendarFor(events[index], {
    couple: String(wedding.title || wedding.name || '').trim(),
    where: String(wedding.location || '').trim(),
    invitation,
    index
  });
  if (!entry) return notFound();

  return new Response(request.method === 'HEAD' ? null : entry.text, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // inline: the device opens it in its calendar ("Add to Calendar") instead of saving it as a download.
      'Content-Disposition': `inline; filename="${entry.file}"`,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex'
    }
  });
}

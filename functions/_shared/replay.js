// Session recordings (Microsoft Clarity), on the PUBLIC marketing pages only (docs/REPLAY.md).
//
// The server decides, per page, whether the recording script may be offered at all: the page is the home page, the templates page, a
// design page or a search landing page; a Clarity project is configured (CLARITY_PROJECT_ID); and the visitor's country is KNOWN and is
// not in the European Economic Area, the United Kingdom or Switzerland (where recording would need a consent banner). Anything else
// gets no recording script and keeps the strict security policy. replay.js in the browser then also stops recording the moment the
// visitor enters a screen that holds personal details (setup, editor, dialogs, previews).
export const REPLAY_PAGES = Object.freeze(['home', 'templates', 'detail', 'landing']);

const RESTRICTED = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', // European Union
  'IS', 'LI', 'NO', // the rest of the European Economic Area
  'GB', 'CH'        // the United Kingdom and Switzerland
]);

export function replayProjectId(env) {
  const id = String(env?.CLARITY_PROJECT_ID || '').trim();
  return /^[a-z0-9]{6,16}$/i.test(id) ? id : '';
}

// The project id to offer on this page, or '' for no recording.
export function replayFor(env, pageKind, country) {
  const id = replayProjectId(env);
  if (!id || !REPLAY_PAGES.includes(pageKind)) return '';
  const code = String(country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1' || RESTRICTED.has(code)) return '';   // unknown places are treated like restricted ones
  return id;
}

const CLARITY_HOSTS = 'https://*.clarity.ms https://c.bing.com';

// The page's security policy with Clarity's hosts added to exactly the three places it needs (scripts, connections, images).
export function withReplayPolicy(policy) {
  return String(policy).split('; ').map(part => /^(script-src|connect-src|img-src) /.test(part) ? `${part} ${CLARITY_HOSTS}` : part).join('; ');
}

export function replayMeta(id) {
  return id ? `<meta name="invitestudio-replay" content="${id}">` : '';
}

// Template protection (docs/PROTECTION.md): the Terms and Contact wording, and the copyright line in the server-rendered footers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { POLICIES } from '../../functions/_shared/policies.js';
import { COPYRIGHT, renderPolicy, renderLanding, LANDING } from '../../functions/_shared/landing.js';

const page = slug => POLICIES.find(p => p.slug === slug);

test('the Terms say who may use the templates and what is not allowed', () => {
  const terms = page('terms');
  const heading = terms.sections.find(s => s.h2 === 'Our templates and designs');
  assert.ok(heading, 'a section on templates and designs');
  const text = JSON.stringify(heading).toLowerCase();
  for (const word of ['copyright', 'copy', 'resell', 'scrape', 'competing']) assert.ok(text.includes(word), `mentions ${word}`);
  assert.ok(terms.sections.some(s => s.h2 === 'Copies of our templates'), 'says what happens to a copy');
});

test('the Contact page says how to report a copy of a template', () => {
  const contact = page('contact');
  assert.ok(contact.sections.some(s => s.h2 === 'Report a copy of our templates'));
  assert.ok(JSON.stringify(contact).includes('web address of the copy'));
});

test('every server-rendered footer carries the copyright line', () => {
  assert.match(COPYRIGHT, /^© \d{4} InviteStudio\. The templates and designs on this site are protected by copyright\.$/);
  const head = '<meta name="robots" content="index,follow"/>';
  const policy = renderPolicy(page('terms'), 'https://invitestudio.co', { head, title: 'Terms', updated: '1 January 2027', contact: {}, business: {} });
  assert.ok(policy.includes(`<p class="copy">${COPYRIGHT}</p>`));
  const landing = renderLanding(LANDING[0], 'https://invitestudio.co', { templates: [{ id: LANDING[0].picks[0], title: 'X', tagline: 'Y', image: '/assets/templates/x-phone.jpg' }, ...LANDING.flatMap(l => l.picks).map(id => ({ id, title: id, tagline: id, image: `/assets/templates/${id}-phone.jpg` }))], head, title: 'T' });
  assert.ok(landing.includes(`<p class="copy">${COPYRIGHT}</p>`));
});

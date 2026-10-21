// Source-level regression checks for the frontend-only prototype.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const checks = [
  ['JavaScript parses', () => { new Function(js); }],
  ['Landing page includes six occasion collections', () => { for (const text of ['Wedding','Birthdays','Baby & Family','Home & Personal','Milestones','Events & Gatherings']) if (!js.includes("['"+text+"'")) throw Error(text+' collection missing'); }],
  ['Landing page communicates core benefits', () => { for (const text of ['Thoughtfully designed','Made uniquely yours','Lovely on every screen']) if (!js.includes(text)) throw Error(text+' missing'); }],
  ['Template detail preview includes swatches and use action', () => { if (!js.includes('template-detail-swatches') || !js.includes('Use this template →')) throw Error('template detail composition missing'); }],
  ['Template preview modal receives wide layout class', () => { if (!js.includes("content.includes('template-detail-modal')?'template-detail-shell':''")) throw Error('wide modal class missing'); }],
  ['Responsive and reduced-motion rules exist', () => { if (!html.includes('@media(max-width:480px)') || !html.includes('prefers-reduced-motion:reduce')) throw Error('responsive or reduced motion rules missing'); }],
  ['Category changes synchronize selected template', () => { if (!js.includes("const compatible=templates.find(t=>t.category===state.category||t.category===categoryAlias(state.category))")) throw Error('compatible template synchronization missing'); }],
  ['Setup navigation checks save result', () => { if (!js.includes('function setSetupStep(delta){if(!saveSetupFields())return;')) throw Error('save result not checked'); }],
  ['Locale is restored from saved project', () => { if (!js.includes("(p.locale||'English')===locale")) throw Error('locale binding missing'); }],
  ['Setup template switching preserves current project', () => { if (!js.includes('state.templateReturnToSetup=true') || !js.includes('state.templateReturnToSetup')) throw Error('setup return flow missing'); }],
  ['Gallery has explicit empty state', () => { if (!js.includes('Photos will be added here.')) throw Error('gallery empty state missing'); }],
  ['Photo uploads respect remaining capacity', () => { if (!js.includes('const remaining=Math.max(0,4-previous.length)')) throw Error('capacity calculation missing'); }],
  ['Photo save failure rolls back in-memory state', () => { if (!js.includes('if(!save()){p.photos=previous;return}')) throw Error('upload rollback missing'); }],
  ['Demo publish action cannot create a false published status', () => { if (!js.includes('function simulatePublish(){toast(\'Publishing is not available yet.') || js.includes("p.status='Published (demo)'")) throw Error('misleading demo publish state remains'); }],
  ['Publishing unavailability is clearly explained', () => { if (!js.includes('You can’t publish a live website yet.') || !js.includes('This preview is not a public link') || !js.includes('guests can’t submit real RSVPs yet.')) throw Error('publish availability message missing'); }],
  ['RSVP limitation is explicit', () => { if (!js.includes('RSVP preview only — backend not connected')) throw Error('RSVP limitation text missing'); }],
  ['Section add/reorder/hide controls exist', () => { for (const fn of ['addCustomSection','moveSection','toggleSection']) if (!js.includes('function '+fn+'(')) throw Error(fn+' missing'); }],
  ['Function add/reorder/hide/duplicate controls exist', () => { for (const fn of ['addFunction','moveFunction','toggleFunction','duplicateFunction']) if (!js.includes('function '+fn+'(')) throw Error(fn+' missing'); }],
  ['Onboarding can skip optional details', () => { if (!js.includes('function skipSetupStep()') || !js.includes('Skip for now')) throw Error('optional onboarding skip missing'); }],
  ['Essentials can go directly to a personalised preview', () => { if (!js.includes('function createQuickPreview()') || !js.includes('Create my preview ↗')) throw Error('quick preview path missing'); }],
  ['Publish dialog can open the actual invitation preview', () => { if (!js.includes('function viewInvitationPreview()') || !js.includes('View my preview') || !js.includes("state.device='mobile'")) throw Error('preview action missing'); }],
  ['Intro styles use style-specific animation and compatible transitions', () => { for (const text of ['const INTRO_PROFILES=','function resolvedIntroStyle(p,t)','function resolvedIntroTransition(p,t)']) if (!js.includes(text)) throw Error(text+' missing'); for (const text of ['intro-bloom','intro-envelope-open','intro-page-open','intro-type-reveal']) if (!html.includes(text)) throw Error(text+' missing'); }],
  ['Intro transition dropdown offers style-compatible options', () => { if (!js.includes('Options are matched to the selected intro style.') || !js.includes('intro-transition-select')) throw Error('compatible transition selector missing'); }],
  ['Editor save status accurately describes local storage', () => { if (!js.includes('Saved on this device')) throw Error('local save status unclear'); }],
  ['Pricing and privacy expectations are explicit', () => { for (const text of ['function openInfo(type)','No paid plans or charges','Drafts stay in this browser on this device']) if (!js.includes(text)) throw Error(text+' missing'); }],
  ['Wedding function supports guest logistics', () => { for (const field of ['fnParking','fnAccommodation','fnAccessibility']) if (!js.includes('id="'+field+'"')) throw Error(field+' missing'); }],
  ['Guest logistics render on invitation preview', () => { for (const field of ['f.parking','f.accommodation','f.accessibility']) if (!js.includes(field)) throw Error(field+' preview missing'); }],
  ['Function end time is validated', () => { if (!js.includes('End time must be after the start time.')) throw Error('end time validation missing'); }],
];
let failures=0;
for (const [name, run] of checks) { try { run(); console.log('PASS '+name); } catch(e) { failures++; console.log('FAIL '+name+' — '+e.message); } }
console.log(`SUMMARY ${checks.length-failures} passed, ${failures} failed (source-level checks only)`);
process.exitCode = failures ? 1 : 0;

// Source-level regression checks for the frontend-only prototype.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const checks = [
  ['JavaScript parses', () => { new Function(js); }],
  ['Landing page includes eight event shortcuts', () => { if (!js.includes("['Wedding','♡'],['Engagement','♢'],['Birthday','♧'],['Baptism','✳'],['Anniversary','♡'],['Baby Shower','♧'],['Celebration','✧'],['Other Event','＋']")) throw Error('reference event shortcuts missing'); }],
  ['Landing page includes benefits strip', () => { for (const text of ['Beautiful templates','Easy to create','Share instantly','Works on every device']) if (!js.includes(text)) throw Error(text+' missing'); }],
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
  ['Publish does not claim success if save fails', () => { if (!js.includes("if(!save())return;closeModal();go('dashboard');toast('Marked as published in this browser demo only')")) throw Error('publish save guard missing'); }],
  ['Demo publishing limitation is explicit', () => { if (!js.includes('No public website or backend is created yet.')) throw Error('demo limitation text missing'); }],
  ['RSVP limitation is explicit', () => { if (!js.includes('RSVP preview only — backend not connected')) throw Error('RSVP limitation text missing'); }],
  ['Section add/reorder/hide controls exist', () => { for (const fn of ['addCustomSection','moveSection','toggleSection']) if (!js.includes('function '+fn+'(')) throw Error(fn+' missing'); }],
  ['Function add/reorder/hide/duplicate controls exist', () => { for (const fn of ['addFunction','moveFunction','toggleFunction','duplicateFunction']) if (!js.includes('function '+fn+'(')) throw Error(fn+' missing'); }],
  ['Onboarding can skip optional details', () => { if (!js.includes('function skipSetupStep()') || !js.includes('Skip for now')) throw Error('optional onboarding skip missing'); }],
  ['Pricing and privacy expectations are explicit', () => { for (const text of ['function openInfo(type)','No paid plans or charges','Drafts stay in this browser on this device']) if (!js.includes(text)) throw Error(text+' missing'); }],
  ['Wedding function supports guest logistics', () => { for (const field of ['fnParking','fnAccommodation','fnAccessibility']) if (!js.includes('id="'+field+'"')) throw Error(field+' missing'); }],
  ['Guest logistics render on invitation preview', () => { for (const field of ['f.parking','f.accommodation','f.accessibility']) if (!js.includes(field)) throw Error(field+' preview missing'); }],
  ['Function end time is validated', () => { if (!js.includes('End time must be after the start time.')) throw Error('end time validation missing'); }],
];
let failures=0;
for (const [name, run] of checks) { try { run(); console.log('PASS '+name); } catch(e) { failures++; console.log('FAIL '+name+' — '+e.message); } }
console.log(`SUMMARY ${checks.length-failures} passed, ${failures} failed (source-level checks only)`);
process.exitCode = failures ? 1 : 0;

// Source-level regression checks for the frontend-only prototype.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const cloud = fs.readFileSync(__dirname + '/cloud-sync.js', 'utf8');
const checks = [
  ['JavaScript parses', () => { new Function(js); }],
  ['Landing page includes six occasion collections', () => { for (const text of ['Wedding','Birthdays','Baby & Family','Home & Personal','Milestones','Events & Gatherings']) if (!js.includes("['"+text+"'")) throw Error(text+' collection missing'); }],
  ['Landing page communicates core benefits', () => { for (const text of ['Thoughtfully designed','Made uniquely yours','Lovely on every screen']) if (!js.includes(text)) throw Error(text+' missing'); }],
  ['Template detail preview includes swatches and use action', () => { if (!js.includes('template-detail-swatches') || !js.includes('Use this template →')) throw Error('template detail composition missing'); }],
  ['Template preview modal receives wide layout class', () => { if (!js.includes("content.includes('template-detail-modal')?'template-detail-shell':''")) throw Error('wide modal class missing'); }],
  ['Responsive and reduced-motion rules exist', () => { if (!html.includes('@media(max-width:480px)') || !html.includes('prefers-reduced-motion:reduce')) throw Error('responsive or reduced motion rules missing'); }],
  ['Category changes synchronize selected template', () => { if (!js.includes("const compatible=templates.find(t=>t.category===state.category||t.category===categoryAlias(state.category))")) throw Error('compatible template synchronization missing'); }],
  ['Setup navigation checks save result', () => { if (!js.includes('function setupGo(step){if(!saveSetupFields())return;')) throw Error('save result not checked'); }],
  ['Website language is not collected (it had no effect on the invitation)', () => { if (js.includes('projectLocale')) throw Error('unused website language still collected'); }],
  ['Setup template switching preserves current project', () => { if (!js.includes('function setupChooseTemplate(id)') || !js.includes('setupChooseTemplate')) throw Error('template step missing'); }],
  ['Gallery is hidden from guests until photos exist', () => { if (!js.includes('data-section="gallery"') || js.includes('Photos will be added here.')) throw Error('gallery placeholder still shown to guests'); }],
  ['Photo uploads respect remaining capacity', () => { if (!js.includes('const remaining=Math.max(0,4-previous.length)')) throw Error('capacity calculation missing'); }],
  ['Photo save failure rolls back in-memory state', () => { if (!js.includes('if(!save()){p.photos=previous;return}')) throw Error('upload rollback missing'); }],
  ['Demo publish action cannot create a false published status', () => { if (!js.includes('function simulatePublish(){toast(\'Publishing is not available yet.') || js.includes("p.status='Published (demo)'")) throw Error('misleading demo publish state remains'); }],
  ['Publishing unavailability is clearly explained', () => { if (!js.includes('You can’t publish a live website yet.') || !js.includes('This preview is not a public link') || !js.includes('guests can’t submit real RSVPs yet.')) throw Error('publish availability message missing'); }],
  ['RSVP limitation is explicit', () => { if (!js.includes('RSVP preview only — backend not connected')) throw Error('RSVP limitation text missing'); }],
  ['Section add/reorder/hide controls exist', () => { for (const fn of ['addCustomSection','moveSection','toggleSection']) if (!js.includes('function '+fn+'(')) throw Error(fn+' missing'); }],
  ['Function add/reorder/hide/duplicate controls exist', () => { for (const fn of ['addFunction','moveFunction','toggleFunction','duplicateFunction']) if (!js.includes('function '+fn+'(')) throw Error(fn+' missing'); }],
  ['Onboarding can skip optional details', () => { if (!js.includes('Skip for now') || !js.includes('setupStepNames')) throw Error('optional onboarding skip missing'); }],
  ['Setup finishes only after the draft is confirmed', () => { if (!js.includes('function finishSetup()') || !js.includes('Open editor ↗')) throw Error('finish path missing'); }],
  ['Homepage How it works navigation has a real destination', () => { if (!html.includes('id="how"') || !js.includes("scrollIntoView({behavior:'smooth'})")) throw Error('How it works section or anchor missing'); }],
  ['Changing celebration category updates the live quick preview', () => { if (!js.includes('if(match)state.selectedTemplate=match.id;syncQuickPreview()')) throw Error('category preview sync missing'); }],
  ['Dashboard explains draft persistence without device-only claims', () => { if (!js.includes('<strong>${esc(draftNote())}</strong>') || js.includes('not synced across browsers or devices yet')) throw Error('persistence disclosure missing or stale'); }],
  ['Standalone preview states publishing and RSVP limitations clearly', () => { if (!js.includes('Preview only · ${esc(draftNote())} Public publishing and live guest RSVPs are not available yet.')) throw Error('preview disclosure missing'); }],
  ['Publish dialog can open the actual invitation preview', () => { if (!js.includes('function viewInvitationPreview()') || !js.includes('View my preview') || !js.includes("state.device='mobile'")) throw Error('preview action missing'); }],
  ['Intro styles use style-specific animation and compatible transitions', () => { for (const text of ['const INTRO_PROFILES=','function resolvedIntroStyle(p,t)','function resolvedIntroTransition(p,t)']) if (!js.includes(text)) throw Error(text+' missing'); for (const text of ['intro-bloom','intro-envelope-open','intro-page-open','intro-type-reveal']) if (!html.includes(text)) throw Error(text+' missing'); }],
  ['Intro transition dropdown offers style-compatible options', () => { if (!js.includes('Options are matched to the selected intro style.') || !js.includes('intro-transition-select')) throw Error('compatible transition selector missing'); }],
  ['Editor save status accurately describes local storage', () => { if (!js.includes('Saved on this device')) throw Error('local save status unclear'); }],
  ['Pricing and privacy expectations are explicit', () => { for (const text of ['function openInfo(type)','No paid plans or charges','Your private edit link is the key to your draft']) if (!js.includes(text)) throw Error(text+' missing'); }],
  ['Stale device-only copy is gone from the editor and dialogs', () => { for (const text of ['saved only in this browser on this device','stored in this browser on this device','Drafts stay in this browser']) if (js.includes(text) || html.includes(text)) throw Error('stale copy remains: '+text); }],
  ['Demo draft is never written into real user storage', () => { if (js.includes("name:'Meera & Abin'")) throw Error('demo seed still present'); }],
  ['Wedding function supports guest logistics', () => { for (const field of ['fnParking','fnAccommodation','fnAccessibility']) if (!js.includes('id="'+field+'"')) throw Error(field+' missing'); }],
  ['Guest logistics render on invitation preview', () => { for (const field of ['f.parking','f.accommodation','f.accessibility']) if (!js.includes(field)) throw Error(field+' preview missing'); }],
  ['Function end time is validated', () => { if (!js.includes('End time must be after the start time.')) throw Error('end time validation missing'); }],
  ['Cloud autosave is debounced', () => { if (!cloud.includes('setTimeout(() => syncProject(project), delay)') || !cloud.includes('queueCloudSave(project, delay = 650)')) throw Error('debounced cloud save missing'); }],
  ['Cloud save statuses are user-readable', () => { for (const text of ['Saving changes…','Saved just now ✓','Cloud save failed — local copy safe']) if (!cloud.includes(text)) throw Error(text+' missing'); }],
  ['Cloud saves retry with backoff', () => { if (!cloud.includes('maxRetries = 5') || !cloud.includes('retryDelay(meta.retryCount)')) throw Error('safe retry policy missing'); }],
  ['Older responses cannot overwrite newer edits', () => { if (!cloud.includes('revisionAtRequest') || !cloud.includes('const isCurrent = meta.revision === revisionAtRequest')) throw Error('stale response guard missing'); }],
  ['Cloud payload includes events and gallery metadata', () => { if (!cloud.includes('functions: project.functions || []') || !cloud.includes('gallery: galleryPayload(project)')) throw Error('draft payload coverage missing'); }],
  ['Current draft reference is stored locally', () => { if (!cloud.includes("invitestudio-current-draft") || !cloud.includes('rememberDraftReference(project)')) throw Error('draft reference persistence missing'); }],
  ['Returning customers get a continue option', () => { if (!cloud.includes('Continue editing') || !js.includes('draftRecoveryCard')) throw Error('draft recovery prompt missing'); }],
  ['Customers can start a separate new website', () => { if (!cloud.includes('＋ New website') || !js.includes('Create a website')) throw Error('new website recovery action missing'); }],
  ['Private edit links recover token-protected drafts', () => { for (const text of ['parsePrivateEditLink','recoverFromPrivateLink','getWeddingByEditToken(link.token)','editTokenPattern.test(token)']) if (!cloud.includes(text)) throw Error(text+' missing'); }],
  ['Malformed private links cannot throw during boot', () => { if (cloud.includes('token.length < 32')) throw Error('unguarded token length check remains'); }],
  ['Private edit tokens are removed from the address bar', () => { if (!cloud.includes('history.replaceState') || !cloud.includes("window.history.replaceState({}, document.title")) throw Error('private link cleanup missing'); }],
  ['Private token administration is exposed safely', () => { for (const text of ['regeneratePrivateEditLink','revokePrivateEditLinks','regenerateEditToken','revokeEditTokens']) if (!cloud.includes(text)) throw Error(text+' missing'); }],
];
let failures=0;
for (const [name, run] of checks) { try { run(); console.log('PASS '+name); } catch(e) { failures++; console.log('FAIL '+name+' — '+e.message); } }
console.log(`SUMMARY ${checks.length-failures} passed, ${failures} failed (source-level checks only)`);
process.exitCode = failures ? 1 : 0;

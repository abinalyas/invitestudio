// Designer screen, adapted from the Figma Make export (EditorPage in App.tsx).
//
// Adaptations, all deliberate:
// - Fields bind to the cloud draft through the bridge. Save status is derived from
//   the server's confirmation, never assumed.
// - The mock canvas is the real invitation renderer, so the preview is what guests see.
// - Clicking a section in the preview selects it in the rail, and selecting a section
//   scrolls the preview to it. Both stay in step.
// - Only supported content is editable here. Palette, typography and layout belong to
//   the template. Photos stay disabled until persistent photo storage exists.
import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent } from "react";
import { Icon, IconName, Logo } from "./shared";
import { bridge, Device, EditorFields, EditorSnapshot, EventItem, EventPatch, RetentionInfo, RsvpData } from "./bridge";
import { useBridgeVersion, TalkToUs } from "./extras";

type SectionKey = "home" | "story" | "functions" | "gallery" | "rsvp";
type MobileTab = "sections" | "preview" | "edit";
const mobileTabs: Array<{ key: MobileTab; label: string; icon: IconName }> = [
  { key: "sections", label: "Sections", icon: "layers" },
  { key: "preview", label: "Preview", icon: "eye" },
  { key: "edit", label: "Edit", icon: "edit" }
];

// Phone layout: one panel at a time, starting with the invitation.
function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}
type SectionItem = { key: SectionKey; label: string; icon: IconName; sectionId?: string };

const sections: SectionItem[] = [
  { key: "home", label: "Home", icon: "home" },
  { key: "story", label: "Our story", icon: "heart", sectionId: "story" },
  { key: "functions", label: "Events", icon: "calendar", sectionId: "functions" },
  { key: "gallery", label: "Photos", icon: "gallery", sectionId: "gallery" },
  { key: "rsvp", label: "RSVP", icon: "check", sectionId: "rsvp" }
];

// The invitation section a click on the preview selects.
const previewSectionToKey: Record<string, SectionKey> = {
  hero: "home",
  welcome: "home",
  story: "story",
  functions: "functions",
  gallery: "gallery",
  rsvp: "rsvp"
};

function saveText(snap: EditorSnapshot): string {
  switch (snap.saveState) {
    case "offline": return "Offline — changes kept on this device";
    case "creating": return "Creating your draft…";
    case "saving": return "Saving…";
    case "pending": return "Saving changes…";
    case "retrying": return "Retrying save…";
    case "error": return "Not saved yet";
    case "conflict": return "Newer version saved elsewhere";
    case "local": return snap.saveLabel || "Saved on this device";
    default: return snap.saveLabel || "Saved ✓";
  }
}

function isVisible(key: SectionKey, snap: EditorSnapshot): boolean {
  if (key === "home") return true;
  const section = sections.find(item => item.key === key);
  return section?.sectionId ? snap.sections[section.sectionId] !== false : true;
}

// The number of replies, for the "Replies" button in the header. Only asked for when replies are online and this
// device holds the private link; refreshed when the tab is shown again and every minute.
function useReplyCount(snap: EditorSnapshot): number | null {
  const [count, setCount] = useState<number | null>(null);
  const watching = snap.hasPrivateLink && (snap.rsvp === "count" || snap.rsvp === "rsvp");
  useEffect(() => {
    if (!watching) { setCount(null); return; }
    let live = true;
    const refresh = () => bridge.loadReplies().then(
      result => { if (live) setCount(result.totals.replies); },
      () => { if (live) setCount(null); }
    );
    refresh();
    const timer = window.setInterval(refresh, 60000);
    const onShow = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { live = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, [watching, snap.published]);
  return count;
}

// When this website is kept until. Asked once the draft is saved online; refreshed when the tab is shown again.
function useRetention(snap: EditorSnapshot): RetentionInfo | null {
  const [info, setInfo] = useState<RetentionInfo | null>(null);
  useEffect(() => {
    if (!snap.hasPrivateLink) { setInfo(null); return; }
    let live = true;
    const refresh = () => bridge.loadRetention().then(
      result => { if (live) setInfo(result && result.available ? result : null); },
      () => { if (live) setInfo(null); }
    );
    refresh();
    const onShow = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { live = false; document.removeEventListener("visibilitychange", onShow); };
  }, [snap.hasPrivateLink, snap.published, snap.draftId]);
  return info;
}

const longDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};

// Tells the couple how long their website stays online. Quiet while it is far off; a warning from 14 days before, and
// again, with a way back, once it has closed (docs/RETENTION_PLAN.md).
function RetentionNotice({ snap }: { snap: EditorSnapshot }) {
  const info = useRetention(snap);
  if (!info || !info.available) return null;
  const address = snap.publicUrl ?? undefined;
  const downloadReplies = () => {
    bridge.loadReplies().then(data => bridge.downloadRepliesCsv(data, snap.rsvp === "count"), () => undefined);
  };
  const canDownload = snap.rsvp === "count" || snap.rsvp === "rsvp";

  if (info.stage === "hidden" || info.stage === "delete_due") {
    return (
      <div className="retention-notice alert" role="alert" data-retention="closed">
        <p>
          <strong>Your website closed on {longDay(info.endsOn ?? "")}.</strong>{" "}
          Everything is deleted for good on {longDay(info.deleteOn ?? "")}. Download your replies before then.
        </p>
        <p className="retention-actions">
          {canDownload ? <button type="button" className="button small outline" onClick={downloadReplies}>Download replies</button> : null}
          <TalkToUs topic="restore" address={address} lead="Want it back? Talk to us:" />
        </p>
      </div>
    );
  }
  if (info.stage === "keep" && info.hasClock) {
    const days = info.daysLeft ?? 0;
    const soon = days <= (info.warnDays ?? 14);
    if (soon) {
      return (
        <div className="retention-notice warn" role="status" data-retention="soon">
          <p>
            <strong>Your website closes on {longDay(info.endsOn ?? "")}</strong> ({days <= 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`}).
            Download your replies now, or ask us to keep it online longer.
          </p>
          <p className="retention-actions">
            {canDownload ? <button type="button" className="button small outline" onClick={downloadReplies}>Download replies</button> : null}
            <TalkToUs topic="extend" address={address} lead="Need longer? Talk to us:" />
          </p>
        </div>
      );
    }
    if (info.endsBeforeEvent) {
      return (
        <div className="retention-notice warn" role="status" data-retention="before-event">
          <p>
            <strong>Your website will close on {longDay(info.endsOn ?? "")}, before your event on {longDay(info.lastEventDate ?? "")}.</strong>{" "}
            To keep it online through your event, ask us to extend it.
          </p>
          <p className="retention-actions"><TalkToUs topic="extend" address={address} lead="Talk to us:" /></p>
        </div>
      );
    }
    if (snap.published) {
      return (
        <p className="retention-notice quiet" data-retention="quiet">
          Online until {longDay(info.endsOn ?? "")}. <TalkToUs topic="extend" address={address} lead="Need longer? Talk to us:" />
        </p>
      );
    }
  }
  if (!info.hasClock && info.estimateBeforeEvent && info.estimatedEndsOn) {
    return (
      <div className="retention-notice warn" role="status" data-retention="estimate-before-event">
        <p>
          <strong>If you publish today, your website would close on {longDay(info.estimatedEndsOn)}, before your event on {longDay(info.lastEventDate ?? "")}.</strong>{" "}
          You can publish later, or ask us to extend it.
        </p>
        <p className="retention-actions"><TalkToUs topic="extend" address={address} lead="Talk to us:" /></p>
      </div>
    );
  }
  return null;
}

function sectionHint(key: SectionKey, snap: EditorSnapshot): string {
  if (key === "home") return "Always shown";
  if (key === "story") return snap.storyCopy ? "Written" : "Not written yet";
  if (key === "functions") {
    const count = snap.events.length;
    return count ? `${count} ${count === 1 ? "event" : "events"}` : "No events yet";
  }
  if (key === "gallery") {
    if (snap.galleryCount) return `${snap.galleryCount} ${snap.galleryCount === 1 ? "photo" : "photos"}`;
    return snap.media.enabled ? "Add your photos" : "Not available yet";
  }
  if (snap.rsvp === "none") return "No response form";
  if (snap.rsvp === "contact") return "Contact details only";
  const closed = !snap.rsvpOpen || (Boolean(snap.rsvpReplyBy) && new Date().toISOString().slice(0, 10) > snap.rsvpReplyBy);
  return closed ? "Replies closed" : "Online replies";
}

// The page redraws the whole editor whenever the draft finishes syncing with the cloud (a second or so after it
// opens), which rebuilds this component from scratch. Where the couple was (section, phone tab, preview size) is
// kept here, outside the component, so a redraw does not send them back to Home. A different draft starts fresh.
const remembered: { draft: string; device: Device; active: SectionKey; mobileTab: MobileTab } = {
  draft: "", device: "mobile", active: "home", mobileTab: "preview"
};

export function EditorPage() {
  useBridgeVersion();
  const snap = bridge.snapshot();
  if (snap.available && remembered.draft !== snap.draftId) {
    Object.assign(remembered, { draft: snap.draftId, device: "mobile", active: "home", mobileTab: "preview" });
  }
  const [device, setDeviceState] = useState<Device>(remembered.device);
  const [active, setActiveState] = useState<SectionKey>(remembered.active);
  const [designsOpen, setDesignsOpen] = useState(false);
  const [mobileTab, setMobileTabState] = useState<MobileTab>(remembered.mobileTab);
  const setDevice = (next: Device) => { remembered.device = next; setDeviceState(next); };
  const setActive = (next: SectionKey) => { remembered.active = next; setActiveState(next); };
  const setMobileTab = (next: MobileTab) => { remembered.mobileTab = next; setMobileTabState(next); };
  const replyCount = useReplyCount(snap);
  useEffect(() => { if (snap.available) void bridge.mediaLoad(); }, [snap.available, snap.draftId]);
  const controlsRef = useRef<HTMLElement>(null);
  const [picked, setPicked] = useState(false);
  const [namesNeeded, setNamesNeeded] = useState(false);
  const namesRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Scroll cue: shown while the invitation can scroll and is still at the top. The scrollbar is hidden on phone and tablet frames.
  const [cue, setCue] = useState(false);
  const updateCue = () => {
    const element = canvasRef.current;
    setCue(Boolean(element) && element!.scrollHeight > element!.clientHeight + 24 && element!.scrollTop < 24);
  };

  useEffect(() => {
    if (canvasRef.current && snap.available) bridge.renderInvitation(canvasRef.current, device);
    updateCue();
    // The artwork and fonts can change the height after the first paint.
    const timer = window.setTimeout(updateCue, 400);
    return () => window.clearTimeout(timer);
  }, [snap, device]);

  // Outline the section being edited inside the preview.
  useEffect(() => {
    const root = canvasRef.current?.shadowRoot;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-section]").forEach(element => {
      const selected = previewSectionToKey[element.dataset.section ?? ""] === active;
      element.style.outline = selected ? "2px solid #145c37" : "";
      element.style.outlineOffset = selected ? "-2px" : "";
    });
  }, [snap, device, active]);

  if (!snap.available) {
    return (
      <main className="editor-page">
        <section className="editor-empty shell">
          <p className="section-kicker">No website open</p>
          <h1>Choose a design to start</h1>
          <p>Pick a template and your invitation draft is created and saved.</p>
          <a className="button" href="/templates">Browse designs</a>
        </section>
      </main>
    );
  }

  const set = (patch: Partial<EditorFields>) => bridge.update(patch);
  const addressLabel = snap.publicUrl ? snap.publicUrl.replace(/^https?:\/\//, "") : "Draft preview";
  const activeItem = sections.find(item => item.key === active) ?? sections[0];

  // Names become the web address, so they are needed before publishing. Take the couple to the field instead of
  // publishing under an example or stand-in name.
  function publish() {
    if (snap.title.trim()) {
      bridge.openPublish();
      return;
    }
    setNamesNeeded(true);
    setActive("home");
    setPicked(false);
    if (isPhone()) setMobileTab("edit");
    window.setTimeout(() => namesRef.current?.focus(), 50);
  }

  // A click on the preview selects the section that was clicked.
  function selectFromPreview(event: ReactMouseEvent<HTMLDivElement>) {
    const node = event.nativeEvent
      .composedPath()
      .find((item): item is HTMLElement => item instanceof HTMLElement && Boolean(item.dataset?.section));
    const key = node ? previewSectionToKey[node.dataset.section ?? ""] : undefined;
    if (key) {
      setActive(key);
      if (isPhone()) setPicked(true);
    }
  }

  // Selecting a section in the rail scrolls the preview to it.
  function choose(key: SectionKey) {
    setActive(key);
    setPicked(false);
    if (isPhone()) {
      setMobileTab("edit");
      return;
    }
    const item = sections.find(section => section.key === key);
    const target = key === "home" ? "hero" : item?.sectionId;
    if (target) {
      // Scroll the preview itself (not the page) so the chosen section starts at the top of the frame,
      // below any sticky header the template declares with scroll-margin-top.
      const canvas = canvasRef.current;
      const section = canvas?.shadowRoot?.querySelector<HTMLElement>(`[data-section="${target}"]`);
      if (canvas && section) {
        const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
        const top = section.getBoundingClientRect().top - canvas.getBoundingClientRect().top + canvas.scrollTop - margin;
        canvas.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      }
    }
  }

  // The couple's replies live in the RSVP panel: this opens it from anywhere (on a phone, on the Edit tab).
  function openReplies() {
    setActive("rsvp");
    setPicked(false);
    if (isPhone()) setMobileTab("edit");
    // On narrower screens the panel sits below the preview, so bring it into view and move focus to it.
    window.setTimeout(() => {
      const panel = controlsRef.current;
      if (!panel) return;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      panel.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }, 50);
  }

  const designs = bridge.designs();
  const failed = snap.saveState === "error";
  const conflict = snap.saveState === "conflict";

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-brand">
          <Logo />
          <span className="editor-divider" />
          <strong>{snap.title || "Your wedding"}</strong>
          <span className="draft-badge">{snap.publishStatus === "published" ? "Published" : snap.publishStatus === "unpublished" ? "Unpublished" : "Draft"}</span>
        </div>

        <div className="device-switcher" role="group" aria-label="Preview size">
          {(["desktop", "tablet", "mobile"] as const).map(mode => (
            <button
              key={mode}
              type="button"
              className={device === mode ? "active" : ""}
              onClick={() => setDevice(mode)}
              aria-label={`${mode} preview`}
              aria-pressed={device === mode}
            >
              <span className={`device-shape ${mode}`} />
            </button>
          ))}
        </div>

        <div className="editor-header-actions">
          <div className={`save-status save-${snap.saveState}`} role="status" aria-live="polite" data-save-state={snap.saveState}>
            <Icon name="cloud" size={18} />
            <span>{saveText(snap)}</span>
            {failed ? <button type="button" onClick={() => bridge.retrySave()}>Retry</button> : null}
            {conflict ? <button type="button" onClick={() => window.location.reload()}>Reload</button> : null}
          </div>
          {snap.rsvp === "count" || snap.rsvp === "rsvp" ? (
            <button className="editor-action editor-replies" type="button" onClick={openReplies} aria-label={replyCount ? `Replies, ${replyCount}` : "Replies"}>
              <Icon name="people" size={20} /> Replies
              {replyCount ? <span className="reply-badge">{replyCount}</span> : null}
            </button>
          ) : null}
          <button className="editor-action" type="button" onClick={() => bridge.openPreview()}>
            <Icon name="eye" size={20} /> Preview
          </button>
          <button className="editor-publish" type="button" onClick={publish}>
            Share invitation <Icon name={snap.published ? "check" : "chevron"} size={17} />
          </button>
          <button className="editor-action editor-advanced" type="button" onClick={() => bridge.openAdvanced()}>
            Advanced editing
          </button>
        </div>
      </header>

      <RetentionNotice snap={snap} />
      <ShareGuide snap={snap} />

      <div className="editor-workspace" data-tab={mobileTab}>
        <aside className="editor-pages" id="panel-sections" aria-label="Sections">
          <div className="editor-panel-heading">
            <h2>Sections</h2>
          </div>
          <nav>
            {sections.map(item => {
              const visible = isVisible(item.key, snap);
              return (
                <div key={item.key} className={`section-row ${active === item.key ? "active" : ""} ${visible ? "" : "is-hidden"}`}>
                  <button type="button" className="section-select" aria-current={active === item.key ? "true" : undefined} onClick={() => choose(item.key)}>
                    <Icon name={item.icon} size={21} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{visible ? sectionHint(item.key, snap) : "Hidden from guests"}</small>
                    </span>
                  </button>
                  {item.sectionId ? (
                    <label className="visibility-switch">
                      <input
                        type="checkbox"
                        checked={visible}
                        aria-label={`Show ${item.label} on the invitation`}
                        onChange={event => bridge.setSectionVisible(item.sectionId as string, event.target.checked)}
                      />
                      <span aria-hidden="true" />
                    </label>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <div className="design-picker">
            <div className="design-current">
              <span className="tiny muted">Design</span>
              <strong>{snap.templateName || "Choose a design"}</strong>
            </div>
            <button type="button" className="btn small" aria-expanded={designsOpen} onClick={() => setDesignsOpen(open => !open)}>
              {designsOpen ? "Close designs" : "Change design"}
            </button>
            {designsOpen ? (
              <div className="design-list" role="group" aria-label="Designs">
                <p className="tiny muted">Your names, dates, story and events stay the same when you change design.</p>
                {designs.map(design => (
                  <button
                    key={design.id}
                    type="button"
                    className={snap.templateId === design.id ? "design-option selected" : "design-option"}
                    aria-pressed={snap.templateId === design.id}
                    onClick={() => bridge.setTemplate(design.id)}
                  >
                    {design.image ? <img src={design.image} alt="" /> : <span className="design-thumb-empty" />}
                    <span>{design.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {snap.hasPrivateLink ? (
            <div className="draft-access">
              <strong>Your draft is private</strong>
              <p>
                Only you can see it, and it is not public until you share it. This browser holds the key. To open it on another device,
                copy your private link and open that there. Anyone with the link can edit, so keep it to yourself.
              </p>
              <button type="button" className="btn small" onClick={() => bridge.copyPrivateLink()}>Copy private link</button>
            </div>
          ) : null}
          <button type="button" className="btn small mobile-only" onClick={() => bridge.openAdvanced()}>Advanced editing</button>
        </aside>

        <section className="editor-canvas-area" id="panel-preview">
          <div className={`device-frame ${device}`}>
            {device === "desktop" ? (
              <div className="browser-bar">
                <span className="browser-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="browser-address">▣ {addressLabel}</span>
              </div>
            ) : null}
            {/* The invitation scrolls inside the frame, like on a real device, not with the page. */}
            <div className="editor-site figma-canvas" ref={canvasRef} onClick={selectFromPreview} onScroll={updateCue} />
            {device !== "desktop" ? (
              <div className={cue ? "scroll-cue show" : "scroll-cue"} aria-hidden="true">
                <span>Scroll</span>
                <Icon name="chevron" size={18} />
              </div>
            ) : null}
          </div>
        </section>

        <aside className="editor-controls" id="panel-edit" aria-labelledby="editing-heading" ref={controlsRef}>
          <p className="editing-kicker">Editing</p>
          <h2 id="editing-heading" tabIndex={-1}>{activeItem.label}</h2>

          {active === "home" ? (
            <div className="editor-form">
              <p className="tiny muted">Home is always shown. Names, date and welcome message appear at the top of the invitation.</p>
              <label>
                Pre-title <span className="optional">(optional)</span>
                <input value={snap.pretitle} placeholder="e.g. The wedding of" onChange={event => set({ pretitle: event.target.value })} />
              </label>
              <label>
                Couple or celebration names
                <input
                  ref={namesRef}
                  value={snap.title}
                  placeholder={snap.shown.title}
                  aria-invalid={namesNeeded && !snap.title.trim() ? true : undefined}
                  aria-describedby={namesNeeded && !snap.title.trim() ? "names-needed" : undefined}
                  onChange={event => { setNamesNeeded(false); set({ title: event.target.value }); }}
                />
                {namesNeeded && !snap.title.trim() ? (
                  <span id="names-needed" className="field-error" role="alert">Add your names to publish. They become your web address.</span>
                ) : (
                  <span className="field-hint">{snap.title.trim() ? "Your names become your web address." : "Shown in grey until you add your own. Your names become your web address."}</span>
                )}
              </label>
              <label>
                Welcome message <span className="optional">(optional)</span>
                <textarea rows={3} value={snap.message} placeholder={snap.shown.message} onChange={event => set({ message: event.target.value })} />
              </label>
              <label>
                Date <span className="optional">(optional)</span>
                <span className="input-with-icon">
                  <Icon name="calendar" size={18} />
                  <input type="date" value={snap.date} onChange={event => set({ date: event.target.value })} />
                </span>
                {snap.date ? null : <span className="field-hint">Until you choose a date, the invitation shows “{snap.shown.date}”.</span>}
              </label>
              <label>
                Location <span className="optional">(optional)</span>
                <span className="input-with-icon">
                  <Icon name="pin" size={18} />
                  <input value={snap.location} placeholder="Venue, city" onChange={event => set({ location: event.target.value })} />
                </span>
              </label>
              <label>
                Hosts <span className="optional">(optional)</span>
                <input value={snap.hosts} placeholder={snap.shown.hosts} onChange={event => set({ hosts: event.target.value })} />
              </label>
              <p className="tiny muted">Your design's hero image is used for now. Your own hero photos unlock when photo storage is available.</p>
            </div>
          ) : null}

          {active === "story" ? (
            <div className="editor-form">
              <label>
                Section heading <span className="optional">(optional)</span>
                <input value={snap.storyTitle} placeholder="e.g. Our story" onChange={event => set({ storyTitle: event.target.value })} />
              </label>
              <label>
                Your story
                <textarea rows={6} value={snap.storyCopy} onChange={event => set({ storyCopy: event.target.value })} />
              </label>
            </div>
          ) : null}

          {active === "functions" ? <EventsPanel snap={snap} /> : null}
          {active === "gallery" ? <GalleryPanel snap={snap} /> : null}
          {active === "rsvp" ? <RsvpPanel snap={snap} /> : null}
          <ExampleNote snap={snap} section={active} />
          <WordingPanel snap={snap} section={active} />
        </aside>
      </div>

      {mobileTab === "preview" && picked ? (
        <button type="button" className="mobile-edit-pill" onClick={() => { setMobileTab("edit"); setPicked(false); }}>
          Edit {activeItem.label}
        </button>
      ) : null}

      <nav className="mobile-tabs" role="tablist" aria-label="Editor views">
        {mobileTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={mobileTab === tab.key}
            aria-controls={`panel-${tab.key}`}
            onClick={() => { setMobileTab(tab.key); setPicked(false); }}
          >
            <Icon name={tab.icon} size={20} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

// Says, before anything is clicked, what the last step does: Preview is private, Share invitation creates the link.
// Dismissible; the same facts are in the Share dialog.
const guideKey = "invitestudio-share-guide-dismissed";
function ShareGuide({ snap }: { snap: EditorSnapshot }) {
  const [hidden, setHidden] = useState(() => {
    try { return window.localStorage.getItem(guideKey) === "1"; } catch { return false; }
  });
  if (snap.published && snap.publicUrl) {
    return (
      <p className="share-guide share-guide-live" role="note">
        <strong>Your invitation is live</strong> at <a href={snap.publicUrl} target="_blank" rel="noopener noreferrer">{snap.publicUrl.replace(/^https?:\/\//, "")}</a>.
        After you edit, open <strong>Share invitation</strong> and choose <strong>Update live page</strong> to show your changes.
      </p>
    );
  }
  if (hidden) return null;
  return (
    <div className="share-guide" role="note">
      <ol className="share-steps" aria-label="Steps">
        <li><span>1</span> Add your details</li>
        <li><span>2</span> <button type="button" onClick={() => bridge.openPreview()}>Preview</button> as guests will see it</li>
        <li><span>3</span> Share invitation</li>
      </ol>
      <p>
        Right now only you can see your invitation. <strong>Share invitation</strong> makes it live with a web link, and anyone who has
        the link can open it. You can keep editing afterwards, or take it offline any time.
      </p>
      <button
        type="button"
        className="share-guide-close"
        onClick={() => {
          try { window.localStorage.setItem(guideKey, "1"); } catch { /* the guide just shows again next time */ }
          setHidden(true);
        }}
      >
        Got it
      </button>
    </div>
  );
}

// Packaged templates fill an empty section with example content in the editor so the design looks complete.
// The published page leaves empty sections out, so say so where the couple is looking.
function ExampleNote({ snap, section }: { snap: EditorSnapshot; section: SectionKey }) {
  if (!snap.copyFields.length) return null;
  const empty =
    (section === "story" && !snap.storyCopy.trim()) ||
    (section === "functions" && snap.events.length === 0) ||
    (section === "gallery" && snap.galleryCount === 0);
  if (!empty) return null;
  return (
    <p className="example-note" role="note">
      The preview shows example content here so you can see the design. It does not appear on your published invitation until you add your own.
    </p>
  );
}

// Wording the template lets a couple change for this section. Empty fields keep the template's own wording,
// shown as the hint. Only templates that publish wording keys (their manifest) show this.
function WordingPanel({ snap, section }: { snap: EditorSnapshot; section: SectionKey }) {
  const fields = snap.copyFields.filter(field => field.section === section);
  if (!fields.length) return null;
  return (
    <details className="editor-wording">
      <summary>Wording</summary>
      <p className="tiny muted">Change the template's own text for this section. Leave a field empty to keep the original.</p>
      <div className="editor-form">
        {fields.map(field => (
          <label key={field.key}>
            {field.label}
            <input value={field.value} maxLength={field.max} placeholder={field.fallback} onChange={event => bridge.setCopy(field.key, event.target.value)} />
          </label>
        ))}
      </div>
    </details>
  );
}

// Events carry their own travel details: directions, parking, stays and access.
// Structured per event so broader travel information can be added later.
export function EventsPanel({ snap }: { snap: EditorSnapshot }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const presets = bridge.eventPresets();

  function quickAdd(title: string) {
    const id = bridge.addEvent(title);
    setOpenId(id);
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) return;
    const id = bridge.addEvent(trimmed);
    setName("");
    setOpenId(id);
  }

  return (
    <div className="editor-form events-panel">
      <p className="tiny muted">Each event has its own date, venue and travel details. Events appear on the invitation in the order you add them.</p>
      {snap.events.length === 0 ? <p className="empty-state">No events yet. Add the first celebration below.</p> : null}
      <ul className="event-list">
        {snap.events.map(item => (
          <li key={item.id} className="event-item">
            <button
              type="button"
              className="event-toggle"
              aria-expanded={openId === item.id}
              onClick={() => setOpenId(openId === item.id ? null : item.id)}
            >
              <strong>{item.title || "Untitled event"}</strong>
              <small>{item.visible ? [item.date, item.venue].filter(Boolean).join(" · ") || "Details to add" : "Hidden from guests"}</small>
            </button>
            {openId === item.id ? (
              <EventForm
                key={item.id}
                item={item}
                onRemove={() => {
                  bridge.removeEvent(item.id);
                  setOpenId(null);
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {presets.length ? (
        <div className="preset-chips" role="group" aria-label="Quick-add events">
          <p className="tiny muted">Quick-add a common event</p>
          {presets.map(title => (
            <button key={title} type="button" className="preset-chip" onClick={() => quickAdd(title)}>
              + {title}
            </button>
          ))}
        </div>
      ) : null}
      <form className="add-event" onSubmit={add}>
        <label>
          Add an event
          <input value={name} placeholder="e.g. Sangeet" onChange={event => setName(event.target.value)} />
        </label>
        <button type="submit" className="btn small" disabled={!trimmed}>Add event</button>
      </form>
    </div>
  );
}

function EventForm({ item, onRemove }: { item: EventItem; onRemove: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const change = (patch: EventPatch) => bridge.updateEvent(item.id, patch);

  // Only the name is needed. Date, time and venue are what most guests look for; everything else is tucked
  // away, and opens by itself when it already has something in it.
  const endBeforeStart = Boolean(item.time && item.endTime && item.endTime < item.time);
  const hasMore = Boolean(item.endTime || item.description || item.dressCode || item.directionsUrl || item.parking || item.accommodation || item.accessibility);

  return (
    <div className="event-form">
      <p className="event-note">Only the name is needed. Add the rest now or come back to it later.</p>
      <label className="visibility-field">
        <input type="checkbox" checked={item.visible} onChange={event => change({ visible: event.target.checked })} />
        Show this event on the invitation
      </label>
      <label>
        Event name <span className="required-tag">(required)</span>
        <input value={item.title} maxLength={180} onChange={event => change({ title: event.target.value })} />
      </label>
      <div className="two-up">
        <label>
          Date <span className="optional">(optional)</span>
          <input type="date" value={item.date} onChange={event => change({ date: event.target.value })} />
        </label>
        <label>
          Start time <span className="optional">(optional)</span>
          <input type="time" value={item.time} onChange={event => change({ time: event.target.value })} />
        </label>
      </div>
      <label>
        Venue <span className="optional">(optional)</span>
        <input value={item.venue} maxLength={500} onChange={event => change({ venue: event.target.value })} />
      </label>

      <details className="event-more" open={hasMore}>
        <summary>More details <span className="optional">(optional, add later if you like)</span></summary>
        <label>
          End time
          <input
            type="time"
            value={item.endTime}
            aria-invalid={endBeforeStart ? true : undefined}
            onChange={event => change({ endTime: event.target.value })}
          />
          {endBeforeStart ? <span className="field-error" role="alert">The end time is before the start time, so it will not be shown.</span> : null}
        </label>
        <label>
          Description
          <textarea rows={2} maxLength={4000} value={item.description} onChange={event => change({ description: event.target.value })} />
        </label>
        <label>
          Dress code
          <input value={item.dressCode} maxLength={180} onChange={event => change({ dressCode: event.target.value })} />
        </label>
        <fieldset className="travel-fields">
          <legend>Travel details</legend>
          <label>
            Directions link
            <input
              type="url"
              value={item.directionsUrl}
              placeholder="https://maps.google.com/…"
              onChange={event => change({ directionsUrl: event.target.value })}
            />
          </label>
          <label>
            Parking
            <textarea rows={2} maxLength={4000} value={item.parking} onChange={event => change({ parking: event.target.value })} />
          </label>
          <label>
            Travel and accommodation
            <textarea rows={2} maxLength={4000} value={item.accommodation} onChange={event => change({ accommodation: event.target.value })} />
          </label>
          <label>
            Accessibility
            <textarea rows={2} maxLength={4000} value={item.accessibility} onChange={event => change({ accessibility: event.target.value })} />
          </label>
        </fieldset>
      </details>

      {confirming ? (
        <div className="confirm-remove" role="group" aria-label={`Remove ${item.title || "this event"}`}>
          <p>Remove “{item.title || "this event"}”? It will be removed from the invitation. This cannot be undone.</p>
          <div className="confirm-actions">
            <button type="button" className="btn small danger" onClick={onRemove}>Remove event</button>
            <button type="button" className="btn small" onClick={() => setConfirming(false)}>Keep event</button>
          </div>
        </div>
      ) : (
        <button type="button" className="link-danger" onClick={() => setConfirming(true)}>Remove event</button>
      )}
    </div>
  );
}

const slotLabels: Record<string, string> = { hero: "Cover picture", story: "Story picture", venue: "Venue picture" };
const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

const mediaOffNotes: Record<string, string> = {
  NOT_SAVED_ONLINE: "Photos need your invitation to be saved online. Open it with your private link, or wait until it finishes saving.",
  NO_STORAGE: "Photo storage is not set up yet. Until it is, your invitation uses the design's own pictures.",
  MIGRATION_PENDING: "Photo storage is being set up. Please try again later."
};

// Photos: the first ones fill the design's large pictures, the rest form the gallery. Each is resized on this device
// before it is uploaded, so a phone photo of several MB becomes a few hundred KB.
function GalleryPanel({ snap }: { snap: EditorSnapshot }) {
  const [progress, setProgress] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const media = snap.media;
  const slots = snap.photoSlots;

  if (!media.loaded) return <div className="editor-form"><p className="tiny muted">Loading photos…</p></div>;
  if (!media.enabled) {
    return (
      <div className="editor-form">
        <p className="empty-state">No photos yet.</p>
        <p className="tiny muted">{mediaOffNotes[media.reason] ?? "Photos are not available right now."}</p>
        {media.error ? <p className="tiny error">{media.error} <button type="button" className="link-button" onClick={() => bridge.mediaLoad()}>Try again</button></p> : null}
      </div>
    );
  }

  const full = snap.photos.length >= media.limits.photos;
  const add = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setProblems([]);
    const result = await bridge.mediaUpload(Array.from(files), p => setProgress(`Adding photo ${p.index} of ${p.total}…`));
    setProgress("");
    setProblems(result.errors.map(error => (error.name ? `${error.name}: ${error.message}` : error.message)));
    if (inputRef.current) inputRef.current.value = "";
  };
  const slotName = (index: number) => slotLabels[slots[index]] ?? "Large picture";

  return (
    <div className="editor-form">
      <p className="tiny muted" data-testid="photo-usage">
        {media.usage.count} of {media.limits.photos} photos · {mb(media.usage.bytes)} of {mb(media.limits.totalBytes)} MB
      </p>
      <p className="tiny muted">
        {slots.length
          ? `The first ${slots.length} ${slots.length === 1 ? "photo fills" : "photos fill"} this design's large ${slots.length === 1 ? "picture" : "pictures"}; the rest go in the gallery. Use the arrows to change the order.`
          : "Your photos appear in the gallery. Use the arrows to change the order."}
      </p>
      <label className={full || progress ? "button outline small photo-add disabled" : "button outline small photo-add"}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={full || Boolean(progress)}
          onChange={event => void add(event.target.files)}
          aria-label="Add photos"
        />
        {progress ? progress : full ? "Photo limit reached" : "Add photos"}
      </label>
      {problems.length ? (
        <ul className="photo-problems" role="alert">
          {problems.map((text, index) => <li key={index}>{text}</li>)}
        </ul>
      ) : null}
      {media.error ? <p className="tiny error">{media.error}</p> : null}
      {snap.photos.length === 0 ? <p className="empty-state">No photos yet. Photos you add replace the design's example pictures.</p> : null}
      <ul className="photo-list">
        {snap.photos.map((photo, index) => (
          <li key={photo.id}>
            <img src={photo.thumb} alt="" width={72} height={72} />
            <div className="photo-fields">
              {index < slots.length ? <span className="photo-slot">{slotName(index)}</span> : <span className="photo-slot muted">Gallery</span>}
              <input
                aria-label={`Description of photo ${index + 1}`}
                placeholder="Describe this photo (for screen readers)"
                maxLength={300}
                defaultValue={photo.alt}
                onBlur={event => { if (event.target.value !== photo.alt) void bridge.mediaAlt(photo.id, event.target.value); }}
              />
              <div className="photo-actions">
                <button type="button" aria-label={`Move photo ${index + 1} up`} disabled={index === 0} onClick={() => void bridge.mediaMove(photo.id, -1)}>↑</button>
                <button type="button" aria-label={`Move photo ${index + 1} down`} disabled={index === snap.photos.length - 1} onClick={() => void bridge.mediaMove(photo.id, 1)}>↓</button>
                <button type="button" className="link-button" onClick={() => { if (window.confirm("Remove this photo?")) void bridge.mediaRemove(photo.id); }}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const rsvpOptions: Array<[string, string]> = [
  ["count", "Online replies, with guest count"],
  ["rsvp", "Online replies, attending or not"],
  ["contact", "Contact details only"],
  ["none", "No response form"]
];

const dateTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

// How guests reply, and the couple's private list of replies.
function RsvpPanel({ snap }: { snap: EditorSnapshot }) {
  const online = snap.rsvp === "count" || snap.rsvp === "rsvp";
  const contactMode = snap.rsvp === "contact";
  const digits = snap.rsvpContact.value.replace(/\D/g, "");
  const badNumber = snap.rsvpContact.value.trim() !== "" && (digits.length < 7 || digits.length > 15);
  return (
    <div className="editor-form">
      {online ? <RepliesList snap={snap} /> : null}
      <h4 className="rsvp-settings-title">Settings</h4>
      <label>
        How guests reply
        <select value={snap.rsvp} onChange={event => bridge.setRsvp(event.target.value)}>
          {rsvpOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      {online ? (
        <>
          {!snap.published ? (
            <p className="tiny muted">Guests can reply once your invitation is live. Until then, the Reply button only shows how it will look.</p>
          ) : null}
          <label className="check-row">
            <input type="checkbox" checked={snap.rsvpOpen} onChange={event => bridge.setRsvpOption("rsvpOpen", event.target.checked)} />
            Accepting replies
          </label>
          <label>
            Reply by (optional)
            <input type="date" value={snap.rsvpReplyBy} onChange={event => bridge.setRsvpOption("rsvpReplyBy", event.target.value)} />
          </label>
          {snap.rsvp === "count" ? (
            <label>
              Most people in one reply
              <input type="number" min={1} max={20} value={snap.rsvpMaxParty} onChange={event => bridge.setRsvpOption("rsvpMaxParty", event.target.value)} />
            </label>
          ) : null}
          <p className="tiny muted">
            Guests give their name, whether they will attend{snap.rsvp === "count" ? ", how many people are coming" : ""}, and any meal or access needs.
            Only you can see replies. After the date you set, or when you switch replies off, guests see “Replies are closed”
            {snap.rsvpContact.value ? " and your number" : ""}.
          </p>
        </>
      ) : null}
      {contactMode || online ? (
        <>
          <label>
            {contactMode ? "How should guests reach you?" : "Contact for guests (optional)"}
            <select value={snap.rsvpContact.type} onChange={event => bridge.setRsvpContact(event.target.value, snap.rsvpContact.value)}>
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone call</option>
            </select>
          </label>
          <label>
            Number, with country code
            <input
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={24}
              placeholder="+91 98765 43210"
              value={snap.rsvpContact.value}
              onChange={event => bridge.setRsvpContact(snap.rsvpContact.type, event.target.value)}
            />
          </label>
          {badNumber ? <p className="tiny error">Enter a full number with country code, for example +91 98765 43210.</p> : null}
          <p className="tiny muted">
            {contactMode ? "This number is shown on your public invitation" : "This number is shown only when replies are closed"}, so anyone with the link can see it.
            Use a number you are happy to share.
          </p>
        </>
      ) : null}
      {snap.rsvp === "none" ? <p className="tiny muted">The invitation will not mention replies.</p> : null}
    </div>
  );
}

type ReplyFilter = "all" | "yes" | "no" | "needs";

const longDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
};

// The couple's private dashboard: totals, who is coming to what, needs to plan for, and a spreadsheet to download.
function RepliesList({ snap }: { snap: EditorSnapshot }) {
  const [data, setData] = useState<RsvpData | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error" | "offline">("idle");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReplyFilter>("all");
  const load = () => {
    setState("loading");
    bridge.loadReplies().then(
      result => { setData(result); setState("idle"); },
      (error: { code?: string }) => setState(error && error.code === "NOT_SAVED_ONLINE" ? "offline" : "error")
    );
  };
  useEffect(load, [snap.published]);
  const remove = (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}'s reply? This cannot be undone.`)) return;
    bridge.deleteReply(id).then(load, () => setState("error"));
  };

  const today = new Date().toISOString().slice(0, 10);
  const pastDeadline = Boolean(snap.rsvpReplyBy) && today > snap.rsvpReplyBy;
  const closed = !snap.rsvpOpen || pastDeadline;
  const counted = snap.rsvp === "count";
  const titles: Record<string, string> = {};
  if (data) for (const [id, item] of Object.entries(data.totals.byEvent)) titles[id] = item.title;
  const needle = query.trim().toLowerCase();
  const rows = data
    ? data.replies.filter(reply => {
        if (filter === "yes" && !reply.attending) return false;
        if (filter === "no" && reply.attending) return false;
        if (filter === "needs" && !reply.needs) return false;
        return !needle || `${reply.name} ${reply.needs} ${reply.message}`.toLowerCase().includes(needle);
      })
    : [];
  const withNeeds = data ? data.replies.filter(reply => reply.needs).length : 0;
  const filters: Array<[ReplyFilter, string]> = data
    ? [["all", `All ${data.totals.replies}`], ["yes", `Attending ${data.totals.attending}`], ["no", `Not attending ${data.totals.notAttending}`], ["needs", `With needs ${withNeeds}`]]
    : [];

  return (
    <div className="rsvp-replies">
      <h4>Replies</h4>
      <p className={closed ? "rsvp-status closed" : "rsvp-status"}>
        {closed
          ? pastDeadline && snap.rsvpOpen ? `Replies closed on ${longDate(snap.rsvpReplyBy)}.` : "Replies are closed."
          : snap.rsvpReplyBy ? `Accepting replies until ${longDate(snap.rsvpReplyBy)}.` : "Accepting replies."}{" "}
        {pastDeadline && snap.rsvpOpen ? null : (
          <button type="button" className="link-button" onClick={() => bridge.setRsvpOption("rsvpOpen", !snap.rsvpOpen)}>
            {snap.rsvpOpen ? "Close replies now" : "Reopen replies"}
          </button>
        )}
      </p>
      {state === "offline" ? <p className="tiny muted">Replies appear here once your invitation is saved online.</p> : null}
      {state === "error" ? <p className="tiny error">We could not load replies. <button type="button" className="link-button" onClick={load}>Try again</button></p> : null}
      {data ? (
        <>
          <div className="rsvp-cards">
            <div><strong>{data.totals.replies}</strong><span>{data.totals.replies === 1 ? "reply" : "replies"}</span></div>
            <div><strong>{data.totals.attending}</strong><span>attending</span></div>
            <div><strong>{data.totals.notAttending}</strong><span>not attending</span></div>
            {counted ? <div><strong>{data.totals.headcount}</strong><span>{data.totals.headcount === 1 ? "person" : "people"}</span></div> : null}
          </div>
          {Object.values(data.totals.byEvent).length > 1 ? (
            <table className="rsvp-by-event">
              <thead><tr><th>Event</th><th>Replies yes</th>{counted ? <th>People</th> : null}</tr></thead>
              <tbody>
                {Object.entries(data.totals.byEvent).map(([id, item]) => (
                  <tr key={id}><td>{item.title}</td><td>{item.replies}</td>{counted ? <td>{item.headcount}</td> : null}</tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {data.replies.length === 0 ? (
            <p className="empty-state">No replies yet. They appear here as guests send them.</p>
          ) : (
            <>
              <div className="rsvp-filters" role="group" aria-label="Show replies">
                {filters.map(([value, label]) => (
                  <button key={value} type="button" className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
                ))}
              </div>
              <input type="search" placeholder="Search by name, needs or message" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search replies" />
              <p className="tiny muted">Meal and access needs are private to you. Use the filter “With needs” when you brief your caterer.</p>
            </>
          )}
          <ul className="rsvp-list">
            {rows.map(reply => {
              const going = Object.keys(reply.events).filter(id => reply.events[id] && titles[id]).map(id => titles[id]);
              return (
                <li key={reply.id}>
                  <div>
                    <strong>{reply.name}</strong>
                    <span className={reply.attending ? "rsvp-yes" : "rsvp-no"}>
                      {reply.attending ? `Attending${counted ? ` · ${reply.party}` : ""}` : "Not attending"}
                    </span>
                  </div>
                  {going.length > 0 && Object.keys(data.totals.byEvent).length > 1 ? <p className="tiny">Events: {going.join(", ")}</p> : null}
                  {reply.needs ? <p className="tiny">Needs: {reply.needs}</p> : null}
                  {reply.message ? <p className="tiny">“{reply.message}”</p> : null}
                  <p className="tiny muted">
                    {dateTime(reply.updatedAt || reply.createdAt)}{" "}
                    <button type="button" className="link-button" onClick={() => remove(reply.id, reply.name)}>Delete</button>
                  </p>
                </li>
              );
            })}
          </ul>
          {data.replies.length > 0 && rows.length === 0 ? <p className="tiny muted">No replies match.</p> : null}
          <div className="rsvp-actions-row">
            {data.replies.length > 0 ? (
              <button type="button" className="button small outline" onClick={() => bridge.downloadRepliesCsv(data, counted)}>Download spreadsheet (CSV)</button>
            ) : null}
            <button type="button" className="link-button" onClick={load}>Refresh</button>
          </div>
        </>
      ) : state === "loading" ? <p className="tiny muted">Loading replies…</p> : null}
    </div>
  );
}

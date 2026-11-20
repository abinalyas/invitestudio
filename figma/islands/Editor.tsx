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
import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { usePricing } from "./pricing";
import { Icon, IconName, PlaceList, Logo, openPickerOnClick, sampleHosts, sampleStories, sampleWelcomes } from "./shared";
import { bridge, Device, EditorFields, EditorSnapshot, EventItem, EventPatch, PhotoItem, RetentionInfo, RsvpData } from "./bridge";
import { useBridgeVersion, TalkToUs, SampleChips } from "./extras";

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
// On a phone the invitation is a preview; an event's other details (time, venue, dress code...) are filled in on the Edit view. When an
// event is added or tapped in the preview, the preview asks the editor to open that event's form there.
type EventRequest = { id: string; rename: boolean; n: number };
type SectionItem = { key: SectionKey; label: string; icon: IconName; sectionId?: string };

const sections: SectionItem[] = [
  { key: "home", label: "Cover", icon: "home" },
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

// "Saved just now ✓" is the same words for everyone; on a phone the time part is hidden by CSS so the pill stays on one line.
function SaveLabel({ text }: { text: string }) {
  const match = /^(Saved)( .+?)( ✓)$/.exec(text);
  if (!match) return <span>{text}</span>;
  return <span>{match[1]}<span className="save-when">{match[2]}</span>{match[3]}</span>;
}

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

// "28 Jan 2027": the short date on the event cards (the saved value is 2027-01-28).
const shortDay = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// What a closed event card offers: it says what can be added, so it reads as something to open (not a finished summary).
const detailsHint = (item: { time: string; venue: string }) => {
  const missing = [item.time ? "" : "time", item.venue ? "" : "venue"].filter(Boolean);
  return missing.length ? `Add ${missing.join(" and ")}, dress code and directions` : "Add dress code and directions";
};

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
          <strong>Your invitation closed on {longDay(info.endsOn ?? "")}.</strong>{" "}
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
            <strong>Your invitation closes on {longDay(info.endsOn ?? "")}</strong> ({days <= 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`}).
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
            <strong>Your invitation will close on {longDay(info.endsOn ?? "")}, before your event on {longDay(info.lastEventDate ?? "")}.</strong>{" "}
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
          <strong>If you publish today, your invitation would close on {longDay(info.estimatedEndsOn)}, before your event on {longDay(info.lastEventDate ?? "")}.</strong>{" "}
          You can publish later, or ask us to extend it.
        </p>
        <p className="retention-actions"><TalkToUs topic="extend" address={address} lead="Talk to us:" /></p>
      </div>
    );
  }
  return null;
}

// The line under each section's name: what the section is for (a hidden section says so instead).
const sectionNote: Record<SectionKey, string> = {
  home: "Intro, names and date",
  story: "Your journey together",
  functions: "Wedding and reception details",
  gallery: "Gallery of your moments",
  rsvp: "Collect guest responses"
};

// The page redraws the whole editor whenever the draft finishes syncing with the cloud (a second or so after it
// opens), which rebuilds this component from scratch. Where the couple was (section, phone tab, preview size) is
// kept here, outside the component, so a redraw does not send them back to the cover. A different draft starts fresh.
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
  const designListRef = useRef<HTMLDivElement>(null);
  // When the list of designs opens, bring the current design into view inside it (the list scrolls on its own).
  useEffect(() => {
    if (!designsOpen) return;
    const list = designListRef.current;
    const current = list?.querySelector<HTMLElement>(".design-option.selected");
    if (list && current) list.scrollTop += current.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
  }, [designsOpen]);
  const [mobileTab, setMobileTabState] = useState<MobileTab>(remembered.mobileTab);
  const setDevice = (next: Device) => { remembered.device = next; setDeviceState(next); };
  const setActive = (next: SectionKey) => { remembered.active = next; setActiveState(next); };
  const setMobileTab = (next: MobileTab) => { remembered.mobileTab = next; setMobileTabState(next); };
  const replyCount = useReplyCount(snap);
  useEffect(() => { if (snap.available) void bridge.mediaLoad(); }, [snap.available, snap.draftId]);
  const controlsRef = useRef<HTMLElement>(null);
  const { data: pricing } = usePricing();
  // Editing text directly in the design: show the matching field in the panel, scrolled into view and briefly highlighted, so the change
  // can be seen in both places. Focus stays where the person is typing (in the design).
  const wordingSection = (key: string) => snap.copyFields.find(field => field.key === key)?.section as SectionKey | undefined;
  useEffect(() => {
    const onEdit = (event: Event) => {
      const { field, id } = (event as CustomEvent<{ field: string; id: string }>).detail ?? { field: "", id: "" };
      let target: SectionKey | undefined;
      let name = field;
      if (field === "title" || field.startsWith("names:")) { target = "home"; name = "title"; }
      else if (field.startsWith("location:")) { target = "home"; name = "location"; }
      else if (field === "message" || field === "hosts" || field === "date" || field === "location") target = "home";
      else if (field === "storyCopy") target = "story";
      else if (field.startsWith("copy:")) target = wordingSection(field.slice(5));
      else if (field.startsWith("event:")) target = "functions";
      if (!target) return;
      setActive(target);
      window.setTimeout(() => {
        const panel = controlsRef.current;
        if (!panel) return;
        let el: HTMLElement | null = null;
        if (field.startsWith("event:")) {
          el = [...panel.querySelectorAll<HTMLElement>("[data-grip]")].find(item => item.dataset.grip === id)?.closest("li") ?? null;
        } else {
          el = panel.querySelector<HTMLElement>(`[data-field="${name}"]`);
          el?.closest("details")?.setAttribute("open", "");
        }
        if (!el) return;
        const box = el.closest("label") ?? el;
        box.scrollIntoView({ block: "center", behavior: "smooth" });
        box.classList.remove("field-flash");
        void (box as HTMLElement).offsetWidth;
        box.classList.add("field-flash");
        window.setTimeout(() => box.classList.remove("field-flash"), 1600);
      }, 80);
    };
    window.addEventListener("invitestudio:edit-field", onEdit);
    return () => window.removeEventListener("invitestudio:edit-field", onEdit);
  });

  const [picked, setPicked] = useState(false);
  const [eventRequest, setEventRequest] = useState<EventRequest | null>(null);
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

  // Turning the phone, or resizing the window, changes how much room the scaled tablet and desktop previews have.
  useEffect(() => {
    const refit = () => { if (canvasRef.current) bridge.fitDevice(canvasRef.current, device); };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, [device]);

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
          <p className="section-kicker">No invitation open</p>
          <h1>Choose a design to start</h1>
          <p>Pick a design and your invitation draft is created and saved.</p>
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

  // The preview asks for an event's form (it was just added there, or tapped): show it on the Edit view with that event open.
  useEffect(() => {
    let count = 0;
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; rename?: boolean }>).detail;
      if (!detail || !detail.id) return;
      setActive("functions");
      setPicked(false);
      if (isPhone()) setMobileTab("edit");
      setEventRequest({ id: detail.id, rename: Boolean(detail.rename), n: ++count });
    };
    window.addEventListener("invitestudio:open-event", open);
    return () => window.removeEventListener("invitestudio:open-event", open);
  }, []);

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
  const currentDesign = designs.find(design => design.id === snap.templateId);
  // After a payment, only designs in the paid price tier or a cheaper one can be chosen (the server checks this too).
  const isDesignLocked = (designId: string) => {
    if (!snap.paidTier || !pricing) return false;
    const rank = (tier: string) => pricing.tiers.findIndex(item => item.id === tier);
    return rank(pricing.templates[designId] || "classic") > rank(snap.paidTier);
  };
  const failed = snap.saveState === "error";
  const conflict = snap.saveState === "conflict";

  // On a phone, the floating "Edit ..." button sits above the tab bar. The preview's message (the black "Added 1 photo..." line) must sit
  // above that button, or the two are drawn on top of each other. The message reads this offset (it cannot look the button up itself:
  // the button lives in this editor's shadow tree).
  const editPillShown = mobileTab === "preview" && picked;
  return (
    <main className="editor-page" style={editPillShown ? ({ "--hint-bottom": "160px" } as CSSProperties) : undefined}>
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
            <SaveLabel text={saveText(snap)} />
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
                      <small>{visible ? sectionNote[item.key] : "Hidden from guests"}</small>
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
            <h3 className="design-heading">Design</h3>
            <strong className="design-name">{snap.templateName || "Choose a design"}</strong>
            <div className="design-current-row">
              {currentDesign?.image ? <img className="design-current-thumb" src={currentDesign.image} alt="" /> : null}
              <button type="button" className="btn small" aria-expanded={designsOpen} onClick={() => setDesignsOpen(open => !open)}>
                <Icon name="swap" size={18} /> {designsOpen ? "Close designs" : "Change design"}
              </button>
            </div>
            {designsOpen ? (
              <div className="design-list" role="group" aria-label="Designs" ref={designListRef}>
                <p className="tiny muted">Your details stay the same when you change design.</p>
                {snap.paidTier && pricing ? (
                  <p className="tiny muted design-lock-note" id="designLockNote">
                    You paid for the {pricing.tiers.find(tier => tier.id === snap.paidTier)?.name ?? "chosen"} tier: any design in it or cheaper.{" "}
                    <TalkToUs topic="custom" lead="Want a higher tier? Talk to us:" />
                  </p>
                ) : null}
                {designs.map(design => {
                  const locked = isDesignLocked(design.id)
                  return (
                    <button
                      key={design.id}
                      type="button"
                      className={snap.templateId === design.id ? "design-option selected" : locked ? "design-option locked" : "design-option"}
                      aria-pressed={snap.templateId === design.id}
                      disabled={locked}
                      title={locked ? "Not included in the tier you paid for" : undefined}
                      onClick={() => bridge.setTemplate(design.id)}
                    >
                      {design.image ? <img src={design.image} alt="" /> : <span className="design-thumb-empty" />}
                      <span>{design.name}</span>
                      {locked ? <Icon name="lock" size={16} /> : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
          {snap.hasPrivateLink ? (
            <div className="draft-access">
              <span className="draft-access-icon"><Icon name="lock" size={22} /></span>
              <strong>Your draft is private</strong>
              <p>Only you can see it. Anyone with your private link can edit, so keep it to yourself.</p>
              <button type="button" className="btn small" onClick={() => bridge.copyPrivateLink()}><Icon name="link" size={18} /> Copy private link</button>
            </div>
          ) : null}
        </aside>

        <section className="editor-canvas-area" id="panel-preview">
          {/* Phones only: the preview size (the header's icons are hidden there) and the full guest view, which plays the opening. */}
          <div className="phone-preview-tools">
            <div className="device-switcher phone-switcher" role="group" aria-label="Preview size">
              {(["mobile", "tablet", "desktop"] as const).map(mode => (
                <button key={mode} type="button" className={device === mode ? "active" : ""} onClick={() => setDevice(mode)} aria-pressed={device === mode}>
                  {mode === "mobile" ? "Phone" : mode === "tablet" ? "Tablet" : "Desktop"}
                </button>
              ))}
            </div>
            <button type="button" className="button outline small" onClick={() => bridge.openPreview()}>
              Guest view
            </button>
          </div>
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
              <p className="tiny muted">The first thing guests see: names, date, place and welcome message. Always shown.</p>
              <label>
                Pre-title <span className="optional">(optional)</span>
                <input value={snap.pretitle} placeholder="e.g. The wedding of" onChange={event => set({ pretitle: event.target.value })} />
              </label>
              <label>
                Couple or celebration names
                <input
                  ref={namesRef}
                  data-field="title"
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
                <textarea rows={3} data-field="message" value={snap.message} placeholder={snap.shown.message} onChange={event => set({ message: event.target.value })} />
                <SampleChips value={snap.message} samples={sampleWelcomes()} onPick={(text) => set({ message: text })} />
              </label>
              <label>
                Date <span className="optional">(optional)</span>
                <span className="input-with-icon">
                  <Icon name="calendar" size={18} />
                  <input type="date" data-field="date" value={snap.date} onClick={openPickerOnClick} onChange={event => set({ date: event.target.value })} />
                </span>
                {snap.date ? null : <span className="field-hint">Until you choose a date, the invitation shows “{snap.shown.date}”.</span>}
              </label>
              <label>
                Location <span className="optional">(optional)</span>
                <span className="input-with-icon">
                  <Icon name="pin" size={18} />
                  <input list="invitestudio-places" autoComplete="off" data-field="location" value={snap.location} placeholder="Venue, city" onChange={event => set({ location: event.target.value })} />
                  <PlaceList />
                </span>
              </label>
              <label>
                Hosts <span className="optional">(optional)</span>
                <input data-field="hosts" value={snap.hosts} placeholder={snap.shown.hosts} onChange={event => set({ hosts: event.target.value })} />
                <SampleChips value={snap.hosts} samples={sampleHosts(snap.title)} onPick={(text) => set({ hosts: text })} />
              </label>
              {snap.photoSlots.includes("hero") ? (
                <p className="tiny muted cover-photo-note">
                  Your first photo becomes the cover picture.{" "}
                  <button type="button" className="link-button" onClick={() => choose("gallery")}>Add photos</button>
                </p>
              ) : null}
            </div>
          ) : null}

          {active === "story" ? (
            <div className="editor-form">
              <label>
                Heading <span className="optional">(optional)</span>
                <input value={snap.storyTitle} placeholder="e.g. Our story" onChange={event => set({ storyTitle: event.target.value })} />
              </label>
              <label>
                Your story
                <textarea rows={6} data-field="storyCopy" value={snap.storyCopy} placeholder={snap.shown.story || undefined} onChange={event => set({ storyCopy: event.target.value })} />
                <SampleChips value={snap.storyCopy} samples={sampleStories()} onPick={(text) => set({ storyCopy: text })} />
              </label>
            </div>
          ) : null}

          {active === "functions" ? <EventsPanel snap={snap} request={eventRequest} /> : null}
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
  const [copied, setCopied] = useState<"" | "yes" | "no">("");
  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
    window.setTimeout(() => setCopied(""), 2500);
  }
  if (snap.published && snap.publicUrl) {
    const url = snap.publicUrl;
    return (
      <section className="live-banner" aria-label="Your invitation is live">
        <span className="live-badge" aria-hidden="true"><Icon name="check" size={20} /></span>
        <div className="live-main">
          <strong className="live-title">Your invitation is live</strong>
          <a className="live-link" href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https?:\/\//, "")}</a>
          <p className="live-hint">
            Made changes? Choose <strong>Share invitation</strong>, then <strong>Update live page</strong>.
          </p>
        </div>
        <div className="live-actions">
          <a className="btn small" href={url} target="_blank" rel="noopener noreferrer">Open</a>
          <button type="button" className="btn small" onClick={() => void copyLink(url)}>{copied === "yes" ? "Copied" : copied === "no" ? "Select the link to copy" : "Copy link"}</button>
          <button type="button" className="btn small" onClick={() => bridge.openShareCard()}>Share card</button>
        </div>
      </section>
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
        Right now only you can see your invitation. <strong>Share invitation</strong> gives it a link anyone can open.
        {snap.hasPrivateLink ? (
          <>
            {" "}Want opinions first?{" "}
            <button type="button" className="share-guide-preview" onClick={() => void bridge.copyPreviewLink()}>Copy a draft preview link</button>
          </>
        ) : null}
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
      <p className="tiny muted">Change the design's own text for this section. Leave a field empty to keep the original.</p>
      <div className="editor-form">
        {fields.map(field => (
          <label key={field.key}>
            {field.label}
            <input data-field={`copy:${field.key}`} value={field.value} maxLength={field.max} placeholder={field.fallback} onChange={event => bridge.setCopy(field.key, event.target.value)} />
          </label>
        ))}
      </div>
    </details>
  );
}

// Events carry their own travel details: directions, parking, stays and access.
// Structured per event so broader travel information can be added later.
export function EventsPanel({ snap, request = null }: { snap: EditorSnapshot; request?: EventRequest | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const presets = bridge.eventPresets();
  // While an event is being dragged, the list shows the order it would land in; the change is saved when it is dropped.
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const [announce, setAnnounce] = useState("");
  // The event that was just added: it is brought into view and briefly highlighted, so on a phone (where the new event opens above the
  // buttons that were tapped, out of sight) it is clear that something was added.
  const justAdded = useRef<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusGrip = useRef<string | null>(null);
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => stopDrag.current?.(), []);
  // An event asked for by the preview: open its form and bring it into view (the effect below does the scrolling).
  const handled = useRef(0);
  useEffect(() => {
    if (!request || handled.current === request.n) return;
    handled.current = request.n;
    justAdded.current = request.id;
    setOpenId(request.id);
  });
  // A new custom event arrives named "New event": put the cursor in its name, selected, so typing replaces it.
  const renamed = useRef(0);
  useEffect(() => {
    if (!request || !request.rename || renamed.current === request.n || openId !== request.id) return;
    const row = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [])].find(el => el.dataset.eventId === request.id);
    const input = row?.querySelector<HTMLInputElement>("input[type=text], input:not([type])");
    if (!input) return;
    renamed.current = request.n;
    input.focus({ preventScroll: true });
    input.select();
  });
  useEffect(() => {
    const id = justAdded.current;
    if (!id) return;
    const row = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [])].find(el => el.dataset.eventId === id);
    if (!row) return; // the list has not drawn it yet: this runs again after the next draw
    justAdded.current = null;
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 2400); // no cleanup: this effect runs after every draw, and a cleanup would cancel the timer
  });
  useEffect(() => {
    // Keep keyboard focus on the handle that was just used, after the list re-orders.
    const id = focusGrip.current;
    if (!id) return;
    focusGrip.current = null;
    [...(listRef.current?.querySelectorAll<HTMLElement>("[data-grip]") ?? [])].find(el => el.dataset.grip === id)?.focus();
  });
  const shown = drag ? (drag.order.map(id => snap.events.find(item => item.id === id)).filter(Boolean) as EventItem[]) : snap.events;

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    setOpenId(null);
    const startIndex = snap.events.findIndex(item => item.id === id);
    let order = snap.events.map(item => item.id);
    setDrag({ id, order });
    const move = (e: PointerEvent) => {
      const others = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [])].filter(el => el.dataset.eventId !== id);
      let target = others.length;
      for (let i = 0; i < others.length; i++) {
        const box = others[i].getBoundingClientRect();
        if (e.clientY < box.top + box.height / 2) { target = i; break; }
      }
      const rest = order.filter(x => x !== id);
      const next = [...rest.slice(0, target), id, ...rest.slice(target)];
      if (next.join("|") !== order.join("|")) {
        order = next;
        setDrag({ id, order });
      }
    };
    const end = () => {
      stop();
      const to = order.indexOf(id);
      if (to !== startIndex) {
        bridge.moveEvent(id, to);
        const title = snap.events[startIndex]?.title || "Event";
        setAnnounce(`${title} moved to position ${to + 1} of ${order.length}.`);
      }
      setDrag(null);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      stopDrag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    stopDrag.current = stop;
  }

  function gripKey(event: ReactKeyboardEvent<HTMLButtonElement>, id: string, index: number) {
    const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!delta) return;
    event.preventDefault();
    const to = index + delta;
    if (to < 0 || to >= snap.events.length) return;
    focusGrip.current = id;
    bridge.moveEvent(id, to);
    setAnnounce(`${snap.events[index]?.title || "Event"} moved to position ${to + 1} of ${snap.events.length}.`);
  }

  function quickAdd(title: string) {
    const id = bridge.addEvent(title);
    justAdded.current = id;
    setAnnounce(`${title} added to your events.`);
    setOpenId(id);
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) return;
    const id = bridge.addEvent(trimmed);
    justAdded.current = id;
    setAnnounce(`${trimmed} added to your events.`);
    setName("");
    setOpenId(id);
  }

  return (
    <div className="editor-form events-panel">
      <p className="tiny muted">Guests see events in this order.
        {snap.events.length > 1 ? " Drag the handle to change it." : ""}</p>
      <p className="visually-hidden" role="status" aria-live="polite">{announce}</p>
      {snap.events.length === 0 ? <p className="empty-state">No events yet. Add the first celebration below.</p> : null}
      <ul className={drag ? "event-list is-dragging" : "event-list"} ref={listRef}>
        {shown.map((item, index) => (
          <li key={item.id} className={drag?.id === item.id ? "event-item dragging" : flash === item.id ? "event-item just-added" : "event-item"} data-event-id={item.id}>
            <div className="event-row">
              {snap.events.length > 1 ? (
                <button
                  type="button"
                  className="event-grip"
                  data-grip={item.id}
                  aria-label={`Move ${item.title || "Untitled event"}. Drag, or use the up and down arrow keys.`}
                  onPointerDown={event => startDrag(event, item.id)}
                  onKeyDown={event => gripKey(event, item.id, index)}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="currentColor">
                    <circle cx="6" cy="4" r="1.5" /><circle cx="12" cy="4" r="1.5" />
                    <circle cx="6" cy="9" r="1.5" /><circle cx="12" cy="9" r="1.5" />
                    <circle cx="6" cy="14" r="1.5" /><circle cx="12" cy="14" r="1.5" />
                  </svg>
                </button>
              ) : null}
              <button
                type="button"
                className="event-toggle"
                aria-expanded={openId === item.id}
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
              >
                <span className="event-toggle-text">
                  <strong>{item.title || "Untitled event"}</strong>
                  <small>{item.visible ? [item.date ? shortDay(item.date) : "", item.venue].filter(Boolean).join(" · ") || "Details to add" : "Hidden from guests"}</small>
                  {item.visible && openId !== item.id ? <small className="event-hint">{detailsHint(item)}</small> : null}
                </span>
                <span className="event-open" aria-hidden="true">{openId === item.id ? "Close" : "Add details"} <b>{openId === item.id ? "⌃" : "›"}</b></span>
              </button>
            </div>
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

  // Only the name is needed. Date, time, venue and the directions link are what most guests look for; everything else is
  // tucked away, and opens by itself when it already has something in it.
  const endBeforeStart = Boolean(item.time && item.endTime && item.endTime < item.time);
  // Parking, travel and accessibility notes are no longer asked for. An event that already has some keeps showing them, so that
  // text (which guests still see) can be edited or cleared; the fields stay for as long as this form is open.
  const [legacyTravel] = useState(() => Boolean(item.parking || item.accommodation || item.accessibility));
  const hasMore = Boolean(item.endTime || item.description || item.dressCode || legacyTravel);

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
          <input type="date" value={item.date} onClick={openPickerOnClick} onChange={event => change({ date: event.target.value })} />
        </label>
        <label>
          Start time <span className="optional">(optional)</span>
          <input type="time" value={item.time} onClick={openPickerOnClick} onChange={event => change({ time: event.target.value })} />
        </label>
      </div>
      <label>
        Venue <span className="optional">(optional)</span>
        <input value={item.venue} maxLength={500} onChange={event => change({ venue: event.target.value })} />
      </label>
      <label>
        Directions link <span className="optional">(optional)</span>
        <input
          type="url"
          value={item.directionsUrl}
          placeholder="https://maps.google.com/…"
          onChange={event => change({ directionsUrl: event.target.value })}
        />
      </label>

      <details className="event-more" open={hasMore}>
        <summary>More details <span className="optional">(optional, add later if you like)</span></summary>
        <label>
          End time
          <input
            type="time"
            value={item.endTime}
            onClick={openPickerOnClick}
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
        {legacyTravel ? (
          <fieldset className="travel-fields">
            <legend>Travel details</legend>
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
        ) : null}
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
// What has been used so far: a few small photos are under 0.1 MB, which "0.0 MB" made look like nothing was stored.
const usedSize = (bytes: number) => (bytes <= 0 ? "0 MB" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${mb(bytes)} MB`);

const mediaOffNotes: Record<string, string> = {
  NOT_SAVED_ONLINE: "Photos need your invitation to be saved online. Open it with your private link, or wait until it finishes saving.",
  NO_STORAGE: "Photo storage is not set up yet. Until it is, your invitation uses the design's own pictures.",
  MIGRATION_PENDING: "Photo storage is being set up. Please try again later."
};

// Photos: the first ones fill the design's large pictures, the rest form the gallery. Each is resized on this device
// before it is uploaded, so a phone photo of several MB becomes a few hundred KB.
// Which photo fills which of the design's large pictures: a photo goes where it was added; one with no place (added before places
// existed) fills a spot that is still empty, in order. The same rule as the design uses (packaged-templates.js).
function placePhotos(photos: PhotoItem[], slots: string[]) {
  const placed: Record<string, PhotoItem | undefined> = {};
  const loose: PhotoItem[] = [];
  for (const photo of photos) {
    if (photo.slot && photo.slot !== "gallery" && slots.includes(photo.slot) && !placed[photo.slot]) placed[photo.slot] = photo;
    else if (photo.slot !== "gallery") loose.push(photo);
  }
  for (const name of slots) if (!placed[name] && loose.length) placed[name] = loose.shift();
  const where = new Map<string, string>();
  for (const name of slots) if (placed[name]) where.set(placed[name]!.id, name);
  return { placed, where };
}

function GalleryPanel({ snap }: { snap: EditorSnapshot }) {
  const [progress, setProgress] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [added, setAdded] = useState("");
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
  const { placed, where } = placePhotos(snap.photos, slots);
  // `slot` is where the photos go: the gallery, or one of the design's large pictures (then `replaceId` swaps the photo that is there).
  const add = async (files: FileList | null, slot = "gallery", replaceId = "") => {
    if (!files || !files.length) return;
    setProblems([]);
    setAdded("");
    const onProgress = (p: { index: number; total: number }) => setProgress(`Adding photo ${p.index} of ${p.total}…`);
    const result = replaceId ? await bridge.mediaReplace(replaceId, files[0], onProgress) : await bridge.mediaUpload(Array.from(files), onProgress, slot);
    setProgress("");
    if (result.added) setAdded(`Added ${result.added} ${result.added === 1 ? "photo" : "photos"} to the ${slot === "gallery" ? "gallery" : (slotLabels[slot] ?? "picture").toLowerCase()}. Add more any time.`);
    setProblems(result.errors.map(error => (error.name ? `${error.name}: ${error.message}` : error.message)));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="editor-form">
      <p className="photo-usage" data-testid="photo-usage">
        <strong>{media.usage.count} of {media.limits.photos} photos</strong> · {usedSize(media.usage.bytes)} of {mb(media.limits.totalBytes)} MB
      </p>
      <p className="tiny muted">
        Add up to {media.limits.photos} photos, several at once. They go to the gallery; use the arrows to change the order.
        {slots.length ? " The design's own pictures are just below." : ""}
      </p>
      {slots.length ? (
        <section className="photo-places" aria-label="Pictures in this design">
          <h3>Pictures in this design</h3>
          <ul>
            {slots.map(name => {
              const photo = placed[name];
              const label = slotLabels[name] ?? "Large picture";
              return (
                <li key={name} data-photo-place={name}>
                  {photo ? <img src={photo.thumb} alt="" width={48} height={48} /> : <span className="photo-place-empty" aria-hidden="true" />}
                  <span className="photo-place-text">
                    <strong>{label}</strong>
                    <small>{photo ? "Your photo" : "Not added yet. The design's own picture is shown."}</small>
                  </span>
                  <label className={(!photo && full) || progress ? "button small outline photo-add disabled" : "button small outline photo-add"}>
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      disabled={(!photo && full) || Boolean(progress)}
                      onChange={event => { void add(event.target.files, name, photo ? photo.id : ""); event.target.value = ""; }}
                      aria-label={`${photo ? "Replace" : "Add"} ${label.toLowerCase()}`}
                    />
                    {photo ? "Replace" : "Add"}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div className="photo-add-bar">
        <label className={full || progress ? "button small photo-add disabled" : "button small photo-add"}>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            disabled={full || Boolean(progress)}
            onChange={event => void add(event.target.files)}
            aria-label="Add photos to the gallery"
          />
          {progress ? progress : full ? `Photo limit reached (${media.limits.photos})` : snap.photos.length ? "Add more to the gallery" : "Add to the gallery"}
        </label>
      </div>
      {added ? <p className="tiny photo-added" role="status">{added}</p> : null}
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
              {where.has(photo.id) ? <span className="photo-slot">{slotLabels[where.get(photo.id)!] ?? "Large picture"}</span> : <span className="photo-slot muted">Gallery</span>}
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
                <button type="button" className="link-button" onClick={() => { void bridge.confirm({ title: "Remove this photo?", message: "It will disappear from your invitation.", confirmLabel: "Remove photo", cancelLabel: "Keep it", danger: true }).then(ok => { if (ok) void bridge.mediaRemove(photo.id); }); }}>Remove</button>
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
            <p className="tiny muted">Guests can reply once your invitation is live. Until then the Reply button is a preview.</p>
          ) : null}
          <label className="check-row">
            <input type="checkbox" checked={snap.rsvpOpen} onChange={event => bridge.setRsvpOption("rsvpOpen", event.target.checked)} />
            Accepting replies
          </label>
          <label>
            Reply by (optional)
            <input type="date" value={snap.rsvpReplyBy} onClick={openPickerOnClick} onChange={event => bridge.setRsvpOption("rsvpReplyBy", event.target.value)} />
          </label>
          {snap.rsvp === "count" ? (
            <label>
              Most people in one reply
              <input type="number" min={1} max={20} value={snap.rsvpMaxParty} onChange={event => bridge.setRsvpOption("rsvpMaxParty", event.target.value)} />
            </label>
          ) : null}
          <p className="tiny muted">
            Guests give their name, if they will attend{snap.rsvp === "count" ? ", how many are coming" : ""}, and any meal or access needs.
            Only you can see replies. Once replies close, guests see “Replies are closed”
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
    void bridge.confirm({ title: `Delete ${name}'s reply?`, message: "This cannot be undone.", confirmLabel: "Delete reply", cancelLabel: "Keep it", danger: true }).then(ok => {
      if (ok) bridge.deleteReply(id).then(load, () => setState("error"));
    });
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
              <input type="search" placeholder="Search replies" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search replies" />
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
              <button type="button" className="button small outline" onClick={() => bridge.downloadRepliesCsv(data, counted)}>Download as spreadsheet</button>
            ) : null}
            <button type="button" className="link-button" onClick={load}>Refresh</button>
          </div>
        </>
      ) : state === "loading" ? <p className="tiny muted">Loading replies…</p> : null}
    </div>
  );
}

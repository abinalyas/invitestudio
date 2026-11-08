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
import { bridge, Device, EditorFields, EditorSnapshot, EventItem, EventPatch } from "./bridge";
import { useBridgeVersion } from "./extras";

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
  { key: "gallery", label: "Gallery", icon: "gallery", sectionId: "gallery" },
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

function sectionHint(key: SectionKey, snap: EditorSnapshot): string {
  if (key === "home") return "Always shown";
  if (key === "story") return snap.storyCopy ? "Written" : "Not written yet";
  if (key === "functions") {
    const count = snap.events.length;
    return count ? `${count} ${count === 1 ? "event" : "events"}` : "No events yet";
  }
  if (key === "gallery") return snap.galleryCount ? `${snap.galleryCount} photos` : "Photos not available yet";
  return "Guest responses not live yet";
}

export function EditorPage() {
  useBridgeVersion();
  const snap = bridge.snapshot();
  const [device, setDevice] = useState<Device>("mobile");
  const [active, setActive] = useState<SectionKey>("home");
  const [designsOpen, setDesignsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");
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

        <aside className="editor-controls" id="panel-edit" aria-labelledby="editing-heading">
          <p className="editing-kicker">Editing</p>
          <h2 id="editing-heading">{activeItem.label}</h2>

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
        Preview is private. <strong>Share invitation</strong> gives your invitation a web link that anyone you send it to can open.
        Nothing is public until you do, and you can edit afterwards or take it offline any time.
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
        <input value={item.title} onChange={event => change({ title: event.target.value })} />
      </label>
      <div className="two-up">
        <label>
          Date <span className="optional">(optional)</span>
          <input type="date" value={item.date} onChange={event => change({ date: event.target.value })} />
        </label>
        <label>
          Start time <span className="optional">(optional)</span>
          <input value={item.time} placeholder="4:00 PM" onChange={event => change({ time: event.target.value })} />
        </label>
      </div>
      <label>
        Venue <span className="optional">(optional)</span>
        <input value={item.venue} onChange={event => change({ venue: event.target.value })} />
      </label>

      <details className="event-more" open={hasMore}>
        <summary>More details <span className="optional">(optional, add later if you like)</span></summary>
        <label>
          End time
          <input value={item.endTime} placeholder="7:00 PM" onChange={event => change({ endTime: event.target.value })} />
        </label>
        <label>
          Description
          <textarea rows={2} value={item.description} onChange={event => change({ description: event.target.value })} />
        </label>
        <label>
          Dress code
          <input value={item.dressCode} onChange={event => change({ dressCode: event.target.value })} />
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
            <textarea rows={2} value={item.parking} onChange={event => change({ parking: event.target.value })} />
          </label>
          <label>
            Travel and accommodation
            <textarea rows={2} value={item.accommodation} onChange={event => change({ accommodation: event.target.value })} />
          </label>
          <label>
            Accessibility
            <textarea rows={2} value={item.accessibility} onChange={event => change({ accessibility: event.target.value })} />
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

// Photos need persistent storage, which does not exist yet. The empty state says so.
function GalleryPanel({ snap }: { snap: EditorSnapshot }) {
  return (
    <div className="editor-form">
      <p className="empty-state">{snap.galleryCount ? `${snap.galleryCount} photos` : "No photos yet."}</p>
      <p className="tiny muted">Photo uploads unlock when photo storage is available. Until then, your invitation has no gallery section.</p>
    </div>
  );
}

const rsvpOptions: Array<[string, string]> = [
  ["count", "RSVP with guest count"],
  ["rsvp", "RSVP only"],
  ["contact", "Contact details only"],
  ["none", "No response form"]
];

// The preference is stored for launch. Guest responses are not collected today.
function RsvpPanel({ snap }: { snap: EditorSnapshot }) {
  return (
    <div className="editor-form">
      <div className="notice" role="note">
        <strong>Guest responses are not live yet.</strong>
        <p className="tiny">You can choose how the response form will work at launch. Nothing is collected from guests today.</p>
      </div>
      <label>
        Response form at launch
        <select value={snap.rsvp} onChange={event => bridge.setRsvp(event.target.value)}>
          {rsvpOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

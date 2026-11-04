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
  const [device, setDevice] = useState<Device>("desktop");
  const [active, setActive] = useState<SectionKey>("home");
  const [designsOpen, setDesignsOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("preview");
  const [picked, setPicked] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (canvasRef.current && snap.available) bridge.renderInvitation(canvasRef.current, device);
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
      canvasRef.current?.shadowRoot
        ?.querySelector<HTMLElement>(`[data-section="${target}"]`)
        ?.scrollIntoView({ behavior: "auto", block: "nearest" });
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
          <button className="editor-publish" type="button" onClick={() => bridge.openPublish()}>
            {snap.published ? "Published" : "Publish"} <Icon name={snap.published ? "check" : "chevron"} size={17} />
          </button>
          <button className="editor-action editor-advanced" type="button" onClick={() => bridge.openAdvanced()}>
            Advanced editing
          </button>
        </div>
      </header>

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
          <button type="button" className="btn small mobile-only" onClick={() => bridge.openAdvanced()}>Advanced editing</button>
        </aside>

        <section className="editor-canvas-area" id="panel-preview">
          <div className={`editor-browser ${device}`}>
            <div className="browser-bar">
              <span className="browser-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="browser-address">▣ {addressLabel}</span>
            </div>
            <div className="editor-site figma-canvas" ref={canvasRef} onClick={selectFromPreview} />
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
                <input value={snap.title} onChange={event => set({ title: event.target.value })} />
              </label>
              <label>
                Welcome message <span className="optional">(optional)</span>
                <textarea rows={3} value={snap.message} onChange={event => set({ message: event.target.value })} />
              </label>
              <label>
                Date <span className="optional">(optional)</span>
                <span className="input-with-icon">
                  <Icon name="calendar" size={18} />
                  <input type="date" value={snap.date} onChange={event => set({ date: event.target.value })} />
                </span>
              </label>
              <label>
                Location <span className="optional">(optional)</span>
                <span className="input-with-icon">
                  <Icon name="pin" size={18} />
                  <input value={snap.location} onChange={event => set({ location: event.target.value })} />
                </span>
              </label>
              <label>
                Hosts <span className="optional">(optional)</span>
                <input value={snap.hosts} placeholder="Names shown with the couple" onChange={event => set({ hosts: event.target.value })} />
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

// Events carry their own travel details: directions, parking, stays and access.
// Structured per event so broader travel information can be added later.
function EventsPanel({ snap }: { snap: EditorSnapshot }) {
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

  return (
    <div className="event-form">
      <label className="visibility-field">
        <input type="checkbox" checked={item.visible} onChange={event => change({ visible: event.target.checked })} />
        Show this event on the invitation
      </label>
      <label>
        Event name
        <input value={item.title} onChange={event => change({ title: event.target.value })} />
      </label>
      <div className="two-up">
        <label>
          Date
          <input type="date" value={item.date} onChange={event => change({ date: event.target.value })} />
        </label>
        <label>
          Start time
          <input value={item.time} placeholder="4:00 PM" onChange={event => change({ time: event.target.value })} />
        </label>
      </div>
      <label>
        End time <span className="optional">(optional)</span>
        <input value={item.endTime} placeholder="7:00 PM" onChange={event => change({ endTime: event.target.value })} />
      </label>
      <label>
        Venue
        <input value={item.venue} onChange={event => change({ venue: event.target.value })} />
      </label>
      <label>
        Description <span className="optional">(optional)</span>
        <textarea rows={2} value={item.description} onChange={event => change({ description: event.target.value })} />
      </label>
      <label>
        Dress code <span className="optional">(optional)</span>
        <input value={item.dressCode} onChange={event => change({ dressCode: event.target.value })} />
      </label>

      <fieldset className="travel-fields">
        <legend>Travel details <span className="optional">(optional)</span></legend>
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

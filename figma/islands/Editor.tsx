// Editor screen adapted from the Figma Make export (EditorPage in App.tsx, lines 516-788).
//
// Adaptations, all deliberate:
// - Fields bind to the cloud draft through the bridge. Save status comes from
//   cloud-sync, and publish and preview use the existing flows.
// - The mock canvas is replaced by the real invitation renderer, so the preview
//   matches what guests see.
// - "Add page" and local blob photo uploads are removed: custom pages and photo
//   storage do not exist in the backend yet.
// - Everything the design does not cover stays in the existing editor, reachable
//   through "Advanced editing".
import { useEffect, useRef, useState } from "react";
import { Icon, IconName, Logo } from "./shared";
import { bridge, Device, EditorFields } from "./bridge";
import { useBridgeVersion } from "./extras";

type PageItem = { icon: IconName; label: string; section?: string };

// Pages map onto backend sections where one exists. Travel details are shown
// under Events, which is where the backend stores parking and directions.
const pages: PageItem[] = [
  { icon: "home", label: "Home" },
  { icon: "heart", label: "Our Story", section: "story" },
  { icon: "calendar", label: "Events", section: "functions" },
  { icon: "gallery", label: "Gallery", section: "gallery" },
  { icon: "check", label: "RSVP", section: "rsvp" },
  { icon: "pin", label: "Travel" }
];

const unsplashImage = /^https:\/\/images\.unsplash\.com\//;

export function EditorPage() {
  useBridgeVersion();
  const snap = bridge.snapshot();
  const [device, setDevice] = useState<Device>("desktop");
  const [activePage, setActivePage] = useState("Home");
  const [imageNotice, setImageNotice] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const page = pages.find(item => item.label === activePage) ?? pages[0];

  useEffect(() => {
    if (canvasRef.current && snap.available) bridge.renderInvitation(canvasRef.current, device);
  }, [snap, device]);

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
  const sectionVisible = page.section ? snap.sections[page.section] !== false : true;

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
          <button className="editor-action" type="button" onClick={() => bridge.openPreview()}>
            <Icon name="eye" size={20} /> Preview
          </button>
          <button className="editor-action" type="button" onClick={() => bridge.saveNow()} aria-live="polite">
            <Icon name="cloud" size={20} /> {snap.saveLabel}
          </button>
          <button className="editor-publish" type="button" onClick={() => bridge.openPublish()}>
            {snap.published ? "Published" : "Publish"} <Icon name={snap.published ? "check" : "chevron"} size={17} />
          </button>
          <button className="editor-action" type="button" onClick={() => bridge.openAdvanced()}>
            Advanced editing
          </button>
          <span className="editor-avatar">
            <Icon name="user" size={20} />
          </span>
        </div>
      </header>

      <div className="editor-workspace">
        <aside className="editor-pages">
          <div className="editor-panel-heading">
            <h2>Pages</h2>
          </div>
          <nav>
            {pages.map(item => (
              <button
                key={item.label}
                type="button"
                className={activePage === item.label ? "active" : ""}
                onClick={() => setActivePage(item.label)}
              >
                <Icon name={item.icon} size={22} />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="editor-side-botanical">
            <i />
            <i />
            <i />
          </div>
        </aside>

        <section className="editor-canvas-area">
          <div className={`editor-browser ${device}`}>
            <div className="browser-bar">
              <span className="browser-dots">
                <i />
                <i />
                <i />
              </span>
              <span className="browser-address">▣ {addressLabel}</span>
            </div>
            <div className="editor-site figma-canvas" ref={canvasRef} />
          </div>
        </section>

        <aside className="editor-controls">
          <h2>Edit content</h2>
          <div className="editing-note">
            <Icon name="edit" size={27} />
            <div>
              <strong>Content editing only</strong>
              <p>Your template design stays the same. Update your text and details here.</p>
            </div>
          </div>

          <h3>
            {activePage} — {activePage === "Home" ? "Hero section" : "Section"}
          </h3>

          {activePage === "Home" ? (
            <div className="editor-form">
              <label>
                Pre-title
                <input value={snap.pretitle} onChange={event => set({ pretitle: event.target.value })} />
              </label>
              <label>
                Couple names
                <input value={snap.title} onChange={event => set({ title: event.target.value })} />
              </label>
              <label>
                Date
                <span className="input-with-icon">
                  <Icon name="calendar" size={18} />
                  <input type="date" value={snap.date} onChange={event => set({ date: event.target.value })} />
                </span>
              </label>
              <label>
                Location
                <span className="input-with-icon">
                  <Icon name="pin" size={18} />
                  <input value={snap.location} onChange={event => set({ location: event.target.value })} />
                </span>
              </label>
              <label>
                Button label
                <input value={snap.buttonLabel} onChange={event => set({ buttonLabel: event.target.value })} />
              </label>
            </div>
          ) : page.section ? (
            <div className="editor-form">
              <label className="page-toggle">
                <input
                  type="checkbox"
                  checked={sectionVisible}
                  onChange={event => bridge.setSectionVisible(page.section as string, event.target.checked)}
                />
                Show {activePage} on the invitation
              </label>
              {page.section === "story" ? (
                <>
                  <label>
                    Section heading
                    <input value={snap.storyTitle} onChange={event => set({ storyTitle: event.target.value })} />
                  </label>
                  <label>
                    Description
                    <textarea rows={4} value={snap.storyCopy} onChange={event => set({ storyCopy: event.target.value })} />
                  </label>
                </>
              ) : (
                <p className="tiny muted">Add the details for {activePage.toLowerCase()} under Advanced editing.</p>
              )}
            </div>
          ) : (
            <p className="tiny muted">Travel details such as parking and directions are added to each event under Advanced editing.</p>
          )}

          <div className="image-control">
            <strong>Hero image</strong>
            <div>
              {snap.heroImageUrl ? <img src={snap.heroImageUrl} alt="" /> : null}
              <label>
                Image link
                <input
                  type="url"
                  placeholder="https://images.unsplash.com/…"
                  defaultValue={snap.heroImageUrl}
                  onBlur={event => {
                    const value = event.target.value.trim();
                    if (value && !unsplashImage.test(value)) {
                      setImageNotice("Use an Unsplash image link until photo uploads arrive.");
                      return;
                    }
                    setImageNotice("");
                    set({ heroImageUrl: value });
                  }}
                />
              </label>
              {imageNotice ? <p className="tiny recovery-error" role="alert">{imageNotice}</p> : null}
              <p className="tiny muted">Photo uploads are part of the upcoming media release.</p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

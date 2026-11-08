// Template detail screen. Everything shown comes from galleryTemplates in shared.tsx, so the page
// only claims what the template and the editor really do.
import { useEffect, useRef, useState } from "react";
import { Icon, Logo, backendTemplateIds, editableItems, galleryTemplates, guestSections } from "./shared";
import { bridge } from "./bridge";
export function TemplateDetailPage({ templateId }: { templateId: number }) {
  const template =
    galleryTemplates.find((item) => item.id === templateId) ??
    galleryTemplates[0]
  const [menuOpen, setMenuOpen] = useState(false)
  const screenRef = useRef<HTMLDivElement>(null)
  const [cue, setCue] = useState(false)

  // Scroll cue: shown while the invitation can scroll and is still at the top.
  const updateCue = () => {
    const element = screenRef.current
    setCue(Boolean(element) && element!.scrollHeight > element!.clientHeight + 24 && element!.scrollTop < 24)
  }

  // The real template, with example names and content, inside the phone. It stays beside the details.
  useEffect(() => {
    if (!screenRef.current) return
    bridge.renderTemplateDemo(screenRef.current, template.backendId)
    screenRef.current.scrollTop = 0
    updateCue()
    const timer = window.setTimeout(updateCue, 500)
    return () => window.clearTimeout(timer)
  }, [template.backendId])

  return (
    <main className="detail-page">
      <header className="site-header gallery-shell gallery-header">
        <Logo />
        <button
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "nav open" : "nav"}>
          <a className="active" href="/templates">
            Templates
          </a>
          <a href="/#features">Features</a>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </nav>
        <div className="header-actions" />
      </header>

      <div className="gallery-shell detail-content">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <a href="/templates">←</a>
          <a href="/templates">Templates</a>
          <span>›</span>
          <span>{template.title}</span>
        </nav>

        <div className="detail-layout">
          <div className="detail-showcase">
            <div className="phone-stage" style={{ background: `${template.palette[0]}55` }}>
              <div className="detail-device">
                <div
                  className="detail-screen figma-canvas"
                  ref={screenRef}
                  onScroll={updateCue}
                  role="region"
                  aria-label={`${template.title} preview, scrollable`}
                />
                <div className={cue ? "scroll-cue detail-cue show" : "scroll-cue detail-cue"} aria-hidden="true">
                  <span>Scroll</span>
                  <Icon name="chevron" size={18} />
                </div>
              </div>
            </div>
            <p className="detail-note">
              Scroll the phone to see the whole invitation. Example names and details are shown; yours replace them.
            </p>
          </div>

          <aside className="detail-info">
            <span className="section-kicker">Wedding invitation</span>
            <h1>{template.title}</h1>
            <p>{template.tagline}</p>
            <div className="detail-tags">
              {template.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="detail-actions">
              <button className="button" onClick={() => bridge.startSetup(template.backendId)}>
                <Icon name="edit" size={19} />
                Start with this design
              </button>
            </div>
            <p className="detail-path">
              Guided setup takes about a minute: your names, date and place, then the editor.{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => bridge.createDraft(backendTemplateIds[template.id], template.id, template.names)}
              >
                Quick start: skip setup and open the editor
              </button>
            </p>

            <div className="detail-block">
              <h2>Opening</h2>
              <p className="detail-lead">{template.opening.name}</p>
              <p>{template.opening.text}</p>
            </div>

            <div className="detail-block">
              <h2>Colours</h2>
              <div className="swatches">
                {template.palette.map((colour) => (
                  <span key={colour} className="swatch" style={{ background: colour }} title={colour} />
                ))}
              </div>
              <p>The colours and fonts are set by the design. You change the content, not the look.</p>
            </div>

            <div className="included-panel">
              <h2>What you can edit</h2>
              <ul className="check-list">
                {editableItems.map((label) => (
                  <li key={label}>
                    <Icon name="check" size={19} />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="included-panel">
              <h2>What your guests see</h2>
              <ol className="guest-sections">
                {guestSections.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}

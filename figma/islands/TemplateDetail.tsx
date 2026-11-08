// Template detail screen. Everything shown comes from galleryTemplates in shared.tsx, so the page
// only claims what the template and the editor really do.
import { useState } from "react";
import { Icon, Logo, backendTemplateIds, editableItems, galleryTemplates, guestSections } from "./shared";
import { bridge } from "./bridge";
export function TemplateDetailPage({ templateId }: { templateId: number }) {
  const template =
    galleryTemplates.find((item) => item.id === templateId) ??
    galleryTemplates[0]
  const [menuOpen, setMenuOpen] = useState(false)

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
              <div className="phone-frame">
                <img src={template.phone} alt={`The ${template.title} cover, shown with example names`} />
              </div>
            </div>
            <p className="detail-note">
              The cover with example names. Your own details fill the template.
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
              <button
                className="button outline"
                onClick={() => bridge.previewTemplate(template.backendId)}
              >
                <Icon name="eye" size={20} /> Live preview
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

// Template detail screen from the Figma Make export (App.tsx lines 317-515).
import { useState } from "react";
import { Icon, IconName, Logo, backendTemplateIds, galleryTemplates, styleOptions } from "./shared";
import { bridge } from "./bridge";
export function TemplateDetailPage({ templateId }: { templateId: number }) {
  const template =
    galleryTemplates.find((item) => item.id === templateId) ??
    galleryTemplates[0]
  const [activePage, setActivePage] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const detailHero =
    template.id === 1
      ? "https://images.unsplash.com/photo-1785336872719-2e338088a4b6?auto=format&fit=crop&w=1600&q=90"
      : template.image
  // Scene templates carry their own artwork, so every page tile shows it rather than stock photos.
  const own = "scene" in template && template.scene
  const pagePreviews = own ? ["Home", "Our Story", "Events", "Gallery", "RSVP", "Travel"].map((label) => ({ label, image: template.image })) : [
    { label: "Home", image: detailHero },
    {
      label: "Our Story",
      image:
        "https://images.unsplash.com/photo-1633104502699-b2ecf0fee294?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "Events",
      image:
        "https://images.unsplash.com/photo-1710587384897-b1390bd46cc6?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "Gallery",
      image:
        "https://images.unsplash.com/photo-1754782921180-674165dec130?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "RSVP",
      image:
        "https://images.unsplash.com/photo-1599366279015-524df1ed5d5c?auto=format&fit=crop&w=700&q=80",
    },
    {
      label: "Travel",
      image:
        "https://images.unsplash.com/photo-1572973304710-1f646f145fba?auto=format&fit=crop&w=700&q=80",
    },
  ]
  const included = [
    ["layers", "Multi-section wedding website"],
    ["calendar", "Event details (multiple functions)"],
    ["pin", "Travel & stay information"],
    ["device", "Works on all devices"],
  ] as const

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
        <div className="header-actions">
          <a className="button small" href="/#pricing">
            Get started
          </a>
        </div>
      </header>

      <div className="detail-botanical detail-botanical-top">
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="detail-botanical detail-botanical-bottom">
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="gallery-shell detail-content">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb">
          <a href="/templates">←</a>
          <a href="/templates">Templates</a>
          <span>›</span>
          <span>{template.title}</span>
        </nav>

        <div className="detail-layout">
          <div className="detail-showcase">
            <div className="site-preview">
              <img src={pagePreviews[activePage].image} alt="" />
              <span className="site-preview-shade" />
              <div className="site-preview-nav">
                <span>{template.names}</span>
                <div>
                  <span>Our Story</span>
                  <span>Events</span>
                  <span>Travel</span>
                  <span>RSVP</span>
                </div>
              </div>
              <div className="site-preview-copy">
                <small>The wedding of</small>
                <h1>{template.names.replace(" & ", "\n&\n")}</h1>
                <i />
                <p>24 AUG 2026</p>
                <span>KOCHI, KERALA</span>
              </div>
              <a
                className="preview-site-button"
                href={detailHero}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="play" size={17} /> Preview live site
              </a>
            </div>

            <section className="template-pages">
              <h2>Pages in this template</h2>
              <div className="page-thumbnails">
                {pagePreviews.map((page, index) => (
                  <button
                    className={activePage === index ? "active" : ""}
                    key={page.label}
                    onClick={() => setActivePage(index)}
                  >
                    <span>
                      <img src={page.image} alt="" />
                    </span>
                    {page.label}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <aside className="detail-info">
            <span className="popular-badge">
              <Icon name="sparkle" size={17} /> Popular
            </span>
            <h1>{template.title}</h1>
            <p>
              A timeless and elegant design with thoughtful details, perfect for
              a modern celebration that feels uniquely yours.
            </p>
            <div className="detail-tags">
              {template.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              <span>Elegant</span>
            </div>
            <div className="detail-actions">
              <button
                className="button"
                onClick={() => bridge.createDraft(backendTemplateIds[template.id], template.id)}
              >
                <Icon name="edit" size={19} />
                Use this template
              </button>
              <a
                className="button outline"
                href={detailHero}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="eye" size={20} /> Live preview
              </a>
            </div>

            <div className="included-panel">
              <h2>What’s included</h2>
              <ul>
                {included.map(([icon, label]) => (
                  <li key={label}>
                    <Icon name={icon} size={23} />
                    <span>{label}</span>
                    <Icon name="check" size={19} />
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}


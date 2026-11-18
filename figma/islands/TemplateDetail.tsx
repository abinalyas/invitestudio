// Template detail screen. Everything shown comes from galleryTemplates in shared.tsx, so the page
// only claims what the template and the editor really do.
import { useEffect, useRef, useState } from "react";
import { Icon, Logo, editableItems, galleryTemplates, guestSections } from "./shared";
import { bridge } from "./bridge"
import { MyProjectsLink } from "./extras"
import { formatMoney, tierOf, usePricing } from "./pricing";
export function TemplateDetailPage({ templateId }: { templateId: number }) {
  const template =
    galleryTemplates.find((item) => item.id === templateId) ??
    galleryTemplates[0]
  const [menuOpen, setMenuOpen] = useState(false)
  const screenRef = useRef<HTMLDivElement>(null)
  const [cue, setCue] = useState(false)
  const { data: pricing } = usePricing()
  const tier = tierOf(pricing, template.backendId)

  // Scroll cue: shown while the invitation can scroll and is still at the top.
  const updateCue = () => {
    const element = screenRef.current
    // While the opening screen is still up, the cue would point at something hidden behind it.
    const opening = Boolean(element?.shadowRoot?.querySelector("[data-intro]:not([data-done])"))
    setCue(!opening && Boolean(element) && element!.scrollHeight > element!.clientHeight + 24 && element!.scrollTop < 24)
  }

  // The real template, with example names and content, inside the phone. It stays beside the details.
  useEffect(() => {
    if (!screenRef.current) return
    bridge.renderTemplateDemo(screenRef.current, template.backendId)
    screenRef.current.scrollTop = 0
    updateCue()
    const timer = window.setTimeout(updateCue, 500)
    const node = screenRef.current
    node.addEventListener("intro-done", updateCue)

    // The opening starts by itself once the phone is on screen (the "Click to start" button stays as the fallback, e.g. when
    // the phone is below the fold on a small screen: it starts when scrolled into view, so the visitor never misses it).
    let visible = typeof IntersectionObserver === "undefined"
    let started = false
    let poll = 0
    const tryStart = () => {
      if (started || !visible) return
      const button = node.shadowRoot?.querySelector<HTMLElement>("[data-intro][data-wait] [data-intro-start]")
      if (button) { started = true; button.click(); updateCue() }
    }
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
      tryStart()
    }, { threshold: 0.3 })
    observer?.observe(node)
    // The template loads a moment after the page does, so look again until the opening exists (or give up).
    let tries = 0
    poll = window.setInterval(() => { tryStart(); if (started || ++tries > 40) window.clearInterval(poll) }, 250)
    return () => { window.clearTimeout(timer); window.clearInterval(poll); observer?.disconnect(); node.removeEventListener("intro-done", updateCue) }
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
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </nav>
        <div className="header-actions"><MyProjectsLink /></div>
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
            {tier && pricing && (
              <p className="detail-price" data-testid="detail-price">
                <strong>{formatMoney(tier.amountMinor, pricing.currency, pricing.locale)}</strong>
                <span>
                  {tier.name} design, one-time when you publish.{" "}
                  {pricing.mode === "live" ? "" : "Free during early access."}
                </span>
              </p>
            )}
            <div className="detail-actions">
              <button className="button" onClick={() => bridge.startSetup(template.backendId)}>
                <Icon name="edit" size={19} />
                Start with this design
              </button>
            </div>
            <p className="detail-path">Next: your names, date and place. It takes about a minute, and you can edit your details afterwards.</p>

            <div className="detail-block">
              <h2>Opening</h2>
              <p className="detail-lead">{template.opening.name}</p>
              <p>{template.opening.text}</p>
            </div>

            <div className="detail-block">
              <h2>This design’s colours</h2>
              <div className="swatches" role="img" aria-label="The colour palette of this design">
                {template.palette.map((colour) => (
                  <span key={colour} className="swatch" style={{ background: colour }} />
                ))}
              </div>
              <p>
                Every design has its own colours and fonts, chosen to look good together. They stay as designed, so for a different look, choose another design.{" "}
                <a href="/templates">Browse all designs</a>
              </p>
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

      {/* On a phone the main button stays at the bottom of the screen, so it is never a long scroll away. */}
      <div className="detail-sticky">
        <span>
          <strong>{template.title}</strong>
          {tier && pricing ? <small>{formatMoney(tier.amountMinor, pricing.currency, pricing.locale)} · one-time</small> : <small>Free to try</small>}
        </span>
        <button className="button" type="button" onClick={() => bridge.startSetup(template.backendId)}>
          Start with this design
        </button>
      </div>
    </main>
  )
}

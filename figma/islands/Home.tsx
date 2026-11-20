// Home screen from the Figma Make export (App.tsx lines 1054-1476).
import { useState } from "react";
import { Art, Icon, Logo, faqs, templates, galleryTemplates, testimonials } from "./shared";
import { formatMoney, usePricing } from "./pricing";
import { bridge } from "./bridge";
import { CustomDesignCard, MyProjectsLink, RecoveryBanner, StartCreatingLink, TalkToUs } from "./extras";
import { TemplateStrip } from "./TemplateStrip";
export function HomePage() {
  // The Instagram address is set once in site-config.js (social.instagram); with none set, no social icon is shown.
  const instagramUrl = ((window as unknown as { INVITESTUDIO_SITE?: { social?: { instagram?: string } } }).INVITESTUDIO_SITE?.social?.instagram || "").trim()
  const { data: pricing } = usePricing()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="home-page">
      <RecoveryBanner />
      <section className="hero">
        <div className="hero-deco" aria-hidden="true">
          <img className="deco deco-floral-left" src="/assets/hero/floral-cluster-left.webp" alt="" width={394} height={425} fetchPriority="low" decoding="async" />
          <img className="deco deco-floral-right" src="/assets/hero/floral-cluster-right.webp" alt="" width={374} height={323} fetchPriority="low" decoding="async" />
          <img className="deco deco-petals" src="/assets/hero/scattered-petals.webp" alt="" width={189} height={174} fetchPriority="low" decoding="async" />
          <img className="deco deco-fabric" src="/assets/hero/ivory-fabric-drape.webp" alt="" width={474} height={412} fetchPriority="low" decoding="async" />
        </div>
        <header className="site-header shell">
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
          <nav className={menuOpen ? "nav open" : "nav"} onClick={() => setMenuOpen(false)}>
            <a href="/templates">Templates</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="header-actions">
            <MyProjectsLink />
            <StartCreatingLink />
          </div>
        </header>

        <div className="hero-grid shell">
          <div className="hero-copy">
            <p className="eyebrow">Wedding invitation websites</p>
            <h1>
              <span>Create a wedding</span>
              <span>website your guests</span>
              <span>
                will <em>love</em>
              </span>
            </h1>
            <p className="lead hero-promise">
              <strong>Preview your own invitation free. Pay only when you make it live.</strong>
            </p>
            <p className="lead hero-sub">
              Beautiful, interactive wedding invitations with
              <br className="desktop-only" /> animations, events and travel details.
            </p>
            <div className="hero-buttons">
              <a className="button" href="/templates">
                Start your invitation <Icon name="arrow" size={18} />
              </a>
              <a className="button outline" href="#how">
                See how it works
              </a>
            </div>
            <div className="trust-row">
              <span>
                <Icon name="sparkle" size={18} /> Free to build and preview
              </span>
              <span>
                <Icon name="device" size={18} /> Works on all devices
              </span>
              <span>
                <Icon name="heart" size={18} /> Made for modern weddings
              </span>
            </div>
          </div>

          <div className="hero-art">
            <img
              className="hero-envelope"
              src="/assets/hero/hero-envelope-invitation.webp"
              alt="Floral wedding invitation in a green envelope"
              width={853}
              height={738}
              fetchPriority="high"
            />
          </div>
        </div>
      </section>

      <section className="section shell how" id="how">
        <Art name="flowers-a" className="deco deco-edge-l deco-how-l" />
        <Art name="gypsophila" className="deco deco-edge-r deco-how-r" />
        <Art name="petal-1" className="deco deco-petal deco-how-petal" />
        <div className="section-heading centered">
          <span className="section-kicker">Simple by design</span>
          <h2>How it works</h2>
          <p>From first look to shared link in four steps. You only pay at step 4.</p>
        </div>
        <div className="steps four">
          {[
            ["laptop", "1", "Choose a design", "Browse our collections and pick the one that feels like you", "Free"],
            ["notebook", "2", "Add your details", "Your names, date, events, photos and story", "Free"],
            ["eye", "3", "Preview it", "See exactly what guests will see, as often as you like", "Free"],
            ["plane", "4", "Publish and share", "Pay once, get your link and send it on WhatsApp, text or email", "One-time payment"],
          ].map(([icon, number, title, text, tag], index) => (
            <article key={title}>
              <span className="step-icon">
                <Art name={`icon-${icon}`} className="step-art" />
              </span>
              <strong className="number">{number}</strong>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className={index === 3 ? "step-tag paid" : "step-tag"}>{tag}</span>
              </div>
              {index < 3 && <span className="step-link" aria-hidden="true" />}
            </article>
          ))}
        </div>
      </section>

      <section className="section shell what" id="features">
        <div className="section-heading centered">
          <span className="section-kicker">A complete digital invitation</span>
          <h2>Everything you need for your big day</h2>
          <p>All the essentials in one place, on every plan.</p>
        </div>
        <div className="what-grid">
          {[
            [
              "laptop",
              "Your digital invitation",
              "A beautiful, personalised wedding website for your day.",
              ["Names and date", "Events and venues", "Countdown"],
            ],
            [
              "link",
              "Share with one link",
              "Send your invitation to everyone you love, in seconds.",
              ["WhatsApp", "Text and email", "Works on any phone"],
            ],
            [
              "people",
              "Guests and memories",
              "Know who is coming and share your story with them.",
              ["Guest RSVP", "Photo gallery", "Travel details"],
            ],
          ].map(([icon, title, text, chips]) => (
            <article key={title as string}>
              <Art name={`icon-${icon}`} className="what-art" />
              <h3>{title}</h3>
              <p>{text}</p>
              <ul>
                {(chips as string[]).map((chip) => (
                  <li key={chip}>{chip}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <ul className="what-assure">
          <li><Art name="icon-notebook" className="assure-art" /> Edit anytime</li>
          <li><Art name="icon-phone" className="assure-art" /> Looks great on any device</li>
          <li><span className="assure-blob"><Icon name="cloud" size={22} /></span> No hosting or setup needed</li>
        </ul>
      </section>

      <section className="section shell templates" id="templates">
        <div className="section-heading row">
          <div>
            <Art name="eucalyptus" className="deco deco-edge-l deco-tpl" />
            <span className="section-kicker">Curated designs</span>
            <h2>Explore beautiful templates</h2>
            <p>Start from a design, preview it, then make it yours.</p>
          </div>
          <a href="/templates">
            View all templates <Icon name="arrow" size={18} />
          </a>
        </div>
        <TemplateStrip />
      </section>

      <section className="section shell pricing" id="pricing">
        <div className="section-heading row">
          <Art name="flowers-b" className="deco deco-corner-r deco-pricing" />
          <Art name="petal-2" className="deco deco-petal deco-pricing-petal" />
          <div>
            <span className="section-kicker">Choose your collection</span>
            <h2>Find the perfect design for your big day</h2>
            <p>
              Same tools in every plan. The plan decides which designs you can choose from.
            </p>
          </div>
        </div>
        <div className="free-paid">
          <div>
            <Art name="icon-eye" className="fp-art" />
            <p>
              <strong>Free</strong>
              <span>Build, edit and preview your invitation, as often as you like.</span>
            </p>
          </div>
          <div>
            <Art name="icon-shield" className="fp-art" />
            <p>
              <strong>Pay once, to publish</strong>
              <span>One payment, no subscription. The price is shown before you pay.</span>
            </p>
          </div>
        </div>
        <div className="plans">
          {(pricing ? pricing.tiers : []).map((tier) => {
            const designs = galleryTemplates.filter((item) => (pricing!.templates[item.backendId] || "classic") === tier.id)
            return (
              <article className={tier.id === "premium" ? "plan featured" : "plan"} key={tier.id}>
                {tier.id === "premium" && <span className="popular">Most popular</span>}
                <h3>{tier.name}</h3>
                <p>{tier.tagline}</p>
                <div className="price">
                  {formatMoney(tier.amountMinor, pricing!.currency, pricing!.locale)}
                  <small> one-time</small>
                </div>
                <ul>
                  {tier.features.map((feature) => (
                    <li key={feature}>
                      <Icon name="check" size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <p className="plan-designs">
                  {designs.length} {designs.length === 1 ? "design" : "designs"}: {designs.slice(0, 3).map((item) => item.title).join(", ")}
                  {designs.length > 3 ? " and more" : ""}
                </p>
                <a className={tier.id === "premium" ? "button" : "button outline"} href={`/templates?tier=${tier.id}`}>
                  See {tier.name} designs
                </a>
              </article>
            )
          })}
        </div>
        {pricing ? (
          <p className="pricing-note">
            {pricing.mode === "live"
              ? "Pay once to publish. Your invitation stays online until 2 months after your event."
              : "Publishing is free during early access while we finish setting up payments. These are the prices that will apply afterwards."}
          </p>
        ) : (
          <p className="pricing-note">Prices are shown when you choose a design.</p>
        )}
      </section>

      <section className="shell switch-strip">
        <Art name="icon-layers" className="switch-art" />
        <Art name="gold-swoosh" className="switch-swoosh" />
        <div>
          <h2>Edit anytime. Switch designs whenever you want.</h2>
          <p>
            Even after you publish. Change your mind about the look? Move to any design in your plan or a lower one, at no extra cost, and all your details come with you.
          </p>
        </div>
      </section>

      {testimonials.length > 0 && (
        <section className="section shell testimonials">
          <div className="section-heading centered">
            <span className="section-kicker">From couples we have made websites for</span>
            <h2>What couples are saying</h2>
          </div>
          <div className="testimonial-grid">
            {testimonials.map((item) => (
              <figure key={item.names}>
                {item.photo ? <img src={item.photo} alt="" width={64} height={64} loading="lazy" decoding="async" /> : null}
                <blockquote>“{item.quote}”</blockquote>
                <figcaption>
                  {item.names}
                  {item.link ? (
                    <a href={item.link} target="_blank" rel="noopener noreferrer"> See their invitation</a>
                  ) : null}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="section shell faq">
        <div className="faq-layout">
          <Art name="arch" className="faq-art" />
          <div className="faq-main">
          <div className="section-heading row">
            <div>
              <span className="section-kicker">Questions, answered</span>
              <h2>Frequently asked questions</h2>
              <p>Have a question? We’re here to help.</p>
            </div>
            <a href="#faq-list">
              View all FAQs <Icon name="arrow" size={18} />
            </a>
          </div>
          <div className="faq-grid" id="faq-list">
            {faqs.map(([question, answer], index) => (
              <div
                className={openFaq === index ? "faq-item open" : "faq-item"}
                key={question}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  aria-expanded={openFaq === index}
                >
                  {question}
                  <span>{openFaq === index ? "−" : "+"}</span>
                </button>
                <p>{answer}</p>
              </div>
            ))}
          </div>
          </div>
        </div>
      </section>

      <CustomDesignCard className="shell" />

      <section className="cta shell" id="cta">
        <Art name="flowers-a" className="cta-art cta-art-l" />
        <Art name="flowers-b" className="cta-art cta-art-r" />
        <div>
          <h2>Ready to create your wedding website?</h2>
          <p>
            Pick a template, make it yours, and share it with your loved ones in
            minutes.
          </p>
        </div>
        <a className="button light" href="/templates">
          Start your invitation <Icon name="arrow" size={18} />
        </a>
      </section>

      <footer className="footer shell" id="footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <Logo />
            <p className="footer-tag">Wedding invitation websites, made beautiful and easy to share.</p>
            <p className="footer-talk">
              <strong>Want something unique?</strong>
              <TalkToUs topic="custom" lead="Talk to us:" />
            </p>
            {instagramUrl ? (
              <div className="socials">
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="InviteStudio on Instagram">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" stroke="none" />
                  </svg>
                </a>
              </div>
            ) : null}
          </div>
          <nav className="footer-col" aria-labelledby="footer-product">
            <h3 id="footer-product">Product</h3>
            <ul>
              <li><a href="/templates">Templates</a></li>
              <li><a href="#how">How it works</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#faq-list">FAQs</a></li>
            </ul>
          </nav>
          <nav className="footer-col footer-guides" aria-labelledby="footer-guides">
            <h3 id="footer-guides">Guides</h3>
            <ul>
              <li><a href="/wedding-invitation-website">Wedding invitation website</a></li>
              <li><a href="/digital-wedding-invitation">Digital wedding invitation</a></li>
              <li><a href="/online-wedding-invitation-with-rsvp">Invitation with RSVP</a></li>
              <li><a href="/animated-wedding-invitation">Animated invitations</a></li>
              <li><a href="/whatsapp-wedding-invitation">Share on WhatsApp</a></li>
            </ul>
          </nav>
          <nav className="footer-col footer-policies" aria-labelledby="footer-company">
            <h3 id="footer-company">Company</h3>
            <ul>
              <li><a href="/contact">Contact</a></li>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/refund-policy">Refund policy</a></li>
              <li><a href="/delivery-policy">Delivery policy</a></li>
              <li><a href="/privacy">Privacy</a></li>
            </ul>
          </nav>
        </div>
        <div className="footer-bottom">
          <Art name="eucalyptus" className="deco footer-deco" />
          <p className="footer-copy">© {new Date().getFullYear()} InviteStudio. The templates and designs on this site are protected by copyright.</p>
        </div>
      </footer>
    </main>
  )
}


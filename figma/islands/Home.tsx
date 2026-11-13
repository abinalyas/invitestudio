// Home screen from the Figma Make export (App.tsx lines 1054-1476).
import { useState } from "react";
import { Icon, IconName, Logo, faqs, templates, galleryTemplates } from "./shared";
import { formatMoney, usePricing } from "./pricing";
import { bridge } from "./bridge";
import { RecoveryBanner, TalkToUs } from "./extras";
import { TemplateStrip } from "./TemplateStrip";
export function HomePage() {
  const { data: pricing } = usePricing()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main className="home-page">
      <RecoveryBanner />
      <section className="hero">
        <div className="hero-deco" aria-hidden="true">
          <img className="deco deco-floral-left" src="/assets/hero/floral-cluster-left.webp" alt="" width={394} height={425} />
          <img className="deco deco-floral-right" src="/assets/hero/floral-cluster-right.webp" alt="" width={374} height={323} />
          <img className="deco deco-petals" src="/assets/hero/scattered-petals.webp" alt="" width={189} height={174} />
          <img className="deco deco-fabric" src="/assets/hero/ivory-fabric-drape.webp" alt="" width={474} height={412} />
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
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="header-actions">
            <a className="button small" href="/templates">
              Start creating
            </a>
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
            <p className="lead">
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
                <Icon name="sparkle" size={18} /> Set up in minutes
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

      <section className="benefit-strip" id="features">
        <div className="shell benefit-grid">
          {[
            [
              "sparkle",
              "Beautiful templates",
              "Thoughtfully designed for every wedding style",
            ],
            [
              "edit",
              "Make it yours",
              "Easily customise text, colours, photos and more",
            ],
            [
              "people",
              "Guest information",
              "Event times, venues, directions and travel details for your guests",
            ],
            [
              "device",
              "Share instantly",
              "Send your invitation with a simple link",
            ],
          ].map(([icon, title, text]) => (
            <article key={title}>
              <span className="benefit-icon">
                <Icon name={icon as IconName} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell templates" id="templates">
        <div className="section-heading row">
          <div>
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

      <section className="section shell how" id="how">
        <div className="section-heading centered">
          <span className="section-kicker">Simple by design</span>
          <h2>How it works</h2>
          <p>Create your wedding website in three simple steps.</p>
        </div>
        <div className="steps">
          {[
            ["calendar", "1", "Choose a template", "Pick a design you love"],
            [
              "edit",
              "2",
              "Customise",
              "Add your details, events, photos and more",
            ],
            [
              "send",
              "3",
              "Share",
              "Get a link and invite your guests instantly",
            ],
          ].map(([icon, number, title, text], index) => (
            <article key={title}>
              <span className="step-icon">
                <Icon name={icon as IconName} size={32} />
              </span>
              <strong className="number">{number}</strong>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
              {index < 2 && <span className="step-arrow">→</span>}
            </article>
          ))}
        </div>
      </section>

      <section className="feature-panel shell">
        <div className="panel-intro">
          <span className="botanical">❧</span>
          <div>
            <h2>
              Everything you need
              <br />
              for your big day
            </h2>
            <p>
              A simple yet powerful way to share your wedding with the people
              you love.
            </p>
          </div>
        </div>
        <div className="feature-list">
          {[
            [
              "calendar",
              "Event details",
              "Share all your wedding events in one place",
            ],
            [
              "people",
              "Travel & event details",
              "Directions, parking and stays for each event",
            ],
            [
              "heart",
              "Your story",
              "Tell your story through your favourite moments",
            ],
            [
              "link",
              "Your own link",
              "A clean, shareable link for your wedding",
            ],
            [
              "device",
              "Mobile friendly",
              "A beautiful experience on any device",
            ],
            [
              "sparkle",
              "Beautiful animations",
              "Subtle, elegant animations that feel special",
            ],
          ].map(([icon, title, text]) => (
            <article key={title}>
              <Icon name={icon as IconName} />
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell pricing" id="pricing">
        <div className="section-heading row">
          <div>
            <span className="section-kicker">One price for each design</span>
            <h2>Simple, transparent pricing</h2>
            <p>
              Build and preview your invitation for free. You pay once, when you publish, and the price depends on the design you choose.
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
                <a className={tier.id === "premium" ? "button" : "button outline"} href="/templates">
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


      <section className="section shell faq">
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
      </section>

      <section className="cta shell" id="cta">
        <div className="cta-leaves left" />
        <div className="cta-leaves right" />
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
        <Logo />
        <nav>
          <a href="/templates">Templates</a>
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq-list">FAQs</a>
        </nav>
        <p className="footer-talk">
          <TalkToUs topic="custom" lead="Want something unique? Talk to us:" />
        </p>
        <div className="socials">
          <a href="#instagram" aria-label="Instagram">
            ◎
          </a>
          <a href="#youtube" aria-label="YouTube">
            ▶
          </a>
          <a href="#pinterest" aria-label="Pinterest">
            p
          </a>
        </div>
      </footer>
    </main>
  )
}


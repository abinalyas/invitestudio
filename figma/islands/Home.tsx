// Home screen from the Figma Make export (App.tsx lines 1054-1476).
import { useState } from "react";
import { Icon, IconName, Logo, faqs, plans, templates, galleryTemplates } from "./shared";
import { bridge } from "./bridge";
import { OccasionStrip, RecoveryBanner } from "./extras";
export function HomePage() {
  const [yearly, setYearly] = useState(true)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <main>
      <RecoveryBanner />
      <section className="hero">
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
          <nav className={menuOpen ? "nav open" : "nav"}>
            <a href="/templates">Templates</a>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="header-actions">
            <a className="button small" href="#pricing">
              Get started
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
              <br className="desktop-only" /> animations, RSVPs, events,
              galleries and more.
            </p>
            <div className="hero-buttons">
              <button className="button" type="button" onClick={() => bridge.startCreate("Wedding")}>
                Start your invitation <Icon name="arrow" size={18} />
              </button>
              <a className="button outline" href="#how">
                <span className="play">
                  <Icon name="play" size={16} />
                </span>{" "}
                See it in action
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

          <div
            className="hero-art"
            aria-label="Floral wedding invitation in a green envelope"
          >
            <span className="hero-petal petal-one" />
            <span className="hero-petal petal-two" />
            <span className="hero-petal petal-three" />
            <div className="hero-botanical botanical-one">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="invitation-card">
              <div className="card-flower top-left" />
              <div className="card-flower top-right" />
              <span className="tiny-mark">
                A <i>&amp;</i> R
              </span>
              <p>Aisha &amp; Rohan</p>
              <span className="card-date">18 · 02 · 2025</span>
              <small>ARE GETTING MARRIED</small>
            </div>
            <div className="envelope">
              <div className="seal">
                <span />
              </div>
            </div>
          </div>
        </div>
      </section>

      <OccasionStrip />
      <section className="benefit-strip" id="features">
        <div className="shell benefit-grid">
          {[
            [
              "sparkle",
              "Premium templates",
              "Thoughtfully designed for every wedding style",
            ],
            [
              "edit",
              "Make it yours",
              "Easily customise text, colours, photos and more",
            ],
            [
              "people",
              "Manage your guests",
              "Collect RSVPs, meal choices and event attendance",
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
            <p>
              From elegant and traditional to modern and playful, find a design
              that feels like you.
            </p>
          </div>
          <a href="/templates">
            View all templates <Icon name="arrow" size={18} />
          </a>
        </div>
        <div className="template-grid">
          {templates.map((template) => (
            <button
              className="template-card"
              key={template.names}
              aria-label={`Preview ${template.names} template`}
            >
              <img src={template.image} alt="" />
              <span className="shade" />
              <strong>{template.names.replace(" & ", "\n&\n")}</strong>
              <span className="card-play">
                <Icon name="play" size={15} />
              </span>
              <small>ARE GETTING MARRIED</small>
            </button>
          ))}
        </div>
        <div className="dots">
          <i className="active" />
          <i />
          <i />
          <i />
        </div>
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
              "RSVP & guest management",
              "Collect responses and keep track easily",
            ],
            [
              "gallery",
              "Photo gallery",
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
            <span className="section-kicker">Plans for every celebration</span>
            <h2>Simple, transparent pricing</h2>
            <p>Choose a plan that fits your celebration.</p>
          </div>
          <div className="toggle" role="group" aria-label="Billing period">
            <button
              className={!yearly ? "active" : ""}
              onClick={() => setYearly(false)}
            >
              Monthly
            </button>
            <button
              className={yearly ? "active" : ""}
              onClick={() => setYearly(true)}
            >
              Yearly <span>Save 20%</span>
            </button>
          </div>
        </div>
        <div className="plans">
          {plans.map((plan) => (
            <article
              className={plan.featured ? "plan featured" : "plan"}
              key={plan.name}
            >
              {plan.featured && <span className="popular">Most popular</span>}
              <h3>{plan.name}</h3>
              <p>{plan.subtitle}</p>
              <div className="price">
                ₹{(yearly ? plan.yearly : plan.monthly).toLocaleString("en-IN")}
                <small> /{yearly ? "year" : "month"}</small>
              </div>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={16} />
                    {feature}
                  </li>
                ))}
              </ul>
              <a
                className={plan.featured ? "button" : "button outline"}
                href="#cta"
              >
                Get started
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="testimonial shell">
        <img
          src="https://images.unsplash.com/photo-1633104502699-b2ecf0fee294?auto=format&fit=crop&w=900&q=85"
          alt="A newlywed couple in traditional wedding attire"
        />
        <div className="quote">
          <span>“</span>
          <blockquote>
            “InviteStudio made it so easy to create our wedding website.
            <br />
            Our guests loved the design and the RSVP experience!”
          </blockquote>
          <cite>— Neha &amp; Aditya</cite>
        </div>
        <div className="slider-controls">
          <i className="active" />
          <i />
          <i />
          <button aria-label="Previous testimonial">‹</button>
          <button aria-label="Next testimonial">›</button>
        </div>
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
          Get started for free <Icon name="arrow" size={18} />
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


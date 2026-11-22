// Home screen. Rebuilt for launch (marketing/LAUNCH_PLAYBOOK.md): six short sections that lead with what the product looks like.
//   1 hero: the line and a playing invitation    2 every design, playing its own opening    3 why one link beats a video
//   4 three steps                                 5 "we'll build it for you"                  6 price, five questions, last call
import { useEffect, useRef, useState } from "react";
import { Art, Icon, Logo, faqs, galleryTemplates, testimonials } from "./shared";
import { formatMoney, tierOf, usePricing } from "./pricing";
import { MyProjectsLink, RecoveryBanner, StartCreatingLink, TalkToUs } from "./extras";
import { bridge } from "./bridge";

// The most striking openings first: the first two or three cards are all most visitors see without swiping.
const OPENING_ORDER = ["lantern-night", "velvet-reveal", "cherry-blossom", "under-the-same-moon", "golden-butterfly", "fairy-tale", "bloom-reveal", "cinematic", "minimalist"];
const openingDesigns = OPENING_ORDER.map((id) => galleryTemplates.find((design) => design.backendId === id)).filter(Boolean) as typeof galleryTemplates;
const bloomReveal = galleryTemplates.find((design) => design.backendId === "bloom-reveal")!;

// The five questions people ask before they start (the full list stays in shared.tsx and the search-engine copy).
const HOME_FAQS = ["What is free, and when do I pay?", "Can I collect RSVPs from my guests?", "Do my guests need an app or an account?", "Can I change my design later?", "What happens after the wedding?"]
  .map((question) => faqs.find(([q]) => q === question)!)
  .filter(Boolean);

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A muted recording that plays only while it is on screen, and never for people who ask for less motion. Nothing is downloaded
// until it first comes into view (preload="none"). `loop` recordings get a pause button (WCAG 2.2.2); the short design openings play
// once each time they come into view and rest on their last frame.
function PlayingInView({ src, poster, label, loop = false, width, height }: { src: string; poster: string; label: string; loop?: boolean; width: number; height: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  useEffect(() => {
    const video = ref.current;
    if (!video || reducedMotion() || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !pausedRef.current) {
        if (!loop && video.ended) video.currentTime = 0;
        video.play().catch(() => {});
      } else if (!entry.isIntersecting) video.pause();
    }, { threshold: 0.6 });
    observer.observe(video);
    return () => observer.disconnect();
  }, [loop]);
  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    if (pausedRef.current) video.pause(); else video.play().catch(() => {});
  };
  return (
    <>
      <video ref={ref} muted playsInline loop={loop} preload="none" poster={poster} width={width} height={height} aria-label={label} disablePictureInPicture>
        <source src={src} type="video/mp4" />
      </video>
      {loop && !reducedMotion() ? (
        <button type="button" className="play-toggle" onClick={toggle} aria-label={paused ? "Play the sample invitation" : "Pause the sample invitation"}>
          {paused ? "Play" : "Pause"}
        </button>
      ) : null}
    </>
  );
}

// Phones: once the hero's "Choose your design" has scrolled away, the same button waits at the bottom of the screen, so there is
// always a way to start, down to the footer. It steps aside while the closing "Start with the design you love" button is on screen,
// so two of the same button are never on screen together.
function useStickyStart() {
  const heroRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLAnchorElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const hero = heroRef.current, end = endRef.current;
    if (!hero || !end) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const h = hero.getBoundingClientRect(), e = end.getBoundingClientRect();
      const endOnScreen = e.bottom > 0 && e.top < window.innerHeight;
      setShown(h.bottom < 0 && !endOnScreen);
    };
    const queue = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
  return { heroRef, endRef, shown };
}

export function HomePage() {
  // The Instagram address is set once in site-config.js (social.instagram); with none set, no social icon is shown.
  const instagramUrl = ((window as unknown as { INVITESTUDIO_SITE?: { social?: { instagram?: string } } }).INVITESTUDIO_SITE?.social?.instagram || "").trim()
  const { data: pricing } = usePricing()
  const classic = pricing?.tiers.find((tier) => tier.id === "classic")
  const startPrice = pricing && classic ? formatMoney(classic.amountMinor, pricing.currency, pricing.locale) : ""
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const build = bridge.contactLinks("build")
  const sticky = useStickyStart()

  return (
    <main className="home-page">
      <RecoveryBanner />
      <section className="hero">
        <div className="hero-deco" aria-hidden="true">
          <img className="deco deco-floral-left" src="/assets/hero/floral-cluster-left.webp" alt="" width={394} height={425} fetchPriority="low" decoding="async" />
          <img className="deco deco-floral-right" src="/assets/hero/floral-cluster-right.webp" alt="" width={374} height={323} fetchPriority="low" decoding="async" />
          <img className="deco deco-petals" src="/assets/hero/scattered-petals.webp" alt="" width={189} height={174} fetchPriority="low" decoding="async" />
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
            <p className="eyebrow">Animated wedding invitations</p>
            <h1>
              <span>Your wedding</span>
              <span>invitation,</span>
              <span>
                in <em>one link</em>
              </span>
            </h1>
            <p className="lead hero-sub">
              It opens like a film. Then guests see every event, find the venue and tell you they{"’"}re coming.
            </p>
            <div className="hero-buttons" ref={sticky.heroRef}>
              <a className="button" href="/templates">
                Choose your design <Icon name="arrow" size={18} />
              </a>
              <p className="hero-promise">
                <strong>Free to build and preview.</strong>
                <span>{pricing?.mode === "early-access"
                  ? "Publishing is free during early access."
                  : startPrice ? `Pay once to publish, from ${startPrice}.` : "Pay once, only when you publish."}</span>
              </p>
            </div>
          </div>

          <figure className="hero-demo">
            <div className="hero-phone">
              <PlayingInView
                loop
                src="/assets/home/bloom-reveal-demo.mp4?v=2"
                poster="/assets/home/bloom-reveal-demo-poster.webp?v=2"
                width={320}
                height={544}
                label="Bloom Reveal sample invitation: the floral opening, wedding schedule, photo gallery and guest RSVP"
              />
            </div>
            <figcaption>
              <a href={`/templates/${bloomReveal.id}?view=sample`}>See a sample invitation <Icon name="arrow" size={16} /></a>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="section shell openings" id="designs" aria-labelledby="designs-title">
        <div className="section-heading row">
          <div>
            <span className="section-kicker">{openingDesigns.length} designs</span>
            <h2 id="designs-title">Pick how your invitation opens</h2>
          </div>
          <a href="/templates">See all designs <Icon name="arrow" size={18} /></a>
        </div>
        <ul className="opening-row">
          {openingDesigns.map((design) => {
            const tier = tierOf(pricing, design.backendId);
            return (
              <li key={design.id}>
                <a className="opening-card" href={`/templates/${design.id}`} aria-label={`${design.title}: see this design`}>
                  <span className="opening-phone">
                    <PlayingInView
                      src={`/assets/home/openings/${design.backendId}.mp4`}
                      poster={`/assets/home/openings/${design.backendId}.webp`}
                      width={288}
                      height={512}
                      label={`${design.title} opening`}
                    />
                  </span>
                  <span className="opening-name">{design.title}</span>
                  {pricing && tier ? (
                    <span className="opening-tier">{tier.name}{pricing.mode === "live" ? ` · ${formatMoney(tier.amountMinor, pricing.currency, pricing.locale)}` : ""}</span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="section shell why" id="features" aria-labelledby="why-title">
        <Art name="eucalyptus" className="deco deco-edge-l deco-why" />
        <div className="section-heading centered">
          <span className="section-kicker">Better than a video invitation</span>
          <h2 id="why-title">It opens like a video. Then it stays useful.</h2>
        </div>
        <div className="why-grid">
          <ul className="why-points">
            <li><strong>Every event on one page</strong><span>Times, venues and directions, from the first function to the reception.</span></li>
            <li><strong>Replies in one list</strong><span>Guests reply on the page. You see who{"’"}s coming and download the list.</span></li>
            <li><strong>Change it anytime</strong><span>A time moves? Update it once and every guest sees the latest.</span></li>
          </ul>
          <div className="why-proof">
            <figure>
              <img src="/assets/home/bloom-reveal-whatsapp-card.webp" alt="A floral wedding card with the couple’s names, as it appears when the link is shared on WhatsApp" width={360} height={480} loading="lazy" decoding="async" />
              <figcaption>One light link with a preview card, on WhatsApp</figcaption>
            </figure>
            <figure>
              <img src="/assets/home/host-rsvp-example.webp" alt="A guest’s reply with attendance, event and meal details, and a spreadsheet download button" width={330} height={258} loading="lazy" decoding="async" />
              <figcaption>Every reply, ready to download</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="section shell how" id="how" aria-labelledby="how-title">
        <Art name="gypsophila" className="deco deco-edge-r deco-how-r" />
        <div className="section-heading centered">
          <span className="section-kicker">How it works</span>
          <h2 id="how-title">Three steps. You pay only at the end.</h2>
        </div>
        <ol className="how-steps">
          <li><span className="how-n" aria-hidden="true">1</span><div><strong>Choose a design</strong><span>Free</span></div></li>
          <li><span className="how-n" aria-hidden="true">2</span><div><strong>Add your names, events and photos</strong><span>Free, and preview as often as you like</span></div></li>
          <li><span className="how-n" aria-hidden="true">3</span><div><strong>Publish and share one link</strong><span className="paid">One-time payment</span></div></li>
        </ol>
      </section>

      {build.whatsapp || build.email ? (
        <section className="shell build-for-you" aria-labelledby="build-title" data-build-for-you>
          <div>
            <h2 id="build-title">Rather we build it for you?</h2>
            <p>Send us your names, date, venues and photos. We{"’"}ll build your invitation and send you a private preview. You pay only if you publish.</p>
          </div>
          <div className="build-actions">
            {build.whatsapp ? <a className="button light" href={build.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp us</a> : null}
            {build.email ? <a className="button outline light" href={build.email}>Email us</a> : null}
          </div>
        </section>
      ) : null}

      <section className="section shell pricing" id="pricing" aria-labelledby="pricing-title">
        <div className="section-heading centered">
          <span className="section-kicker">Pricing</span>
          <h2 id="pricing-title">One payment. No subscription.</h2>
          <p>Building and previewing are free. You pay once, when you publish, for the design you chose.</p>
        </div>
        {pricing ? (
          <div className="plans">
            {pricing.tiers.map((tier) => {
              const designs = galleryTemplates.filter((item) => (pricing.templates[item.backendId] || "classic") === tier.id)
              return (
                <a className="plan" key={tier.id} href={`/templates?tier=${tier.id}`}>
                  <strong>{tier.name}</strong>
                  <span className="price">{formatMoney(tier.amountMinor, pricing.currency, pricing.locale)}<small> one-time</small></span>
                  <span className="plan-designs">{designs.length} {designs.length === 1 ? "design" : "designs"}{designs.length ? `, like ${designs[0].title}` : ""}</span>
                </a>
              )
            })}
          </div>
        ) : (
          <p className="pricing-note">Prices are shown when you choose a design.</p>
        )}
        {pricing?.mode === "early-access" && (
          <p className="pricing-note">
            Publishing is free during early access. The prices above apply when payments open.
          </p>
        )}
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

      <section className="section shell faq" aria-labelledby="faq-title">
        <div className="section-heading centered">
          <span className="section-kicker">Questions</span>
          <h2 id="faq-title">Before you start</h2>
        </div>
        <div className="faq-grid" id="faq-list">
          {HOME_FAQS.map(([question, answer], index) => (
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
        <Art name="flowers-a" className="cta-art cta-art-l" />
        <Art name="flowers-b" className="cta-art cta-art-r" />
        <div>
          <h2>Start with the design you love</h2>
          <p>
            Free to build and preview. Pay once, only when you publish.
          </p>
        </div>
        <a className="button light" href="/templates" ref={sticky.endRef}>
          Choose your design <Icon name="arrow" size={18} />
        </a>
      </section>

      <div className="home-sticky" data-shown={sticky.shown ? "" : undefined}>
        <span>
          <strong>Free to build</strong>
          <small>{pricing?.mode === "early-access" ? "Free to publish for now" : "Pay only to publish"}</small>
        </span>
        <a className="button" href="/templates">
          Choose your design <Icon name="arrow" size={18} />
        </a>
      </div>

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

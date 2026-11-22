// Components the Figma design does not contain, but the existing application needs.
// They keep working features reachable from the new screens (requirement: nothing is
// removed just because the export does not show it).
import { useState, useSyncExternalStore } from "react";
import { bridge } from "./bridge";

export function useBridgeVersion(): number {
  return useSyncExternalStore(bridge.subscribe, bridge.version, bridge.version);
}

// Welcome-back prompt for returning visitors: one way in, to their list of invitations.
export function RecoveryBanner() {
  useBridgeVersion();
  const card = bridge.recovery();
  if (!card) return null;
  return (
    <section className="recovery-banner" aria-label="Continue your draft">
      <div>
        <span className="section-kicker">Welcome back</span>
        <strong>Pick up where you left off</strong>
        <p>{card.status}</p>
        {card.error ? <p role="alert" className="recovery-error">{card.error}</p> : null}
      </div>
      <div className="recovery-actions">
        <button className="button small" type="button" onClick={() => bridge.openProjects()}>
          My invitations
        </button>
      </div>
    </section>
  );
}

// "My invitations" in the header, only for people who already have a draft.
export function MyProjectsLink() {
  useBridgeVersion();
  if (!bridge.hasProjects()) return null;
  return (
    <button className="button outline small my-projects-link" type="button" onClick={() => bridge.openProjects()}>
      My invitations
    </button>
  );
}

// "Start creating" in the header, for people with no invitation yet. Someone who already has one sees "My invitations"
// instead, and the big button in the hero does the starting.
export function StartCreatingLink() {
  useBridgeVersion();
  if (bridge.hasProjects()) return null;
  return (
    <a className="button small" href="/templates">
      Start creating
    </a>
  );
}

// Occasion choices from the existing catalogue. Choosing one starts the existing
// setup flow for that celebration type.
export function OccasionStrip() {
  const categories = bridge.categories();
  return (
    <section className="occasion-strip shell" aria-label="Choose an occasion">
      <p className="section-kicker">Every celebration</p>
      <div className="occasion-chips">
        {categories.map(([name, emoji]) => (
          <button key={name} type="button" className="occasion-chip" onClick={() => bridge.startCreate(name)}>
            <span aria-hidden="true">{emoji}</span>
            {name}
          </button>
        ))}
      </div>
    </section>
  );
}

// "Talk to us": email and WhatsApp, each opening a message that already says what it is about (and which website, when
// an address is given). The details come from site-config.js, in one place.
export function TalkToUs({ topic, address, lead }: { topic: "extend" | "restore" | "custom" | "general" | "build"; address?: string; lead?: string }) {
  const links = bridge.contactLinks(topic, address);
  if (!links.whatsapp && !links.email) return null;
  return (
    <span className="talk-to-us">
      {lead ? `${lead} ` : ""}
      {links.whatsapp ? <a href={links.whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
      {links.whatsapp && links.email ? " · " : null}
      {links.email ? <a href={links.email}>Email</a> : null}
    </span>
  );
}

// A card that says plainly: a design made just for you is possible, and here is how to ask. It is on the gallery, a design's
// page and the home page, where people look for it; the buttons open WhatsApp or an email that already says what it is about.
export function CustomDesignCard({ className = "" }: { className?: string }) {
  const links = bridge.contactLinks("custom");
  if (!links.whatsapp && !links.email) return null;
  return (
    <section className={`custom-card ${className}`.trim()} aria-label="A design made just for you" data-custom-card>
      <h2>Want something made just for you?</h2>
      <p>Tell us your idea. We design a custom invitation and tell you the price before you decide.</p>
      <div className="custom-card-actions">
        {links.whatsapp ? <a className="button" href={links.whatsapp} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a> : null}
        {links.email ? <a className="button outline" href={links.email}>Email us</a> : null}
      </div>
    </section>
  );
}

// "Start from an example". While the field is empty, the first example is shown in full in a card with a "Use this" button, and the
// chips switch which example the card shows. Once the field has text, the chips offer other wording that replaces it (the couple can
// always edit it afterwards). Nothing is saved until the couple taps "Use this" or a chip on a filled field.
export function SampleChips({ samples, onPick, value, label }: { samples: { label: string; text: string }[]; onPick: (text: string) => void; value?: string; label?: string }) {
  const [active, setActive] = useState(0);
  const empty = value !== undefined && !value.trim();
  const shown = samples[Math.min(active, samples.length - 1)];
  const heading = label ?? (empty ? "Start from an example" : "Try other wording");
  return (
    <div className={empty ? "sample-chips has-card" : "sample-chips"} role="group" aria-label={heading}>
      <span className="sample-chips-label">
        <span aria-hidden="true">✨ </span>
        {heading}
      </span>
      {empty && shown ? (
        <div className="sample-card">
          <p>{shown.text}</p>
          <button type="button" className="button small sample-use" onClick={() => onPick(shown.text)}>
            Use this
          </button>
        </div>
      ) : null}
      <span className="sample-chips-row">
        {samples.map((sample, index) => (
          <button
            key={sample.label}
            type="button"
            className={empty && index === active ? "sample-chip active" : "sample-chip"}
            aria-pressed={empty ? index === active : undefined}
            onClick={() => (empty ? setActive(index) : onPick(sample.text))}
          >
            {sample.label}
          </button>
        ))}
      </span>
    </div>
  )
}

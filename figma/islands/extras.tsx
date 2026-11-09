// Components the Figma design does not contain, but the existing application needs.
// They keep working features reachable from the new screens (requirement: nothing is
// removed just because the export does not show it).
import { useSyncExternalStore } from "react";
import { bridge } from "./bridge";

export function useBridgeVersion(): number {
  return useSyncExternalStore(bridge.subscribe, bridge.version, bridge.version);
}

// Continue-editing prompt for returning visitors (the existing recovery card).
export function RecoveryBanner() {
  useBridgeVersion();
  const card = bridge.recovery();
  if (!card) return null;
  return (
    <section className="recovery-banner" aria-label="Continue your draft">
      <div>
        <span className="section-kicker">Welcome back</span>
        <strong>Continue {card.title}</strong>
        <p>{card.status}</p>
        {card.access ? <p className="recovery-access">{card.access}</p> : null}
        {card.error ? <p role="alert" className="recovery-error">{card.error}</p> : null}
      </div>
      <div className="recovery-actions">
        <button className="button small" type="button" onClick={() => bridge.continueDraft()}>
          Continue editing
        </button>
        <button className="button outline small" type="button" onClick={() => bridge.startCreate("Wedding")}>
          New website
        </button>
      </div>
    </section>
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
export function TalkToUs({ topic, address, lead }: { topic: "extend" | "restore" | "custom" | "general"; address?: string; lead?: string }) {
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

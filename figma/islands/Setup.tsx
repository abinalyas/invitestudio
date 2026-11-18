// Setup wizard in the redesigned style: three steps and the Continue button, with no live preview (the person
// should keep their attention on the form; the editor is where they see the invitation take shape).
//
// The fields live in this screen. Each time a step is finished they are handed to the app
// (bridge.commitSetup), which creates the draft the first time and keeps it up to date.
import { useRef, useState } from "react";
import { Icon, PlaceList, Logo, galleryTemplates, openPickerOnClick, phoneSmall, sampleWelcomes } from "./shared";
import { bridge, SetupFields } from "./bridge";
import { EventsPanel } from "./Editor";
import { useBridgeVersion } from "./extras";

// "28 Jan 2027" (the saved value is 2027-01-28).
const shortDate = (iso: string) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const steps = ["Essentials", "Events", "Ready"] as const;
const namesMissing = "Add the couple or celebration names to continue.";

export function SetupPage() {
  useBridgeVersion();
  const snap = bridge.snapshot();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [fields, setFields] = useState<SetupFields>(() => {
    const defaults = bridge.setupDefaults();
    const known = galleryTemplates.some((template) => template.backendId === snap.templateId);
    return snap.available
      ? {
          title: snap.title,
          date: snap.date,
          location: snap.location,
          message: snap.message || sampleWelcomes()[0].text,
          story: snap.storyCopy,
          hosts: snap.hosts,
          templateId: known ? snap.templateId : defaults.templateId,
        }
      : { title: "", date: "", location: "", message: sampleWelcomes()[0].text, story: "", hosts: "", templateId: defaults.templateId };
  });
  const titleRef = useRef<HTMLInputElement>(null);
  const template = galleryTemplates.find((item) => item.backendId === fields.templateId) ?? galleryTemplates[0];
  const status = bridge.setupStatus();

  const set = (patch: Partial<SetupFields>) => {
    setFields((current) => ({ ...current, ...patch }));
    if (patch.title !== undefined) setError("");
  };

  function go(to: number) {
    if (to > 0 && !fields.title.trim()) {
      setStep(0);
      setError(namesMissing);
      window.setTimeout(() => titleRef.current?.focus(), 0);
      return;
    }
    setError("");
    if (fields.title.trim() || snap.available) bridge.commitSetup(fields);
    setStep(to);
    window.scrollTo({ top: 0 });
  }

  // Back, Skip and Continue: pinned to the bottom of the screen on a phone, so they are always in reach.
  const actionButtons = () => (
    <>
      {step > 0 ? (
        <button className="button outline back" type="button" onClick={() => go(step - 1)}>
          <Icon name="arrow" size={17} /> Back
        </button>
      ) : null}
      {step === 1 ? (
        <button className="button outline" type="button" onClick={() => go(2)}>
          Skip for now
        </button>
      ) : null}
      {step < 2 ? (
        <button className="button" type="button" onClick={() => go(step + 1)}>
          Continue <Icon name="arrow" size={17} />
        </button>
      ) : (
        <button className="button" type="button" disabled={!status.canFinish} aria-disabled={!status.canFinish} onClick={() => bridge.finishSetup()}>
          Open editor <Icon name="arrow" size={17} />
        </button>
      )}
    </>
  );
  const actions = <div className="setup-actions">{actionButtons()}</div>;

  return (
    <main className="setup-page">
      <header className="site-header gallery-shell gallery-header">
        <Logo />
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          <span />
          <span />
          <span />
        </button>
        <nav className={menuOpen ? "nav open" : "nav"}>
          <a href="/templates">Templates</a>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
        </nav>
        <div className="header-actions">
          <a className="button outline small" href="/">
            Back to home
          </a>
        </div>
      </header>

      <div className="gallery-shell setup-shell">
        <div className="setup-head">
          <span className="section-kicker">Let’s make it yours</span>
          <h1>Create your invitation</h1>
          <p>Start with your names and date. Everything else can wait until you’re ready.</p>
          <p className="setup-note">
            <Icon name="sparkle" size={16} /> Drafts are saved automatically as you work. Guests can reply online once your invitation is live.
          </p>
        </div>

        <ol className="setup-steps" aria-label="Setup steps">
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                className={step === index ? "active" : index < step ? "done" : ""}
                aria-current={step === index ? "step" : undefined}
                onClick={() => go(index)}
              >
                <span className="step-number">{index < step ? <Icon name="check" size={15} /> : index + 1}</span>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="setup-selected">
          <img src={phoneSmall(template.phone)} alt="" width={36} height={72} />
          <span className="setup-selected-text">
            <small>Your design</small>
            <strong>{template.title}</strong>
          </span>
        </div>

        <div className="setup-grid">
          <section className="setup-card" aria-labelledby="setup-title">
            {error ? (
              <p id="setupNameError" className="setup-error" role="alert">
                {error}
              </p>
            ) : null}

            {step === 0 ? (
              <>
                <h2 id="setup-title">Let’s make it yours.</h2>
                <p className="setup-intro">Add the names and date. Only the names are needed to continue.</p>
                <div className="setup-form">
                  <label>
                    Couple or celebration names <span className="required" aria-hidden="true">*</span>
                    <input
                      id="projectTitle"
                      ref={titleRef}
                      required
                      aria-required="true"
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "setupNameError" : undefined}
                      value={fields.title}
                      placeholder="e.g. Meera & Arjun"
                      onChange={(event) => set({ title: event.target.value })}
                    />
                  </label>
                  <label>
                    Event date <span className="optional">(optional)</span>
                    <span className="input-with-icon">
                      <Icon name="calendar" size={18} />
                      <input id="projectDate" type="date" value={fields.date} onClick={openPickerOnClick} onChange={(event) => set({ date: event.target.value })} />
                    </span>
                  </label>
                  <label>
                    Main location <span className="optional">(optional)</span>
                    <span className="input-with-icon">
                      <Icon name="pin" size={18} />
                      <input id="projectLocation" list="invitestudio-places" autoComplete="off" value={fields.location} placeholder="City or venue" onChange={(event) => set({ location: event.target.value })} />
                      <PlaceList />
                    </span>
                  </label>
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h2 id="setup-title">Your events.</h2>
                <p className="setup-intro">Add the days of your celebration, or skip this and add them later. Your welcome message and story can be added in the editor.</p>
                {snap.events.some((item) => item.id === snap.ceremonyEventId) ? (
                  <p className="setup-note ceremony-note" id="ceremonyNote">
                    We added your ceremony from the date you entered. Tap it to add the time and venue, or remove it any time.
                  </p>
                ) : null}
                {snap.available ? <EventsPanel snap={snap} /> : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2 id="setup-title">Ready when you are.</h2>
                <p className="setup-intro">Here is your first draft. You can change any of this in the editor.</p>
                <dl className="setup-summary">
                  <div>
                    <dt>Names</dt>
                    <dd>{fields.title.trim() || "Not added yet"}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{fields.date ? shortDate(fields.date) : "Not added yet"}</dd>
                  </div>
                  <div>
                    <dt>Design</dt>
                    <dd>{template.title}</dd>
                  </div>
                  <div>
                    <dt>Events</dt>
                    <dd>{snap.events.length ? `${snap.events.length} added` : "None yet"}</dd>
                  </div>
                </dl>
                {status.offer ? (
                  <div className="setup-offer" role="alert">
                    <p>We could not confirm this draft is saved to your account yet. It is kept safely on this device.</p>
                    <div className="setup-offer-actions">
                      <button className="button outline small" type="button" onClick={() => bridge.retrySave()}>
                        Try saving again
                      </button>
                      <button className="button outline small" type="button" onClick={() => bridge.keepLocal()}>
                        Continue on this device only
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {snap.available ? (
              <p id="setupSaveLine" className="setup-save" role="status" aria-live="polite">
                {status.saveLine}
              </p>
            ) : null}
          </section>

          {actions}
        </div>
      </div>
    </main>
  );
}

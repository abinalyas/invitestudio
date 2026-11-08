// Setup wizard in the redesigned style: four steps, a live phone preview, and the Continue button
// at the bottom (so on a phone the preview comes first and the person scrolls down to continue).
//
// The fields live in this screen. Each time a step is finished they are handed to the app
// (bridge.commitSetup), which creates the draft the first time and keeps it up to date.
// The preview is the real invitation renderer, so it is what guests will see.
import { useEffect, useRef, useState } from "react";
import { Icon, Logo, galleryTemplates } from "./shared";
import { bridge, SetupFields } from "./bridge";
import { EventsPanel } from "./Editor";
import { useBridgeVersion } from "./extras";

const steps = ["Essentials", "Template", "Story and details", "Ready"] as const;
const namesMissing = "Add the couple or celebration names to continue.";

export function SetupPage() {
  useBridgeVersion();
  const snap = bridge.snapshot();
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [cue, setCue] = useState(false);
  const [fields, setFields] = useState<SetupFields>(() => {
    const defaults = bridge.setupDefaults();
    const known = galleryTemplates.some((template) => template.backendId === snap.templateId);
    return snap.available
      ? {
          title: snap.title,
          date: snap.date,
          location: snap.location,
          message: snap.message,
          story: snap.storyCopy,
          hosts: snap.hosts,
          templateId: known ? snap.templateId : defaults.templateId,
        }
      : { title: "", date: "", location: "", message: "", story: "", hosts: "", templateId: defaults.templateId };
  });
  const screenRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const template = galleryTemplates.find((item) => item.backendId === fields.templateId) ?? galleryTemplates[0];
  const status = bridge.setupStatus();
  const showPreview = step < 3;

  const set = (patch: Partial<SetupFields>) => {
    setFields((current) => ({ ...current, ...patch }));
    if (patch.title !== undefined) setError("");
  };

  const updateCue = () => {
    const element = screenRef.current;
    setCue(Boolean(element) && element!.scrollHeight > element!.clientHeight + 24 && element!.scrollTop < 24);
  };

  // Draw the preview again whenever a value, the template or the events change.
  useEffect(() => {
    if (!showPreview || !screenRef.current) return;
    bridge.renderDraft(screenRef.current, fields, template.names);
    updateCue();
    const timer = window.setTimeout(updateCue, 400);
    return () => window.clearTimeout(timer);
  }, [fields, snap, showPreview]);

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

  const actions = (
    <div className="setup-actions">
      {step > 0 ? (
        <button className="button outline back" type="button" onClick={() => go(step - 1)}>
          <Icon name="arrow" size={17} /> Back
        </button>
      ) : null}
      {step === 2 ? (
        <button className="button outline" type="button" onClick={() => go(3)}>
          Skip for now
        </button>
      ) : null}
      {step < 3 ? (
        <button className="button" type="button" onClick={() => go(step + 1)}>
          Continue <Icon name="arrow" size={17} />
        </button>
      ) : (
        <button className="button" type="button" disabled={!status.canFinish} aria-disabled={!status.canFinish} onClick={() => bridge.finishSetup()}>
          Open editor <Icon name="arrow" size={17} />
        </button>
      )}
    </div>
  );

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
          <a href="/#features">Features</a>
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

        <div className={showPreview ? "setup-grid has-preview" : "setup-grid"}>
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
                      <input id="projectDate" type="date" value={fields.date} onChange={(event) => set({ date: event.target.value })} />
                    </span>
                  </label>
                  <label>
                    Main location <span className="optional">(optional)</span>
                    <span className="input-with-icon">
                      <Icon name="pin" size={18} />
                      <input id="projectLocation" value={fields.location} placeholder="City or venue" onChange={(event) => set({ location: event.target.value })} />
                    </span>
                  </label>
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <h2 id="setup-title">Choose a design.</h2>
                <p className="setup-intro">Pick a starting point. Your names, date and story stay as you entered them when you change designs.</p>
                <div className="setup-templates" role="group" aria-label="Wedding designs">
                  {galleryTemplates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.backendId === fields.templateId ? "setup-template selected" : "setup-template"}
                      aria-pressed={item.backendId === fields.templateId}
                      onClick={() => set({ templateId: item.backendId })}
                    >
                      <span className="setup-template-image">
                        <img src={item.phone} alt="" loading="lazy" />
                        {item.backendId === fields.templateId ? (
                          <span className="setup-template-check" aria-hidden="true">
                            <Icon name="check" size={16} />
                          </span>
                        ) : null}
                      </span>
                      <strong>{item.title}</strong>
                      <small>{item.tags.join(" · ")}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <h2 id="setup-title">Story and details.</h2>
                <p className="setup-intro">Everything here is optional. Skip it now and add it in the editor whenever you like.</p>
                <div className="setup-form">
                  <label>
                    Welcome message <span className="optional">(optional)</span>
                    <textarea id="projectMessage" rows={3} value={fields.message} placeholder="A few words for your guests…" onChange={(event) => set({ message: event.target.value })} />
                  </label>
                  <label>
                    Your story <span className="optional">(optional)</span>
                    <textarea id="projectStory" rows={5} value={fields.story} placeholder="Share a little about the people or occasion…" onChange={(event) => set({ story: event.target.value })} />
                  </label>
                  <label>
                    Hosts <span className="optional">(optional)</span>
                    <input id="projectHosts" value={fields.hosts} placeholder="Names to display" onChange={(event) => set({ hosts: event.target.value })} />
                  </label>
                </div>
                <h3 className="setup-subhead">
                  Events <span className="optional">(optional)</span>
                </h3>
                {snap.available ? <EventsPanel snap={snap} /> : null}
              </>
            ) : null}

            {step === 3 ? (
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
                    <dd>{fields.date || "Not added yet"}</dd>
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

          {showPreview ? (
            <aside className="setup-preview" aria-label="Live preview">
              <div className="setup-preview-top">
                <span className="section-kicker">Live preview</span>
                <span>{template.title}</span>
              </div>
              <div className="setup-device">
                <div className="setup-screen figma-canvas" ref={screenRef} onScroll={updateCue} />
                <div className={cue ? "scroll-cue show" : "scroll-cue"} aria-hidden="true">
                  <span>Scroll</span>
                  <Icon name="chevron" size={18} />
                </div>
              </div>
              <p className="setup-preview-note">Scroll the phone to see the whole invitation. Your names and details appear as you type.</p>
            </aside>
          ) : null}

          {actions}
        </div>
      </div>
    </main>
  );
}

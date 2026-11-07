// The contract between the Figma islands and the existing InviteStudio application.
//
// The islands never touch localStorage, the API or edit tokens directly. Every
// action goes through window.InviteStudioBridge, which the vanilla application
// installs (figma-host.js). That keeps cloud-sync, publishing and the invitation
// renderer as the single implementations.

export type Device = "desktop" | "tablet" | "mobile";

// Save state is derived from the cloud status, never guessed. "saved" means the
// server has confirmed the latest change.
export type SaveState =
  | "offline"
  | "creating"
  | "saving"
  | "pending"
  | "retrying"
  | "saved"
  | "local"
  | "error"
  | "conflict";

export type EditorFields = {
  title: string;
  pretitle: string;
  date: string;
  location: string;
  message: string;
  hosts: string;
  storyTitle: string;
  storyCopy: string;
};

// Per-event details. Travel is part of each event (directions, parking, stays,
// access), so broader travel information can later be added without a new page.
export type EventItem = {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime: string;
  venue: string;
  description: string;
  dressCode: string;
  directionsUrl: string;
  parking: string;
  accommodation: string;
  accessibility: string;
  visible: boolean;
};

export type EventPatch = Partial<Omit<EventItem, "id">>;

export type Design = { id: string; name: string; style: string; image: string };

export type EditorSnapshot = EditorFields & {
  available: boolean;
  templateId: string;
  templateName: string;
  publishStatus: string;
  published: boolean;
  publicSlug: string;
  publicUrl: string | null;
  saveState: SaveState;
  saveLabel: string;
  saveFailed: boolean;
  // Visibility of the sections on the invitation: hero, welcome, story, functions, gallery, rsvp.
  sections: Record<string, boolean>;
  events: EventItem[];
  rsvp: string;
  galleryCount: number;
  // What the invitation shows while a field is empty (used as the field's hint).
  shown: { title: string; message: string; hosts: string; date: string };
};

export type RecoveryCard = { title: string; status: string; error: string };

export interface InviteStudioBridge {
  snapshot(): EditorSnapshot;
  subscribe(listener: () => void): () => void;
  version(): number;
  update(patch: Partial<EditorFields>): void;
  setSectionVisible(sectionId: string, visible: boolean): void;
  addEvent(title: string): string;
  updateEvent(eventId: string, patch: EventPatch): void;
  removeEvent(eventId: string): void;
  setRsvp(value: string): void;
  setTemplate(templateId: string): void;
  designs(): Design[];
  eventPresets(): string[];
  saveNow(): void;
  retrySave(): void;
  renderInvitation(host: HTMLElement, device: Device): void;
  createDraft(backendTemplateId: string, templateNumber: number): void;
  startCreate(category: string): void;
  openPreview(): void;
  previewTemplate(backendTemplateId: string): void;
  openPublish(): void;
  openAdvanced(): void;
  openLegacyTemplates(): void;
  recovery(): RecoveryCard | null;
  continueDraft(): void;
  categories(): Array<[string, string]>;
}

declare global {
  interface Window {
    InviteStudioBridge?: InviteStudioBridge;
  }
}

function host(): InviteStudioBridge {
  const installed = window.InviteStudioBridge;
  if (!installed) throw new Error("InviteStudio bridge is not installed.");
  return installed;
}

export const bridge = {
  snapshot: () => host().snapshot(),
  subscribe: (listener: () => void) => host().subscribe(listener),
  version: () => host().version(),
  update: (patch: Partial<EditorFields>) => host().update(patch),
  setSectionVisible: (sectionId: string, visible: boolean) => host().setSectionVisible(sectionId, visible),
  addEvent: (title: string) => host().addEvent(title),
  updateEvent: (eventId: string, patch: EventPatch) => host().updateEvent(eventId, patch),
  removeEvent: (eventId: string) => host().removeEvent(eventId),
  setRsvp: (value: string) => host().setRsvp(value),
  setTemplate: (templateId: string) => host().setTemplate(templateId),
  designs: () => host().designs(),
  eventPresets: () => host().eventPresets(),
  saveNow: () => host().saveNow(),
  retrySave: () => host().retrySave(),
  renderInvitation: (element: HTMLElement, device: Device) => host().renderInvitation(element, device),
  createDraft: (backendTemplateId: string, templateNumber: number) => host().createDraft(backendTemplateId, templateNumber),
  startCreate: (category: string) => host().startCreate(category),
  openPreview: () => host().openPreview(),
  previewTemplate: (backendTemplateId: string) => host().previewTemplate(backendTemplateId),
  openPublish: () => host().openPublish(),
  openAdvanced: () => host().openAdvanced(),
  openLegacyTemplates: () => host().openLegacyTemplates(),
  recovery: () => host().recovery(),
  continueDraft: () => host().continueDraft(),
  categories: () => host().categories()
};

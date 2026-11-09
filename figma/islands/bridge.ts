// The contract between the Figma islands and the existing InviteStudio application.
//
// The islands never touch localStorage, the API or edit tokens directly. Every
// action goes through window.InviteStudioBridge, which the vanilla application
// installs (figma-host.js). That keeps cloud-sync, publishing and the invitation
// renderer as the single implementations.

// The setup wizard keeps its fields in the screen and hands them over when a step is finished.
export type SetupFields = {
  title: string;
  date: string;
  location: string;
  message: string;
  story: string;
  hosts: string;
  templateId: string;
};
export type SetupStatus = { canFinish: boolean; offer: boolean; saveLine: string };

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

export type CopyField = { key: string; label: string; section: string; max: number; fallback: string; value: string };

export type Design = { id: string; name: string; style: string; image: string };

export interface RsvpReply {
  id: string;
  name: string;
  attending: boolean;
  party: number;
  events: Record<string, boolean>;
  needs: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface RsvpData {
  replies: RsvpReply[];
  totals: {
    replies: number;
    attending: number;
    notAttending: number;
    headcount: number;
    byEvent: Record<string, { title: string; replies: number; headcount: number }>;
  };
}

export interface PhotoItem {
  id: string;
  alt: string;
  thumb: string;
  width: number | null;
  height: number | null;
}

export interface MediaInfo {
  enabled: boolean;
  reason: string;
  error: string;
  loaded: boolean;
  limits: { photos: number; totalBytes: number };
  usage: { count: number; bytes: number };
}

export interface UploadResult {
  added: number;
  errors: Array<{ name: string; message: string }>;
}

export interface RetentionInfo {
  available: boolean;
  hasClock?: boolean;
  endsOn?: string | null;
  deleteOn?: string | null;
  stage?: "keep" | "hidden" | "delete_due" | "no_clock";
  daysLeft?: number | null;
  graceDays?: number;
  warnDays?: number;
  source?: string;
  lastEventDate?: string | null;
  endsBeforeEvent?: boolean;
  estimatedEndsOn?: string | null;
  estimateBeforeEvent?: boolean;
  closed?: boolean;
}

export interface ContactLinks {
  whatsapp: string;
  email: string;
}

export type EditorSnapshot = EditorFields & {
  available: boolean;
  draftId: string;
  photos: PhotoItem[];
  photoSlots: string[];
  media: MediaInfo;
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
  rsvpOpen: boolean;
  rsvpReplyBy: string;
  rsvpMaxParty: number;
  rsvpContact: { type: "whatsapp" | "phone"; value: string };
  galleryCount: number;
  // Wording the template lets the couple change (empty for templates without it).
  copyFields: CopyField[];
  // A cloud draft has a private link that opens it on another device.
  hasPrivateLink: boolean;
  // What the invitation shows while a field is empty (used as the field's hint).
  shown: { title: string; message: string; hosts: string; date: string };
};

export type RecoveryCard = { title: string; status: string; access: string; error: string };

export interface InviteStudioBridge {
  snapshot(): EditorSnapshot;
  subscribe(listener: () => void): () => void;
  version(): number;
  update(patch: Partial<EditorFields>): void;
  setSectionVisible(sectionId: string, visible: boolean): void;
  setCopy(key: string, text: string): void;
  copyPrivateLink(): void;
  addEvent(title: string): string;
  updateEvent(eventId: string, patch: EventPatch): void;
  removeEvent(eventId: string): void;
  moveEvent(eventId: string, toIndex: number): void;
  setRsvp(value: string): void;
  setRsvpContact(type: string, value: string): void;
  setRsvpOption(key: "rsvpOpen" | "rsvpReplyBy" | "rsvpMaxParty", value: boolean | string | number): void;
  loadRetention(): Promise<RetentionInfo>;
  contactLinks(topic: "extend" | "restore" | "custom" | "general", address?: string): ContactLinks;
  mediaLoad(): Promise<void>;
  mediaUpload(files: File[], onProgress?: (progress: { index: number; total: number; name: string }) => void): Promise<UploadResult>;
  mediaAlt(id: string, alt: string): Promise<void>;
  mediaMove(id: string, delta: number): Promise<void>;
  mediaRemove(id: string): Promise<void>;
  loadReplies(): Promise<RsvpData>;
  deleteReply(id: string): Promise<unknown>;
  downloadRepliesCsv(data: RsvpData, withCount: boolean): void;
  setTemplate(templateId: string): void;
  designs(): Design[];
  eventPresets(): string[];
  saveNow(): void;
  retrySave(): void;
  renderInvitation(host: HTMLElement, device: Device): void;
  createDraft(backendTemplateId: string, templateNumber: number, sampleNames?: string): void;
  startCreate(category: string): void;
  startSetup(backendTemplateId: string): void;
  openPreview(): void;
  setupDefaults(): { templateId: string };
  commitSetup(fields: SetupFields): boolean;
  renderDraft(host: HTMLElement, fields: SetupFields, fallbackTitle: string): void;
  setupStatus(): SetupStatus;
  keepLocal(): void;
  finishSetup(): void;
  renderTemplateDemo(host: HTMLElement, backendTemplateId: string): void;
  openPublish(): void;
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
  setCopy: (key: string, text: string) => host().setCopy(key, text),
  copyPrivateLink: () => host().copyPrivateLink(),
  addEvent: (title: string) => host().addEvent(title),
  updateEvent: (eventId: string, patch: EventPatch) => host().updateEvent(eventId, patch),
  removeEvent: (eventId: string) => host().removeEvent(eventId),
  moveEvent: (eventId: string, toIndex: number) => host().moveEvent(eventId, toIndex),
  setRsvp: (value: string) => host().setRsvp(value),
  setRsvpContact: (type: string, value: string) => host().setRsvpContact(type, value),
  setRsvpOption: (key: "rsvpOpen" | "rsvpReplyBy" | "rsvpMaxParty", value: boolean | string | number) => host().setRsvpOption(key, value),
  loadRetention: () => host().loadRetention(),
  contactLinks: (topic: "extend" | "restore" | "custom" | "general", address?: string) => host().contactLinks(topic, address),
  mediaLoad: () => host().mediaLoad(),
  mediaUpload: (files: File[], onProgress?: (progress: { index: number; total: number; name: string }) => void) => host().mediaUpload(files, onProgress),
  mediaAlt: (id: string, alt: string) => host().mediaAlt(id, alt),
  mediaMove: (id: string, delta: number) => host().mediaMove(id, delta),
  mediaRemove: (id: string) => host().mediaRemove(id),
  loadReplies: () => host().loadReplies(),
  deleteReply: (id: string) => host().deleteReply(id),
  downloadRepliesCsv: (data: RsvpData, withCount: boolean) => host().downloadRepliesCsv(data, withCount),
  setTemplate: (templateId: string) => host().setTemplate(templateId),
  designs: () => host().designs(),
  eventPresets: () => host().eventPresets(),
  saveNow: () => host().saveNow(),
  retrySave: () => host().retrySave(),
  renderInvitation: (element: HTMLElement, device: Device) => host().renderInvitation(element, device),
  createDraft: (backendTemplateId: string, templateNumber: number, sampleNames?: string) => host().createDraft(backendTemplateId, templateNumber, sampleNames),
  startCreate: (category: string) => host().startCreate(category),
  startSetup: (backendTemplateId: string) => host().startSetup(backendTemplateId),
  openPreview: () => host().openPreview(),
  setupDefaults: () => host().setupDefaults(),
  commitSetup: (fields: SetupFields) => host().commitSetup(fields),
  renderDraft: (element: HTMLElement, fields: SetupFields, fallbackTitle: string) => host().renderDraft(element, fields, fallbackTitle),
  setupStatus: () => host().setupStatus(),
  keepLocal: () => host().keepLocal(),
  finishSetup: () => host().finishSetup(),
  renderTemplateDemo: (element: HTMLElement, backendTemplateId: string) => host().renderTemplateDemo(element, backendTemplateId),
  openPublish: () => host().openPublish(),
  openLegacyTemplates: () => host().openLegacyTemplates(),
  recovery: () => host().recovery(),
  continueDraft: () => host().continueDraft(),
  categories: () => host().categories()
};

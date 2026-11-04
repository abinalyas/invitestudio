// The contract between the Figma islands and the existing InviteStudio application.
//
// The islands never touch localStorage, the API or edit tokens directly. Every
// action goes through window.InviteStudioBridge, which the vanilla application
// installs (figma-host.js). That keeps cloud-sync, publishing and the invitation
// renderer as the single implementations.

export type Device = "desktop" | "tablet" | "mobile";

export type EditorFields = {
  title: string;
  pretitle: string;
  date: string;
  location: string;
  buttonLabel: string;
  storyTitle: string;
  storyCopy: string;
  heroImageUrl: string;
};

export type EditorSnapshot = EditorFields & {
  available: boolean;
  templateId: string;
  publishStatus: string;
  published: boolean;
  publicSlug: string;
  publicUrl: string | null;
  saveLabel: string;
  saveFailed: boolean;
  // Visibility of the sections that the Figma pages map to: story, functions, gallery, rsvp.
  sections: Record<string, boolean>;
};

export type RecoveryCard = { title: string; status: string; error: string };

export interface InviteStudioBridge {
  snapshot(): EditorSnapshot;
  subscribe(listener: () => void): () => void;
  version(): number;
  update(patch: Partial<EditorFields>): void;
  setSectionVisible(sectionId: string, visible: boolean): void;
  saveNow(): void;
  renderInvitation(host: HTMLElement, device: Device): void;
  createDraft(backendTemplateId: string, templateNumber: number): void;
  startCreate(category: string): void;
  openPreview(): void;
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
  saveNow: () => host().saveNow(),
  renderInvitation: (element: HTMLElement, device: Device) => host().renderInvitation(element, device),
  createDraft: (backendTemplateId: string, templateNumber: number) => host().createDraft(backendTemplateId, templateNumber),
  startCreate: (category: string) => host().startCreate(category),
  openPreview: () => host().openPreview(),
  openPublish: () => host().openPublish(),
  openAdvanced: () => host().openAdvanced(),
  openLegacyTemplates: () => host().openLegacyTemplates(),
  recovery: () => host().recovery(),
  continueDraft: () => host().continueDraft(),
  categories: () => host().categories()
};

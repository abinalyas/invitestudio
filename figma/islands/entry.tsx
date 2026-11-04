// Mounts a Figma island into a host element. Each island gets its own shadow root,
// so the design's global CSS cannot restyle the existing pages, and the existing
// global CSS cannot restyle the islands.
import React from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "./Home";
import { TemplatesPage } from "./Templates";
import { TemplateDetailPage } from "./TemplateDetail";
import { EditorPage } from "./Editor";
import figmaCss from "../dist/figma-islands.css";

export type IslandKind = "home" | "templates" | "detail" | "editor";
export type IslandProps = { templateId?: number };
export type Island = { unmount(): void };

declare global {
  interface Window {
    InviteStudioFigma?: { mount(kind: IslandKind, host: HTMLElement, props?: IslandProps): Island };
  }
}

function screen(kind: IslandKind, props: IslandProps): React.ReactElement {
  switch (kind) {
    case "home":
      return <HomePage />;
    case "templates":
      return <TemplatesPage />;
    case "detail":
      return <TemplateDetailPage templateId={props.templateId ?? 1} />;
    case "editor":
      return <EditorPage />;
  }
}

function mount(kind: IslandKind, host: HTMLElement, props: IslandProps = {}): Island {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  shadow.replaceChildren();
  const style = document.createElement("style");
  style.textContent = figmaCss;
  const container = document.createElement("div");
  container.className = "figma-app";
  shadow.append(style, container);
  const root = createRoot(container);
  root.render(<React.StrictMode>{screen(kind, props)}</React.StrictMode>);
  return {
    unmount() {
      root.unmount();
      shadow.replaceChildren();
    }
  };
}

window.InviteStudioFigma = { mount };

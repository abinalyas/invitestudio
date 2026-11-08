// Mounts a Figma island into a host element. Each island gets its own shadow root,
// so the design's global CSS cannot restyle the existing pages, and the existing
// global CSS cannot restyle the islands.
import React from "react";
import { createRoot } from "react-dom/client";
import { HomePage } from "./Home";
import { TemplatesPage } from "./Templates";
import { TemplateDetailPage } from "./TemplateDetail";
import { EditorPage } from "./Editor";
import { SetupPage } from "./Setup";
import figmaCss from "../dist/figma-islands.css";

export type IslandKind = "home" | "templates" | "detail" | "editor" | "setup";
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
    case "setup":
      return <SetupPage />;
  }
}

// In-page links (#features, #how, #pricing) point at elements inside the shadow root, which the browser's
// own fragment navigation cannot see. Scroll to them here.
function scrollToId(shadow: ShadowRoot, id: string): boolean {
  const target = id ? shadow.getElementById(id) : null;
  if (!target) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  return true;
}

function fragmentOf(href: string | null): string {
  if (!href) return "";
  const match = /^(?:\/)?#([\w-]+)$/.exec(href);
  return match ? match[1] : "";
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
  shadow.addEventListener("click", (event) => {
    const link = (event as MouseEvent).composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
    const id = fragmentOf(link?.getAttribute("href") ?? null);
    if (id && scrollToId(shadow, id)) event.preventDefault();
  });
  // Arriving from another page with /#pricing in the address: scroll once the page has drawn.
  if (kind === "home" && window.location.hash) {
    const id = window.location.hash.slice(1);
    let tries = 0;
    const attempt = () => {
      if (scrollToId(shadow, id) || ++tries > 20) return;
      window.setTimeout(attempt, 100);
    };
    window.setTimeout(attempt, 100);
  }
  return {
    unmount() {
      root.unmount();
      shadow.replaceChildren();
    }
  };
}

window.InviteStudioFigma = { mount };

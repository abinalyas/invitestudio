// Horizontal "collection" strip for the home page: tall cards on a staggered wave that drift
// sideways on their own, can be dragged or swiped, and loop without a visible seam.
// A native overflow scroller is driven by requestAnimationFrame, so touch, trackpad, keyboard
// and drag all work with no library. Motion stops for reduced-motion users, while the strip
// is off screen, and while it is hovered, focused or being dragged.
import { useEffect, useRef, useState } from "react";
import { galleryTemplates } from "./shared";

// The list is repeated so the strip can loop. It must be wider than the screen plus two full copies,
// so the number of copies grows with the screen and shrinks with the number of templates.
function copiesFor(): number {
  const width = typeof window === "undefined" ? 1440 : window.innerWidth;
  return Math.min(14, Math.max(3, Math.ceil(width / (galleryTemplates.length * 140)) + 2));
}
const SPEED = 34; // px per second

export function TemplateStrip() {
  const scroller = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(copiesFor);

  useEffect(() => {
    const onResize = () => setCopies(copiesFor());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let setW = 0;
    let pos = 0;
    let last = 0;
    let raf = 0;
    let visible = false;
    let hovering = false;
    let dragging = false;
    let resumeAt = 0;
    let startX = 0;
    let startLeft = 0;
    let moved = 0;

    const measure = () => {
      const kids = el.querySelectorAll<HTMLElement>("[data-strip-item]");
      const per = galleryTemplates.length;
      if (kids.length < per * 2) return;
      const w = kids[per].offsetLeft - kids[0].offsetLeft;
      if (w > 0) {
        const first = setW === 0;
        setW = w;
        if (first) { el.scrollLeft = setW; pos = setW; }
      }
    };
    // Keeps the position inside the middle copy so the loop never runs out of cards.
    const wrap = () => {
      if (!setW) return;
      if (el.scrollLeft >= setW * 2) { el.scrollLeft -= setW; pos = el.scrollLeft; }
      else if (el.scrollLeft < setW * 0.5) { el.scrollLeft += setW; pos = el.scrollLeft; }
    };
    const tick = (now: number) => {
      raf = 0;
      if (!visible) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      if (Math.abs(el.scrollLeft - pos) > 1.5) pos = el.scrollLeft; // moved by the user
      if (!reduced && !hovering && !dragging && now > resumeAt) {
        pos += SPEED * dt;
        el.scrollLeft = pos;
      }
      wrap();
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && visible) { last = performance.now(); raf = requestAnimationFrame(tick); } };

    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); }, { threshold: 0.05 });
    io.observe(el);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("load", measure);

    const pause = () => { resumeAt = performance.now() + 2500; };
    // The mouse is only "captured" once it has moved a few pixels, so a plain click still reaches the
    // card's link. Capturing on press would send the click to the strip instead and nothing would open.
    let captured = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") { pause(); return; }
      dragging = true; captured = false; moved = 0; startX = e.clientX; startLeft = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      if (!captured && moved > 6) { captured = true; el.setPointerCapture(e.pointerId); }
      if (captured) el.scrollLeft = startLeft - dx;
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (captured) { captured = false; try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ } }
      pause();
    };
    const click = (e: MouseEvent) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } moved = 0; };
    const enter = () => { hovering = true; };
    const leave = () => { hovering = false; };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", pause, { passive: true });
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    el.addEventListener("focusin", enter);
    el.addEventListener("focusout", leave);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener("load", measure);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", pause);
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
      el.removeEventListener("focusin", enter);
      el.removeEventListener("focusout", leave);
    };
  }, [copies]);

  return (
    <div className="strip" ref={scroller} role="region" aria-label="Wedding templates, scrolling gallery">
      <div className="strip-track">
        {Array.from({ length: copies }).flatMap((_, copy) =>
          galleryTemplates.map((t, i) => (
            <a
              key={`${copy}-${t.id}`}
              data-strip-item
              data-wave={i % 2}
              className="strip-item"
              href={`/templates/${t.id}`}
              draggable={false}
              aria-hidden={copy !== 1 || undefined}
              tabIndex={copy === 1 ? 0 : -1}
              aria-label={`View ${t.title} template`}
            >
              <span className="strip-card">
                <img src={t.phone} alt="" loading="lazy" draggable={false} width={160} height={338} />
              </span>
              <span className="strip-name">{t.title}</span>
            </a>
          )),
        )}
      </div>
    </div>
  );
}

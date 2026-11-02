"use client";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

// Radix owns focus and scroll locking. This timeline owns visibility until the
// last closing frame, so closing partway through opening retraces the same poses.
export function MenuTimeline({
  open,
  still,
  onExit,
  children,
}: {
  open: boolean;
  still: boolean;
  onExit: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const tl = gsap.timeline({
        paused: true,
        defaults: { ease: "power2.out" },
        onReverseComplete: onExit,
      });
      tl.fromTo(".nav-scrim", { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0)
        .fromTo(
          ".nav-primary a",
          { opacity: 0, y: 7 },
          { opacity: 1, y: 0, stagger: 0.016, duration: 0.22 },
          0.035,
        )
        .fromTo(
          ".nav-utilities",
          { opacity: 0, y: 3 },
          { opacity: 1, y: 0, duration: 0.18 },
          0.14,
        )
        .fromTo(
          ".menu-close i:first-child",
          { y: -6, rotation: 0 },
          { y: 0, rotation: 45, duration: 0.24 },
          0,
        )
        .fromTo(
          ".menu-close i:last-child",
          { y: 6, rotation: 0, scaleX: 0.67 },
          { y: 0, rotation: -45, scaleX: 1, duration: 0.24 },
          0,
        );
      timeline.current = tl;
    }, root);
    return () => {
      context.revert();
      timeline.current = null;
    };
  }, [onExit]);
  useLayoutEffect(() => {
    const tl = timeline.current;
    if (!tl) return;
    if (still) {
      tl.pause().progress(open ? 1 : 0, true);
      if (!open) onExit();
      return;
    }
    if (open) tl.timeScale(1).play();
    else if (tl.time() > 0) tl.timeScale(1.5).reverse();
    else onExit();
  }, [open, still, onExit]);
  return (
    <div ref={root} className="menu-motion" data-closing={!open || undefined}>
      {children}
    </div>
  );
}

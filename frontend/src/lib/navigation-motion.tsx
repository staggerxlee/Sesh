"use client";
import {
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
  type MouseEvent,
} from "react";
const motionQuery = "(prefers-reduced-motion: reduce)";
function listenToMotionPreference(notify: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
export function useSystemStill() {
  return useSyncExternalStore(
    listenToMotionPreference,
    () => window.matchMedia(motionQuery).matches,
    () => false,
  );
}

// Internal routes share one persistent app shell. Keep modified clicks native.
export function plainClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}
export function navigateTo(href: string) {
  if (window.location.pathname !== href) {
    // Keep the outgoing frame at the same visual position when the new page
    // starts at the top, including links reached far down the Study Index.
    for (const el of document.querySelectorAll<HTMLElement>(
      ".route-layer:not([data-leaving]),.home-world-host:not(.parked)",
    ))
      el.style.setProperty("--departure-top", -window.scrollY + "px");
    window.history.pushState(null, "", href);
  }
  window.dispatchEvent(new CustomEvent("sesh-navigation", { detail: href }));
  window.scrollTo({ top: 0, behavior: "instant" });
}
export function PageLink({
  href,
  onClick,
  ...props
}: ComponentPropsWithoutRef<"a"> & { href: string }) {
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (plainClick(e)) {
          e.preventDefault();
          navigateTo(href);
        }
      }}
    />
  );
}
export const editorialEase = [0.22, 0.68, 0.18, 1] as const;

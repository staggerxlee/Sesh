"use client";
import { X } from "lucide-react";
import { useEffect } from "react";
import { RouteStage } from "./route-stage";
import { navigateTo, useSystemStill } from "@/lib/navigation-motion";
import { FullscreenNavigation } from "./fullscreen-navigation";
import { usePathname } from "next/navigation";
import { MotionConfig } from "motion/react";
import { SeshProvider, useSesh } from "@/lib/store";
import { AuthDialog } from "./auth";
import { Home } from "./home";
import { ActiveFocus } from "./focus";
import {
  AnalyticsPage,
  CalendarPage,
  HistoryPage,
  ReviewsPage,
  SettingsPage,
  SubjectsPage,
} from "./reflection";
function Shell() {
  const pathname = usePathname();

  const {
    preferences,
    toast,
    setToast,
    connectionError,
    refresh,
    active,
    loading,
  } = useSesh();
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key.toLowerCase() === "f" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !active &&
        !target.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      ) {
        event.preventDefault();
        navigateTo("/focus");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [active]);
  // The focus camera travels over the mounted homepage. Route choreography
  // applies only when the underlying editorial surface actually changes.
  const systemStill = useSystemStill();
  const still = preferences.reduced_motion || systemStill;
  const page =
    pathname === "/focus" ? "home" : pathname.split("/")[1] || "home";
  const renderPage = (page: string) =>
    loading ? (
      <div className="loading-space" role="status">
        <span className="eyebrow">SETTLING IN</span>
        <p>Getting your space ready.</p>
      </div>
    ) : page === "home" ? (
      <Home />
    ) : page === "study-index" ? (
      <Home indexOnly />
    ) : page === "profile" ? (
      <SettingsPage profileOnly />
    ) : page === "calendar" ? (
      <CalendarPage />
    ) : page === "analytics" ? (
      <AnalyticsPage />
    ) : page === "subjects" ? (
      <SubjectsPage />
    ) : page === "history" ? (
      <HistoryPage />
    ) : page === "settings" ? (
      <SettingsPage />
    ) : page === "reviews" ? (
      <ReviewsPage />
    ) : (
      <Home />
    );
  return (
    <MotionConfig
      reducedMotion={preferences.reduced_motion ? "always" : "user"}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <FullscreenNavigation still={still} />
      <div className="app-shell" data-page={page}>
        <div className="app-main">
          {connectionError && (
            <div className="connection-banner" role="status">
              <span>{connectionError}</span>
              <button onClick={() => void refresh()}>Try again</button>
            </div>
          )}
          <RouteStage page={page} still={still} render={renderPage} />
        </div>
      </div>
      <AuthDialog />
      <ActiveFocus />
      {toast && !active && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </MotionConfig>
  );
}
export function SeshApp() {
  return (
    <SeshProvider>
      <Shell />
    </SeshProvider>
  );
}

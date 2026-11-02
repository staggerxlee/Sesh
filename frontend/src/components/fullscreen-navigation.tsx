"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  House,
  Timer,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Folders,
  Star,
  UserRound,
  History,
  SlidersVertical,
  LogOut,
} from "lucide-react";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type MouseEvent,
} from "react";
import { MenuTimeline } from "./menu-timeline";
import { navigateTo, plainClick } from "@/lib/navigation-motion";
import { usePathname } from "next/navigation";
import { useSesh } from "@/lib/store";
import { signOut } from "@/lib/api";

const pages = [
  { href: "/", label: "Home", icon: House },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/study-index", label: "Study Index", icon: BookOpen },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: ChartNoAxesColumnIncreasing },
  { href: "/subjects", label: "Subjects", icon: Folders },
  { href: "/reviews", label: "Reviews", icon: Star },
];
const utilities = [
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/history", label: "History", icon: History },
  { href: "/settings", label: "Settings", icon: SlidersVertical },
];

function MenuMark() {
  return (
    <span className="menu-mark" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}

export function FullscreenNavigation({ still }: { still: boolean }) {
  const pathname = usePathname();
  const { user } = useSesh();
  const [mounted, setMounted] = useState(false);
  const finishClose = useCallback(() => setMounted(false), []);
  const [origin, setOrigin] = useState({ path: pathname, room: false });
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const destination = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const back = () => {
      destination.current = window.location.pathname;
      setOpen(false);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!plainClick(event)) return;
    event.preventDefault();
    if (mounted && !open) return;
    if (open) destination.current = href;
    setOpen(false);
    navigateTo(href);
  }
  async function logout() {
    if (!user || signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not sign out. Please try again.",
      );
      setSigningOut(false);
    }
  }
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMounted(true);
          setOrigin({
            path: pathname,
            room: !!document.querySelector(".cinema-host"),
          });
          destination.current = null;
          setError("");
        }
      }}
    >
      <header className="sesh-masthead" data-home={pathname === "/"}>
        <a
          href="/"
          onClick={(event) => navigate(event, "/")}
          aria-label="Sesh home"
          className="atelier-logo"
        >
          <i aria-hidden="true">✳</i>sesh<sup>01</sup>
        </a>
        <Dialog.Trigger asChild>
          <button
            ref={trigger}
            className="menu-toggle"
            aria-label="Open navigation"
          >
            <MenuMark />
          </button>
        </Dialog.Trigger>
      </header>
      {mounted && (
        <Dialog.Portal forceMount>
          <MenuTimeline open={open} still={still} onExit={finishClose}>
            <Dialog.Overlay
              forceMount
              className="nav-scrim"
              data-home={origin.path === "/"}
            />
            <Dialog.Content
              forceMount
              className="nav-sheet"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                if (!destination.current) return;
                event.preventDefault();
                const target =
                  document.querySelector<HTMLElement>(
                    ".cinema .leave-cinema",
                  ) ?? document.getElementById("main");
                if (target && !target.closest("[inert]"))
                  target.focus({ preventScroll: true });
                else trigger.current?.focus({ preventScroll: true });
                destination.current = null;
              }}
            >
              <Dialog.Title className="sr-only">Navigation</Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="menu-toggle menu-close"
                  aria-label="Close navigation"
                >
                  <MenuMark />
                </button>
              </Dialog.Close>
              <div className="nav-column">
                <nav aria-label="Main navigation" className="nav-primary">
                  {pages.map(({ href, label, icon: Icon }) => (
                    <a
                      key={href}
                      href={href}
                      aria-current={
                        (origin.room ? "/focus" : origin.path) === href
                          ? "page"
                          : undefined
                      }
                      onClick={(event) => navigate(event, href)}
                      data-selected={destination.current === href || undefined}
                    >
                      <Icon aria-hidden="true" strokeWidth={1.25} />
                      <span>{label}</span>
                    </a>
                  ))}
                </nav>
                <nav aria-label="Account navigation" className="nav-utilities">
                  {utilities.map(({ href, label, icon: Icon }) => (
                    <a
                      key={href}
                      href={href}
                      aria-label={label}
                      aria-current={pathname === href ? "page" : undefined}
                      onClick={(event) => navigate(event, href)}
                    >
                      <Icon aria-hidden="true" strokeWidth={1.6} />
                      <span role="tooltip">{label}</span>
                    </a>
                  ))}
                  <button
                    aria-label="Sign out"
                    className="nav-logout"
                    aria-disabled={!user || signingOut}
                    onClick={logout}
                  >
                    <LogOut aria-hidden="true" strokeWidth={1.6} />
                    <span role="tooltip">
                      {!user
                        ? "Already signed out"
                        : signingOut
                          ? "Signing out…"
                          : "Sign out"}
                    </span>
                  </button>
                </nav>
                {error && <p role="alert">{error}</p>}
              </div>
            </Dialog.Content>
          </MenuTimeline>
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

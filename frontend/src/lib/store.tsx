"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, ApiError } from "./api";
import { isOlderSnapshot } from "./timer";
import type {
  User,
  Preferences,
  PersonalCover,
  Subject,
  Topic,
  StudySession,
  Analytics,
} from "./types";
export const defaultPreferences: Preferences = {
  timezone: "Asia/Kathmandu",
  week_start: 0,
  daily_goal_minutes: 120,
  weekly_goal_minutes: 600,
  default_mode: "stopwatch",
  default_duration: 25,
  pomodoro_focus: 25,
  short_break: 5,
  long_break: 15,
  theme: "dark",
  reduced_motion: false,
  notifications: false,
  rest_days: [],
};
interface SeshStore {
  user: User | null;
  preferences: Preferences;
  subjects: Subject[];
  topics: Topic[];
  sessions: StudySession[];
  stats: Analytics | null;
  active: StudySession | null;
  loading: boolean;
  connectionError: string;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  openAuth: () => void;
  applyCover: (owner: number, cover: PersonalCover) => void;
  setActive: (active: StudySession | null) => void;
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  toast: string;
  setToast: (text: string) => void;
}
const Context = createContext<SeshStore | null>(null);
export function SeshProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [preferences, setPreferences] = useState(defaultPreferences),
    [subjects, setSubjects] = useState<Subject[]>([]),
    [topics, setTopics] = useState<Topic[]>([]),
    [sessions, setSessions] = useState<StudySession[]>([]),
    [stats, setStats] = useState<Analytics | null>(null),
    [active, setActiveState] = useState<StudySession | null>(null),
    [loading, setLoading] = useState(true),
    [connectionError, setConnectionError] = useState(""),
    [authOpen, setAuthOpen] = useState(false),
    [toast, setToast] = useState("");
  const refreshGeneration = useRef(0),
    timerGeneration = useRef(0);
  const notify = useCallback((message: string) => setToast(message), []);
  const latestActive = useRef<StudySession | null>(null);
  const endedIds = useRef(new Set<number>());
  const applyActive = useCallback(
    (next: StudySession | null, restored = false) => {
      const previous = latestActive.current;
      if (isOlderSnapshot(previous, next, endedIds.current)) return;
      if (!next && previous) endedIds.current.add(previous.id);
      const value = next
        ? {
            ...next,
            restored: previous?.id === next.id ? previous.restored : restored,
          }
        : null;
      latestActive.current = value;
      setActiveState(value);
    },
    [],
  );
  // A mutation invalidates refreshes that began against an earlier timer state.
  const setActive = useCallback(
    (next: StudySession | null) => {
      timerGeneration.current += 1;
      applyActive(next);
    },
    [applyActive],
  );
  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current,
      timerVersion = timerGeneration.current;
    try {
      const me = await api<{ user: User; preferences: Preferences }>(
        "/auth/me/",
      );
      const result = await Promise.all([
        api<Subject[]>("/subjects/"),
        api<Topic[]>("/topics/"),
        api<StudySession[]>("/sessions/"),
        api<Analytics>("/analytics/"),
        api<StudySession | null>("/sessions/active/"),
      ]);
      if (generation !== refreshGeneration.current) return;
      setUser(me.user);
      setPreferences({ ...defaultPreferences, ...me.preferences });
      setSubjects(result[0]);
      setTopics(result[1]);
      setSessions(result[2]);
      setStats(result[3]);
      if (timerVersion === timerGeneration.current)
        applyActive(result[4], true);
      setConnectionError("");
    } catch (error) {
      if (generation !== refreshGeneration.current) return;
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setUser(null);
        setPreferences(defaultPreferences);
        setSubjects([]);
        setTopics([]);
        setSessions([]);
        setStats(null);
        latestActive.current = null;
        setActiveState(null);
        setConnectionError("");
      } else
        setConnectionError(
          error instanceof Error ? error.message : "Unable to connect to Sesh.",
        );
    } finally {
      if (generation === refreshGeneration.current) setLoading(false);
    }
  }, [applyActive]);
  useEffect(() => {
    void refresh();
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);
  useEffect(() => {
    const channel = new BroadcastChannel("sesh-sync");
    channel.onmessage = () => {
      void refresh();
    };
    return () => channel.close();
  }, [refresh]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        preferences.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preferences.theme;
      document.documentElement.dataset.reducedMotion = String(
        preferences.reduced_motion,
      );
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme, preferences.reduced_motion]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  return (
    <Context.Provider
      value={{
        user,
        preferences,
        subjects,
        topics,
        sessions,
        stats,
        active,
        loading,
        connectionError,
        refresh,
        notify,
        applyCover: (owner, cover) => {
          refreshGeneration.current++;
          setUser((current) =>
            current?.id === owner ? { ...current, cover } : current,
          );
        },
        openAuth: () => setAuthOpen(true),
        setActive,
        authOpen,
        setAuthOpen,
        toast,
        setToast,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSesh() {
  const context = useContext(Context);
  if (!context) throw new Error("SeshProvider is required");
  return context;
}
export function broadcast() {
  const channel = new BroadcastChannel("sesh-sync");
  channel.postMessage("refresh");
  channel.close();
}

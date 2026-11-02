"use client";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Sun,
  WifiOff,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { broadcast, useSesh } from "@/lib/store";
import { duration } from "@/lib/utils";
import { timerSnapshot } from "@/lib/timer";
import type { StudySession, Subject, TimerMode } from "@/lib/types";
import { usePathname } from "next/navigation";

import { ClockDigits, DurationClock } from "./duration-clock";
import { MAX_FOCUS_SECONDS, MAX_BREAK_SECONDS } from "@/lib/clock";
import { RoomStage } from "./room-stage";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
export function FocusSetup({ compact = false }: { compact?: boolean }) {
  const {
    user,
    subjects,
    topics,
    preferences,
    active,
    setActive,
    openAuth,
    notify,
    refresh,
  } = useSesh();
  const available = subjects.filter((s) => !s.archived);
  const [subject, setSubject] = useState<number | "">("");
  const [topic, setTopic] = useState<number | "">("");
  const [mode, setMode] = useState<TimerMode>(preferences.default_mode);
  const [countdownSeconds, setCountdownSeconds] = useState(
    preferences.default_duration * 60,
  );
  const [pomodoroSeconds, setPomodoroSeconds] = useState(
    preferences.pomodoro_focus * 60,
  );
  const focusSeconds = mode === "pomodoro" ? pomodoroSeconds : countdownSeconds;
  const setFocusSeconds =
    mode === "pomodoro" ? setPomodoroSeconds : setCountdownSeconds;
  const [breakSeconds, setBreakSeconds] = useState(
    preferences.short_break * 60,
  );
  const [editingPhase, setEditingPhase] = useState<"focus" | "break">("focus");
  const starting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [newSubject, setNewSubject] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setMode(preferences.default_mode);
    setCountdownSeconds(preferences.default_duration * 60);
    setPomodoroSeconds(preferences.pomodoro_focus * 60);
    setBreakSeconds(preferences.short_break * 60);
  }, [
    preferences.default_mode,
    preferences.default_duration,
    preferences.pomodoro_focus,
    preferences.short_break,
  ]);
  useEffect(() => {
    if (!user) {
      setSubject("");
      return;
    }
    let saved: {
      subject?: number;
      topic?: number;
      mode?: TimerMode;
      minutes?: number;
      focusSeconds?: number;
      countdownSeconds?: number;
      pomodoroSeconds?: number;
      breakSeconds?: number;
    } | null = null;
    try {
      saved = JSON.parse(
        localStorage.getItem(`sesh-setup-${user.id}`) || "null",
      );
    } catch {}
    const selected =
      available.find((s) => s.id === saved?.subject) || available[0];
    setSubject(selected?.id || "");
    if (saved?.mode) {
      setMode(saved.mode);
      const bounded = (seconds: number) =>
        Math.max(0, Math.min(MAX_FOCUS_SECONDS, seconds));
      const legacy = saved.focusSeconds ?? (saved.minutes || 25) * 60;
      setCountdownSeconds(
        bounded(
          saved.countdownSeconds ??
            (saved.mode === "countdown"
              ? legacy
              : preferences.default_duration * 60),
        ),
      );
      setPomodoroSeconds(
        bounded(
          saved.pomodoroSeconds ??
            (saved.mode === "pomodoro"
              ? legacy
              : preferences.pomodoro_focus * 60),
        ),
      );
      setBreakSeconds(
        Math.max(
          0,
          Math.min(
            MAX_BREAK_SECONDS,
            saved.breakSeconds ?? preferences.short_break * 60,
          ),
        ),
      );
    }
    if (
      saved?.topic &&
      topics.some((t) => t.id === saved.topic && t.subject === selected?.id)
    )
      setTopic(saved.topic);
  }, [user?.id, subjects.length]);
  async function start() {
    if (starting.current) return;
    if (
      !active &&
      mode !== "stopwatch" &&
      (focusSeconds <= 0 || (mode === "pomodoro" && breakSeconds <= 0))
    ) {
      setError("Choose a positive duration for each phase.");
      return;
    }
    if (!user) {
      openAuth();
      return;
    }
    if (!subject) {
      setNewSubject(true);
      return;
    }
    starting.current = true;
    setBusy(true);
    setError("");
    try {
      if (active) {
        window.dispatchEvent(new CustomEvent("sesh-enter-room"));
        setActive({ ...active });
        return;
      }
      const data = await api<StudySession>("/sessions/start/", {
        method: "POST",
        body: JSON.stringify({
          subject,
          topic: topic || null,
          mode,
          target_seconds:
            mode === "stopwatch" ? Math.max(1, focusSeconds) : focusSeconds,
          break_seconds:
            mode === "pomodoro" ? breakSeconds : Math.max(1, breakSeconds),
          client_event_id: crypto.randomUUID(),
        }),
      });
      localStorage.setItem(
        `sesh-setup-${user.id}`,
        JSON.stringify({
          subject,
          topic,
          mode,
          focusSeconds,
          countdownSeconds,
          pomodoroSeconds,
          breakSeconds,
        }),
      );
      setActive(data);
      broadcast();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) await refresh();
      setError(
        e instanceof Error ? e.message : "Could not start your session.",
      );
    } finally {
      starting.current = false;
      setBusy(false);
    }
  }
  async function addSubject(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<Subject>("/subjects/", {
        method: "POST",
        body: JSON.stringify({
          name,
          color: "#7b896e",
          weekly_goal_minutes: 0,
        }),
      });
      await refresh();
      setSubject(result.id);
      setName("");
      setNewSubject(false);
      notify("Subject added. You’re ready to focus.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add subject.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`focus-setup ${compact ? "compact" : ""}`}>
      <div className="focus-setup-top">
        <span className="eyebrow">
          {compact ? "TIMER MODE" : "SESSION SETUP"}
        </span>
        <span className="quiet-dot" aria-hidden="true" />
      </div>
      <div className="timer-modes" aria-label="Timer mode">
        {(["stopwatch", "countdown", "pomodoro"] as const).map((item) => (
          <button
            key={item}
            type="button"
            className={mode === item ? "selected" : ""}
            aria-pressed={mode === item}
            onClick={() => {
              setMode(item);
              setEditingPhase("focus");
            }}
          >
            {item.charAt(0).toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>
      {mode === "pomodoro" && (
        <div className="clock-phases" aria-label="Configure Pomodoro">
          {(["focus", "break"] as const).map((phase) => (
            <button
              key={phase}
              type="button"
              aria-pressed={editingPhase === phase}
              onClick={() => setEditingPhase(phase)}
            >
              {phase === "focus" ? "Focus" : "Break"}{" "}
              <ClockDigits
                seconds={phase === "focus" ? focusSeconds : breakSeconds}
              />
            </button>
          ))}
        </div>
      )}
      <DurationClock
        key={mode === "pomodoro" ? editingPhase : "focus"}
        seconds={
          mode === "stopwatch"
            ? 0
            : mode === "pomodoro" && editingPhase === "break"
              ? breakSeconds
              : focusSeconds
        }
        onChange={
          mode === "pomodoro" && editingPhase === "break"
            ? setBreakSeconds
            : setFocusSeconds
        }
        max={
          mode === "pomodoro" && editingPhase === "break"
            ? MAX_BREAK_SECONDS
            : MAX_FOCUS_SECONDS
        }
        label={
          mode === "pomodoro" && editingPhase === "break" ? "Break" : "Focus"
        }
        editable={mode !== "stopwatch" && !active && !busy}
      />
      <div className="setup-fields">
        <label className="subject-picker">
          <span
            className="subject-dot"
            style={{
              background:
                available.find((s) => s.id === subject)?.color ||
                "var(--accent)",
            }}
          />
          <select
            aria-label="Study subject"
            value={subject}
            onChange={(e) => {
              setSubject(Number(e.target.value));
              setTopic("");
            }}
          >
            <option value="" disabled>
              Choose your subject
            </option>
            {available.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>
        {subject && topics.some((t) => t.subject === subject) && (
          <select
            className="topic-picker"
            aria-label="Study topic"
            value={topic}
            onChange={(e) =>
              setTopic(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">No topic</option>
            {topics
              .filter((t) => t.subject === subject)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        )}
      </div>
      <Button
        className="start-focus"
        disabled={
          busy ||
          (!active &&
            mode !== "stopwatch" &&
            (focusSeconds === 0 || (mode === "pomodoro" && breakSeconds === 0)))
        }
        onClick={start}
      >
        {busy ? (
          <Loader2 className="spin" size={18} />
        ) : (
          <Play size={16} fill="currentColor" />
        )}
        {active ? "Return to session" : "Begin focus"}
        <span className="button-shortcut" aria-hidden="true">
          ↵
        </span>
      </Button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <Modal
        open={newSubject}
        onOpenChange={setNewSubject}
        title="What are you studying?"
        description="Just a name is enough. You can add topics later."
      >
        <form onSubmit={addSubject} className="auth-form">
          <label className="field">
            Subject name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              placeholder="e.g. Mathematics"
              required
              autoFocus
            />
          </label>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <Button disabled={busy} type="submit">
            <Plus size={16} />
            Add subject
          </Button>
        </form>
      </Modal>
    </div>
  );
}
export function FocusPage() {
  return null;
}
interface PendingAction {
  action: string;
  occurred_at: string;
  session: number;
  revision: number;
  client_event_id: string;
}
function EntryTitle() {
  const { user } = useSesh();
  const words = user?.cover?.show_on_entry ? user.cover.words : "";
  const [brief, setBrief] = useState(true);
  useEffect(() => {
    if (!words) return;
    const t = setTimeout(() => setBrief(false), 4800);
    return () => clearTimeout(t);
  }, [words]);
  const showWords = !!(brief && words?.trim());
  return (
    <div className="entry-title">
      <h1 style={{ visibility: showWords ? "hidden" : undefined }}>
        The Listening
        <br />
        <em>Room.</em>
      </h1>
      {showWords && (
        <h1 className={"entry-words" + (words.length > 100 ? " passage" : "")}>
          {words}
        </h1>
      )}
    </div>
  );
}
export function ActiveFocus() {
  const { active, setActive, refresh, notify, stats, preferences } = useSesh();
  const pathname = usePathname();
  const [entered, setEntered] = useState(false),
    [dismissed, setDismissed] = useState(false),
    [idle, setIdle] = useState(false);
  const [retreat, setRetreat] = useState(false);
  useEffect(() => {
    function followLocation() {
      if (
        window.location.pathname === "/" &&
        document.querySelector(".cinema-host")
      ) {
        setEntered(true);
        setDismissed(false);
        setRetreat(true);
        return;
      }
      setRetreat(false);
      setEntered(false);
      setDismissed(window.location.pathname !== "/focus");
    }
    window.addEventListener("sesh-navigation", followLocation);
    window.addEventListener("popstate", followLocation);
    return () => {
      window.removeEventListener("sesh-navigation", followLocation);
      window.removeEventListener("popstate", followLocation);
    };
  }, []);
  useEffect(() => {
    if (pathname === "/focus") setDismissed(false);
  }, [pathname]);

  useEffect(() => {
    const open = () => {
      window.scrollTo({ top: 0, behavior: "instant" });
      setRetreat(false);
      setDismissed(false);
      setEntered(true);
    };
    window.addEventListener("sesh-enter-room", open);
    return () => window.removeEventListener("sesh-enter-room", open);
  }, []);
  useEffect(() => {
    if (active?.id)
      setDismissed(
        !!active.restored &&
          !["/", "/focus"].includes(window.location.pathname),
      );
  }, [active?.id]);
  const [observedAt, setObservedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [discard, setDiscard] = useState(false);
  const [summary, setSummary] = useState<StudySession | null>(null);
  const [note, setNote] = useState("");
  const [full, setFull] = useState(false);
  useEffect(() => {
    const change = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const activeRef = useRef(active);
  const requestBusy = useRef(false);
  const lastTick = useRef(Date.now());
  useEffect(() => {
    activeRef.current = active;
    setObservedAt(active?.observed_at || Date.now());
    setNow(Date.now());
    setUncertain(!!active?.recovery_required);
  }, [active]);
  useEffect(() => {
    setError("");
    setPending(null);
    if (!active) return;
    try {
      const value = JSON.parse(
        localStorage.getItem(`sesh-pending-${active.id}`) || "null",
      );
      if (value) setPending(value);
    } catch {}
  }, [active?.id]);
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      if (
        t - lastTick.current > 90_000 &&
        activeRef.current?.status === "active"
      )
        setUncertain(true);
      const current = activeRef.current;
      if (
        current?.status === "active" &&
        current.server_now &&
        current.observed_at
      ) {
        const serverEstimate =
          Date.parse(current.server_now) + (t - current.observed_at);
        if (serverEstimate - Date.parse(current.last_heartbeat_at) > 90_000)
          setUncertain(true);
      }
      lastTick.current = t;
      setNow(t);
    }, 1000);
    const sync = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine && activeRef.current) void refresh();
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    setOffline(!navigator.onLine);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [refresh]);
  const heartbeat = useCallback(async () => {
    const current = activeRef.current;
    if (
      !current ||
      current.status !== "active" ||
      document.hidden ||
      requestBusy.current ||
      !navigator.onLine ||
      localStorage.getItem(`sesh-pending-${current.id}`)
    )
      return;
    try {
      const data = await api<StudySession>(
        `/sessions/${current.id}/heartbeat/`,
        {
          method: "POST",
          body: JSON.stringify({ revision: current.revision }),
        },
      );
      if (activeRef.current?.revision === current.revision) setActive(data);
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else if (e instanceof ApiError && e.status === 409) void refresh();
    }
  }, [refresh, setActive]);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => void heartbeat(), 15_000);
    return () => clearInterval(id);
  }, [active?.id, heartbeat]);
  async function action(kind: string, countElapsed?: boolean) {
    if (!active || requestBusy.current) return;
    setBusy(true);
    requestBusy.current = true;
    setError("");
    const eventId = crypto.randomUUID();
    const clickedAt = Date.now();
    const eventAt = new Date(
      (active.server_now ? Date.parse(active.server_now) : clickedAt) +
        (clickedAt - (active.observed_at || clickedAt)),
    ).toISOString();
    try {
      const data = await api<StudySession>(`/sessions/${active.id}/${kind}/`, {
        method: "POST",
        body: JSON.stringify({
          revision: active.revision,
          client_event_id: eventId,
          ...(kind === "recover" ? { count_elapsed: countElapsed } : {}),
          ...(kind === "finish" ? { note } : {}),
        }),
      });
      if (kind === "finish") {
        localStorage.removeItem(`sesh-pending-${active.id}`);
        setSummary(data);
        setNote(data.note || "");
        setActive(null);
        await refresh();
      } else if (kind === "discard") {
        setActive(null);
        setDiscard(false);
        setPending(null);
        localStorage.removeItem(`sesh-pending-${active.id}`);
        await refresh();
        notify("Session discarded. A fresh start awaits.");
      } else {
        setActive(data);
        if (kind === "recover") setUncertain(false);
      }
      broadcast();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
        setOffline(true);
        if (kind === "pause" || kind === "finish") {
          const queued = {
            action: kind,
            occurred_at: eventAt,
            session: active.id,
            revision: active.revision,
            client_event_id: eventId,
          };
          setPending(queued);
          localStorage.setItem(
            `sesh-pending-${active.id}`,
            JSON.stringify(queued),
          );
          setUncertain(true);
          setError(
            "Your request is saved on this device. Reconnect to review and sync it.",
          );
        }
      } else {
        setError(
          e instanceof Error ? e.message : "Could not update your session.",
        );
        if (e instanceof ApiError && e.status === 409) await refresh();
      }
    } finally {
      setBusy(false);
      requestBusy.current = false;
    }
  }
  async function syncPending(countElapsed: boolean) {
    if (!active || !pending || requestBusy.current) return;
    setBusy(true);
    requestBusy.current = true;
    setError("");
    try {
      // A lost response does not imply the mutation failed. Read the authoritative
      // session first so a committed pause/finish is acknowledged, never repeated.
      const latest = await api<StudySession>(`/sessions/${pending.session}/`);
      let data = latest;
      const alreadyApplied =
        (pending.action === "finish" && latest.status === "completed") ||
        (pending.action === "pause" && latest.status === "paused");
      if (!alreadyApplied) {
        if (latest.revision !== pending.revision || latest.status !== "active")
          throw new Error(
            "This session changed in another tab. Your saved request was not applied. Reload to review its current state.",
          );
        data = await api<StudySession>(
          `/sessions/${pending.session}/recover/`,
          {
            method: "POST",
            body: JSON.stringify({
              revision: latest.revision,
              occurred_at: pending.occurred_at,
              client_event_id: `recover-${pending.client_event_id}`,
              count_elapsed: countElapsed,
              after_action: pending.action,
            }),
          },
        );
      }
      localStorage.removeItem(`sesh-pending-${pending.session}`);
      setPending(null);
      setUncertain(false);
      if (data.status === "completed") {
        setSummary(data);
        setNote(data.note || "");
        setActive(null);
        await refresh();
      } else setActive(data);
      broadcast();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sync.");
      await refresh();
    } finally {
      setBusy(false);
      requestBusy.current = false;
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setFull(false);
      } else {
        await document.documentElement.requestFullscreen();
        setFull(true);
      }
    } catch {
      notify("Fullscreen isn’t available in this browser.");
    }
  }
  async function closeSummary() {
    setBusy(true);
    try {
      if (summary && note !== summary.note)
        await api(`/sessions/${summary.id}/`, {
          method: "PATCH",
          body: JSON.stringify({ note }),
        });
      await refresh();
      setRetreat(true);
      setNote("");
      if (document.fullscreenElement) await document.exitFullscreen();
      setFull(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save note.");
    } finally {
      setBusy(false);
    }
  }
  const snapshot = active
    ? timerSnapshot(active, observedAt, now, uncertain || !!pending)
    : null;
  const autoFinish = useRef<() => void>(() => {}),
    finishedTarget = useRef("");
  autoFinish.current = () => {
    void action("finish");
  };
  useEffect(() => {
    if (
      active?.mode !== "countdown" ||
      active.status !== "active" ||
      !snapshot?.complete ||
      pending ||
      uncertain ||
      active.recovery_required ||
      busy ||
      offline
    )
      return;
    const key = active.id + ":" + active.revision;
    if (finishedTarget.current === key) return;
    finishedTarget.current = key;
    autoFinish.current();
  }, [active, snapshot?.complete, pending, uncertain, busy, offline]);
  const notifiedPhase = useRef("");
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (shell)
      shell.inert =
        !dismissed &&
        (!!active || !!summary || entered || pathname === "/focus");
    return () => {
      if (shell) shell.inert = false;
    };
  }, [!!active, !!summary, entered, dismissed, pathname]);
  useEffect(() => {
    if (
      !active ||
      !snapshot?.complete ||
      uncertain ||
      active.recovery_required ||
      !preferences.notifications ||
      !document.hidden ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const key = `${active.id}-${active.phase_started_at}`;
    if (notifiedPhase.current === key) return;
    notifiedPhase.current = key;
    new Notification(
      active.phase === "focus" ? "A little further." : "Ready when you are.",
      {
        body:
          active.phase === "focus"
            ? "Your focus interval is complete."
            : "Your break is complete.",
        tag: "sesh-interval",
        silent: true,
      },
    );
  }, [active, snapshot?.complete, uncertain, preferences.notifications]);
  const keyAction = useRef<(e: KeyboardEvent) => void>(() => {});
  keyAction.current = (e) => {
    if (
      !active ||
      dismissed ||
      busy ||
      pending ||
      uncertain ||
      active.recovery_required ||
      document.querySelector('[role="dialog"]') ||
      (e.target as HTMLElement).closest(
        "button,input,select,textarea,[contenteditable=true]",
      ) ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      e.repeat
    )
      return;
    if (e.code === "Space") {
      e.preventDefault();
      void action(active.status === "paused" ? "resume" : "pause");
    }
    if (e.key.toLowerCase() === "h") setHidden((v) => !v);
  };
  useEffect(() => {
    const run = (e: KeyboardEvent) => keyAction.current(e);
    window.addEventListener("keydown", run);
    return () => window.removeEventListener("keydown", run);
  }, []);
  const show =
    !dismissed && (!!active || !!summary || entered || pathname === "/focus");
  const visibleWorld = show || pathname === "/";
  const [visitedWorld, setVisitedWorld] = useState(visibleWorld);
  useEffect(() => {
    if (visibleWorld) setVisitedWorld(true);
  }, [visibleWorld]);
  function leaveRoom() {
    setEntered(false);
    setDismissed(true);
    setSummary(null);
    setRetreat(false);
    if (pathname === "/focus") window.history.pushState(null, "", "/");
  }
  useEffect(() => {
    if (!active || !show) {
      setIdle(false);
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 4200);
    };
    wake();
    for (const e of ["pointermove", "pointerdown", "keydown", "focusin"])
      window.addEventListener(e, wake);
    return () => {
      clearTimeout(t);
      for (const e of ["pointermove", "pointerdown", "keydown", "focusin"])
        window.removeEventListener(e, wake);
    };
  }, [active?.id, show]);
  return (
    <div
      className={
        show
          ? "cinema-host " +
            (retreat ? "retreat " : "") +
            (idle && !pending && !uncertain && !active?.recovery_required
              ? "controls-idle"
              : "")
          : visibleWorld
            ? "home-world-host"
            : "home-world-host parked"
      }
    >
      {(visibleWorld || visitedWorld) && (
        <RoomStage
          parked={!visibleWorld}
          mode={
            !show
              ? "home"
              : retreat
                ? "retreat"
                : summary
                  ? "complete"
                  : active
                    ? "focus"
                    : "enter"
          }
          onLeave={() => setRetreat(true)}
          paused={
            !!snapshot?.complete ||
            active?.status === "paused" ||
            !!pending ||
            uncertain ||
            !!active?.recovery_required
          }
          exit={leaveRoom}
        />
      )}
      {show && !active && !summary && (
        <div className="room-setup-hud">
          <span className="scene-rubric">
            PRIVATE SALON &nbsp; / &nbsp; SESSION SETUP
          </span>
          <EntryTitle />
          <FocusSetup />
        </div>
      )}
      {dismissed &&
        (active || summary) &&
        createPortal(
          <button className="return-cinema" onClick={() => setDismissed(false)}>
            {summary
              ? "Return to session summary"
              : `Return to your ${active?.status === "paused" ? "paused" : "running"} session`}{" "}
            ↗
          </button>,
          document.body,
        )}
      <AnimatePresence>
        {show && active && snapshot ? (
          <motion.div
            key="active"
            className="immersive active-atelier"
            data-paused={active.status === "paused"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="immersive-top">
              <span className="wordmark">
                sesh<span>.</span>
              </span>
              <div className="immersive-tools">
                {offline && (
                  <span className="offline-label">
                    <WifiOff size={14} /> Offline
                  </span>
                )}
                <button
                  aria-label={hidden ? "Show timer" : "Hide timer"}
                  onClick={() => setHidden(!hidden)}
                >
                  {hidden ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
                <button
                  aria-label={full ? "Exit fullscreen" : "Enter fullscreen"}
                  onClick={fullscreen}
                >
                  {full ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
                </button>
              </div>
            </div>
            <div className="immersive-center">
              <p className="eyebrow">
                {active.phase === "break"
                  ? "ROOM TO BREATHE"
                  : active.status === "paused"
                    ? "FOCUS / PAUSED"
                    : "FOCUS / IN SESSION"}
              </p>
              <div className="active-subject">
                <span
                  className="subject-dot"
                  style={{ background: active.subject_color }}
                />
                {active.subject_name}
                {active.topic_name && <span> / {active.topic_name}</span>}
              </div>
              <button
                className={`active-time ${hidden ? "time-hidden" : ""}`}
                disabled={
                  busy || !!pending || uncertain || active.recovery_required
                }
                aria-label={
                  active.status === "paused"
                    ? "Resume session timer"
                    : "Pause session timer"
                }
                onClick={() =>
                  action(active.status === "paused" ? "resume" : "pause")
                }
                aria-live="off"
              >
                {hidden ? (
                  <span>Be here.</span>
                ) : (
                  <ClockDigits
                    seconds={
                      active.mode === "stopwatch" && active.phase === "focus"
                        ? snapshot.elapsed
                        : snapshot.remaining
                    }
                  />
                )}
              </button>
              {active.mode !== "stopwatch" && (
                <div
                  className="timer-progress"
                  role="progressbar"
                  aria-label="Session progress"
                  aria-valuenow={Math.round(snapshot.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${snapshot.progress * 100}%` }} />
                </div>
              )}
              {pending ? (
                <div className="recovery-box">
                  <h3>
                    Your {pending.action === "finish" ? "finish" : "pause"} is
                    saved here.
                  </h3>
                  <p>
                    It happened at{" "}
                    {new Date(pending.occurred_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    . Sync when you reconnect to keep that stopping time.
                  </p>
                  <p>Should the time before that moment count as studying?</p>
                  <div>
                    <Button
                      variant="outline"
                      onClick={() => syncPending(false)}
                      disabled={busy}
                    >
                      Leave out the gap
                    </Button>
                    <Button onClick={() => syncPending(true)} disabled={busy}>
                      Count time &amp; sync
                    </Button>
                  </div>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => {
                      localStorage.removeItem(`sesh-pending-${active.id}`);
                      setPending(null);
                      setError("");
                      setUncertain(active.recovery_required);
                      void refresh();
                    }}
                  >
                    Cancel this saved request and use the latest session
                  </button>
                </div>
              ) : active.recovery_required || uncertain ? (
                <div className="recovery-box">
                  <h3>Welcome back. Were you studying?</h3>
                  <p>
                    There’s a gap since we last heard from your timer. Choose
                    whether that time belongs in this session.
                  </p>
                  <div>
                    <Button
                      disabled={busy || offline}
                      variant="outline"
                      onClick={() => action("recover", false)}
                    >
                      Leave out the gap
                    </Button>
                    <Button
                      disabled={busy || offline}
                      onClick={() => action("recover", true)}
                    >
                      Count that time
                    </Button>
                  </div>
                </div>
              ) : snapshot.complete ? (
                <div className="phase-complete">
                  <p>
                    {active.phase === "break"
                      ? "Ready when you are."
                      : "A little further than before."}
                  </p>
                  <div>
                    {active.mode === "pomodoro" && (
                      <Button
                        disabled={busy}
                        onClick={() => action("next-phase")}
                      >
                        {active.phase === "focus"
                          ? "Take a break"
                          : "Begin next focus"}
                        <ArrowRight size={17} />
                      </Button>
                    )}
                    <Button
                      variant={
                        active.mode === "pomodoro" ? "outline" : "default"
                      }
                      disabled={busy}
                      onClick={() => action("finish")}
                    >
                      <Check size={17} />
                      Finish session
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="focus-controls">
                  <Button
                    disabled={busy || !!pending}
                    variant="outline"
                    onClick={() =>
                      action(active.status === "paused" ? "resume" : "pause")
                    }
                  >
                    {active.status === "paused" ? (
                      <Play size={16} />
                    ) : (
                      <Pause size={16} />
                    )}{" "}
                    {active.status === "paused" ? "Resume" : "Pause"}
                  </Button>
                  <Button
                    disabled={busy || !!pending}
                    onClick={() => action("finish")}
                  >
                    <Square size={14} /> Finish
                  </Button>
                </div>
              )}
              {error && (
                <p role="alert" className="form-error focus-error">
                  {error}
                </p>
              )}
              <button
                className="discard-button"
                onClick={() => setDiscard(true)}
              >
                Discard session
              </button>
            </div>
            <p className="immersive-footer">
              {active.restored
                ? active.status === "paused"
                  ? "Your paused session has been restored. Paused time is not counted."
                  : "Your session has been restored from your last saved timer."
                : active.status === "paused"
                  ? "Paused time doesn’t count toward your study time."
                  : "SPACE · pause / resume     H · hide time     ESC · leave room"}
            </p>
            <Modal
              open={discard}
              onOpenChange={setDiscard}
              title="Let this session go?"
              description="This session won’t be added to your study history."
            >
              <div className="modal-actions">
                <Button variant="outline" onClick={() => setDiscard(false)}>
                  Keep studying
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy || offline}
                  onClick={() => action("discard")}
                >
                  Discard session
                </Button>
              </div>
            </Modal>
          </motion.div>
        ) : null}
        {summary && (
          <motion.div
            key="summary"
            className="session-summary immersive"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <span className="wordmark">
              sesh<span>.</span>
            </span>
            <div className="summary-inner">
              <div className="summary-symbol">
                <Check size={27} strokeWidth={1.4} />
              </div>
              <p className="eyebrow">SESSION RECEIPT</p>
              <h1>Session complete.</h1>
              <div className="summary-duration">
                {duration(summary.elapsed_seconds)}
              </div>
              <p className="summary-subject">
                <span
                  className="subject-dot"
                  style={{ background: summary.subject_color }}
                />
                {summary.subject_name}
                {summary.topic_name ? ` · ${summary.topic_name}` : ""}
              </p>
              <div className="summary-goal">
                <span>Today’s intention</span>
                <strong>
                  {duration(stats?.today_seconds ?? summary.elapsed_seconds)} /{" "}
                  {duration(preferences.daily_goal_minutes * 60)}
                </strong>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${Math.min(100, ((stats?.today_seconds ?? summary.elapsed_seconds) / (preferences.daily_goal_minutes * 60)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="summary-goal">
                <span>This week</span>
                <strong>
                  {duration(stats?.week_seconds ?? summary.elapsed_seconds)} /{" "}
                  {duration(preferences.weekly_goal_minutes * 60)}
                </strong>
                <div className="progress-track">
                  <span
                    style={{
                      width: Math.min(100, stats?.week_goal_percent || 0) + "%",
                    }}
                  />
                </div>
              </div>
              <details className="summary-note">
                <summary>Session note</summary>
                <label className="field">
                  Anything to remember?{" "}
                  <span className="optional">Optional</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="A small breakthrough, a thought for next time…"
                    maxLength={5000}
                    rows={3}
                  />
                </label>
              </details>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <Button disabled={busy} className="w-full" onClick={closeSummary}>
                {busy ? (
                  <Loader2 className="spin" size={17} />
                ) : (
                  "Back to your space"
                )}
                <ArrowRight size={17} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

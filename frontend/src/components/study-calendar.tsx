"use client";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Leaf,
  Pencil,
  Sparkle,
} from "lucide-react";
import { useSesh } from "@/lib/store";
import { api } from "@/lib/api";
import {
  useSystemStill,
  navigateTo,
  PageLink as Link,
} from "@/lib/navigation-motion";
import { dateKey, dayLabel, duration } from "@/lib/utils";
import {
  calendarDates,
  dayAdd,
  weekday,
  weekStart,
  monthStart,
  monthEnd,
  monthAdd,
} from "@/lib/calendar-dates";
import { BOTANICALS, BOTANICAL_SOURCE } from "@/lib/botanical";
import type { DayStat, StudySession, SubjectStat } from "@/lib/types";
import { SessionEditor } from "./reflection";
import { CalendarNote } from "./calendar-note";
import { CalendarJournal } from "./calendar-journal";
import { DailySessions } from "./calendar-folio";
import {
  earnedGoal,
  type FocusInterval,
  type DayWindow,
} from "@/lib/calendar-folio";
import "./study-calendar.css";

type Chapter = {
  month: string;
  days: DayStat[];
  seconds: number;
  days_studied: number;
  elapsed_days: number;
  eligible_days: number;
  consistency_percent: number;
  previous_seconds: number;
  change_percent: number | null;
  comparison_label: string;
  comparison_from: string;
  comparison_to: string;
  best_weekday: string | null;
  longest_day: DayStat | null;
  subjects: SubjectStat[];
  goal_seconds: number;
  goals_met: number;
  session_count: number;
};
type CalendarData = {
  days: DayStat[];
  sessions: StudySession[];
  chapter: Chapter;
  allocations: Record<string, Record<number, number>>;
  focus_intervals?: Record<string, FocusInterval[]>;
  day_windows?: Record<string, DayWindow>;
  streak?: { current: number; longest: number; as_of: string };
  daily_bounds?: Record<string, { first_focus: string; last_focus: string }>;
  accounting: Record<
    number,
    {
      focus_seconds: number;
      break_seconds: number;
      paused_seconds: number | null;
      wall_seconds: number | null;
    }
  >;
};
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const transition = { duration: 0.46, ease: [0.22, 0.68, 0.18, 1] as const };
function clock(iso: string, zone: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarPage() {
  const {
    user,
    preferences,
    sessions: storedSessions,
    subjects,
    openAuth,
  } = useSesh();
  const today = dateKey(new Date(), preferences.timezone);
  const systemStill = useSystemStill();
  const still = systemStill || preferences.reduced_motion;
  const [view, setView] = useState<"month" | "week" | "year">("month");
  const [selected, setSelected] = useState(today);
  const [revision, setRevision] = useState(0);
  const [remote, setRemote] = useState<{
    key: string;
    data: CalendarData;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<StudySession | "new" | null>(null);
  const archive = useRef<HTMLElement>(null);
  const [archiveRequest, setArchiveRequest] = useState<{
    date: string;
    serial: number;
    keyboard: boolean;
  } | null>(null);
  const archiveSerial = useRef(0);
  const previousDays = useRef(new Map<string, DayStat>());
  const achievementScope = useRef("");
  const [earned, setEarned] = useState<string[]>([]);
  const [cover, setCover] = useState<{ month: string; value: string }>({
    month: "",
    value: "",
  });
  const [mottoOpen, setMottoOpen] = useState(false);
  const [motto, setMotto] = useState("");
  const [mottoRefresh, setMottoRefresh] = useState(0);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef(false);
  const dateChosen = useRef(false);
  const month = monthStart(selected);
  const start =
    view === "year"
      ? selected.slice(0, 4) + "-01-01"
      : view === "week"
        ? weekStart(selected, preferences.week_start)
        : weekStart(month, preferences.week_start);
  const end =
    view === "year"
      ? selected.slice(0, 4) + "-12-31"
      : view === "week"
        ? dayAdd(start, 6)
        : dayAdd(start, 41);
  const key = `${user?.id}:${preferences.timezone}:${start}:${end}:${month}`;
  const data = remote?.key === key ? remote.data : null;
  const unavailable = !!user && !data;
  const chapter = data?.chapter;
  const monthNumber = Number(selected.slice(5, 7)) - 1;
  const botanical =
    cover.month === month && cover.value === "lily"
      ? ["lily", "Pink lily"]
      : BOTANICALS[monthNumber];
  const dates = useMemo(() => calendarDates(start, end), [start, end]);
  const dayMap = new Map((data?.days || []).map((day) => [day.date, day]));
  const day = dayMap.get(selected);
  const dailySessions = (data?.sessions || []).filter((session) =>
    day?.session_ids?.includes(session.id),
  );
  const weekdayNames = Array.from(
    { length: 7 },
    (_, i) => WEEKDAYS[(i + preferences.week_start) % 7],
  );
  useEffect(() => {
    if (!dateChosen.current) setSelected(today);
  }, [today]);
  useEffect(() => {
    let live = true;
    if (!user) {
      setRemote(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<CalendarData>(`/calendar/?from=${start}&to=${end}&month=${month}`, {
      signal: controller.signal,
    })
      .then((result) => {
        if (live) {
          const scope = `${user.id}:${preferences.timezone}`;
          if (achievementScope.current !== scope) {
            previousDays.current.clear();
            achievementScope.current = scope;
          }
          const newlyEarned = result.days
            .filter((row) =>
              earnedGoal(previousDays.current.get(row.date), row, today),
            )
            .map((row) => row.date);
          result.days.forEach((row) => previousDays.current.set(row.date, row));
          if (newlyEarned.length && !still) setEarned(newlyEarned);
          setRemote({ key, data: result });
        }
      })
      .catch((problem) => {
        if (live) setError(problem.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [
    key,
    revision,
    storedSessions,
    subjects,
    preferences,
    user?.id,
    start,
    end,
    month,
  ]);
  useEffect(() => {
    let live = true;
    setMotto("");
    if (user)
      api<{ text: string }>("/calendar/notes/?kind=motto&date=2000-01-01")
        .then((note) => {
          if (live) setMotto(note.text);
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id, mottoRefresh]);
  useEffect(() => {
    let live = true;
    setCover({ month: "", value: "" });
    if (user)
      api<{ cover: string }>(`/calendar/notes/?kind=monthly&date=${month}`)
        .then((note) => {
          if (live)
            setCover((current) =>
              current.month === month ? current : { month, value: note.cover },
            );
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [user?.id, month]);
  useEffect(() => {
    for (const offset of [-1, 1]) {
      const image = new Image();
      image.src = `/botanical/${BOTANICALS[(monthNumber + offset + 12) % 12][0]}.webp`;
    }
  }, [monthNumber]);
  useEffect(() => {
    if (pendingFocus.current) {
      buttons.current.get(selected)?.focus();
      pendingFocus.current = false;
    }
  }, [selected, view]);
  useEffect(() => {
    setEarned([]);
  }, [key, still]);
  function select(date: string) {
    if (date >= "1900-01-01" && date <= "2100-12-31") {
      dateChosen.current = true;
      setSelected(date);
    }
  }
  function chooseArchive(date: string, keyboard = false) {
    select(date);
    setArchiveRequest({ date, serial: ++archiveSerial.current, keyboard });
  }
  useLayoutEffect(() => {
    if (
      !archiveRequest ||
      archiveRequest.date !== selected ||
      (user && !data && !error)
    )
      return;
    const serial = archiveRequest.serial;
    let scrollFrame = 0;
    const frame = requestAnimationFrame(() => {
      if (serial !== archiveSerial.current) return;
      // Cancel the old native scroll, then measure after the browser has applied
      // the new folio and focus. Two paint frames, never a guessed time delay.
      window.scrollTo({ top: window.scrollY, behavior: "instant" });
      archive.current
        ?.querySelector<HTMLElement>("h2")
        ?.focus({ preventScroll: true });
      scrollFrame = requestAnimationFrame(() => {
        if (serial !== archiveSerial.current || !archive.current) return;
        const offset =
          parseFloat(getComputedStyle(archive.current).scrollMarginTop) || 0;
        window.scrollTo({
          top:
            window.scrollY +
            archive.current.getBoundingClientRect().top -
            offset,
          behavior: still ? "instant" : "smooth",
        });
        setArchiveRequest((current) =>
          current?.serial === serial ? null : current,
        );
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
    };
  }, [archiveRequest, selected, data, user, error, still]);
  function surfacePointer(event: React.PointerEvent<HTMLElement>) {
    if (still || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--pointer-x",
      `${((event.clientX - rect.left) / rect.width) * 100}%`,
    );
    event.currentTarget.style.setProperty(
      "--pointer-y",
      `${((event.clientY - rect.top) / rect.height) * 100}%`,
    );
  }
  function move(direction: number) {
    select(
      view === "year"
        ? `${Number(selected.slice(0, 4)) + direction}${selected.slice(4, 7)}-01`
        : view === "week"
          ? dayAdd(selected, direction * 7)
          : monthAdd(selected, direction),
    );
  }
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
      Home: -((weekday(date) - preferences.week_start + 7) % 7),
      End: 6 - ((weekday(date) - preferences.week_start + 7) % 7),
    };
    if (!(event.key in offsets)) return;
    event.preventDefault();
    pendingFocus.current = true;
    select(dayAdd(date, offsets[event.key]));
  }
  function tile(date: string) {
    const row = dayMap.get(date);
    const seconds = row?.seconds || 0;
    const intensity =
      seconds === 0
        ? 0
        : seconds < 1800
          ? 1
          : seconds < 7200
            ? 2
            : seconds < 14400
              ? 3
              : 4;
    return (
      <button
        key={date}
        ref={(node) => {
          if (node) buttons.current.set(date, node);
          else buttons.current.delete(date);
        }}
        className={`calendar-tile intensity-${intensity}`}
        data-date={date}
        data-outside={
          (view === "month" && date.slice(0, 7) !== month.slice(0, 7)) ||
          undefined
        }
        data-studied={seconds > 0 || undefined}
        data-achieved={row?.goal_achieved || undefined}
        data-earned={earned.includes(date) || undefined}
        onAnimationEnd={(event) => {
          if (event.animationName === "calendar-earned")
            setEarned((current) => current.filter((value) => value !== date));
        }}
        onPointerMove={seconds > 0 ? surfacePointer : undefined}
        data-future={date > today || undefined}
        data-today={date === today || undefined}
        aria-current={date === today ? "date" : undefined}
        aria-pressed={date === selected}
        tabIndex={date === selected ? 0 : -1}
        aria-label={`${dayLabel(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${duration(seconds)} focused${row?.goal_achieved ? ", goal achieved" : ""}${row?.is_rest_day ? ", planned rest day" : ""}${date > today ? ", future date" : ""}`}
        onClick={(event) => chooseArchive(date, event.detail === 0)}
        onKeyDown={(event) => keyboard(event, date)}
      >
        <span>{Number(date.slice(-2))}</span>
        <small>
          {seconds ? duration(seconds, true) : row?.is_rest_day ? "Rest" : ""}
        </small>
        <i>
          {row?.goal_achieved ? (
            <Sparkle size={13} />
          ) : row?.is_rest_day ? (
            <Leaf size={13} />
          ) : null}
        </i>
      </button>
    );
  }
  const periodDays = view === "week" ? data?.days || [] : chapter?.days || [];
  const periodSeconds =
    view === "week"
      ? periodDays.reduce((sum, row) => sum + row.seconds, 0)
      : chapter?.seconds || 0;
  const target =
    view === "year"
      ? 0
      : periodDays
          .filter((row) => !row.is_rest_day)
          .reduce((sum, row) => sum + row.goal_minutes * 60, 0);
  const progress = target ? Math.round((periodSeconds / target) * 100) : 0;
  const leading = chapter?.subjects[0];
  const journalText = [
    chapter?.days_studied
      ? `You returned to your studies on ${chapter.days_studied} ${chapter.days_studied === 1 ? "day" : "days"} this month, recording ${duration(chapter.seconds)} of focus. Each date keeps its own record.`
      : "A new chapter has room for both study and rest. Your recorded sessions will find their place here.",
    chapter?.best_weekday
      ? `${chapter.best_weekday} held the most focused time this month. ${leading ? `${leading.name} received ${duration(leading.seconds)} of your attention.` : ""}`
      : "Patterns will emerge as your study archive grows.",
    chapter?.goals_met
      ? `You reached your daily goal on ${chapter.goals_met} eligible ${chapter.goals_met === 1 ? "day" : "days"}. A small record worth keeping.`
      : chapter?.longest_day
        ? `Your fullest study day was ${dayLabel(chapter.longest_day.date)}: ${duration(chapter.longest_day.seconds)} of focused time.`
        : "There is space here for your next small victory.",
  ];
  return (
    <div className="study-calendar">
      <div className="calendar-editorial-stats" aria-live="polite">
        <p>
          {chapter
            ? `${chapter.days_studied} days showed up.`
            : user
              ? "Your study archive"
              : "Every story begins somewhere."}
          <small>
            {chapter
              ? `Of ${chapter.elapsed_days} elapsed days this month.`
              : "Time, kept with care."}
          </small>
        </p>
        <p>
          {chapter?.change_percent != null
            ? `${Math.abs(chapter.change_percent)}% ${chapter.change_percent < 0 ? "less" : "more"} focused time`
            : "A chapter of your own."}
          <small
            title={
              chapter
                ? `${chapter.comparison_from} to ${chapter.comparison_to}`
                : undefined
            }
          >
            {chapter?.change_percent != null
              ? `Than ${chapter.comparison_label}.`
              : "No previous study time to compare."}
          </small>
        </p>
        <p>
          {chapter?.best_weekday
            ? `Most focus on ${chapter.best_weekday}s.`
            : "Your rhythm is taking shape."}
          <small>
            {chapter?.longest_day
              ? `Fullest day · ${dayLabel(chapter.longest_day.date)}`
              : "One date at a time."}
          </small>
        </p>
      </div>
      <div className="calendar-cover-stage">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.section
            className="calendar-cover"
            key={month}
            initial={{ opacity: still ? 1 : 0.5 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={still ? { duration: 0 } : transition}
            aria-label={`${dayLabel(month, { month: "long", year: "numeric" })} editorial cover`}
          >
            <div className="calendar-month-line">
              <span>{selected.slice(0, 4)}</span>
              <h1
                style={
                  {
                    "--month-length": dayLabel(month, { month: "long" }).length,
                  } as CSSProperties
                }
              >
                {dayLabel(month, { month: "long" })}
              </h1>
            </div>
            <div className="calendar-cover-bottom">
              <div className="calendar-caption">
                <p>
                  {motto ||
                    "A little time, gathered day by day. This is a place to remember it."}
                </p>
                <button
                  aria-label="Edit personal motto"
                  onClick={() => setMottoOpen((value) => !value)}
                >
                  <Pencil size={13} />
                </button>
              </div>
              <details className="calendar-botanical">
                <summary aria-label={`About ${botanical[1]}`}>
                  <motion.img
                    key={botanical[0]}
                    src={`/botanical/${botanical[0]}.webp`}
                    alt={`Watercolor botanical illustration of ${botanical[1].toLowerCase()}`}
                    width={640}
                    height={640}
                    initial={{ opacity: still ? 1 : 0, y: still ? 0 : 7 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={still ? { duration: 0 } : transition}
                  />
                </summary>
                <div>
                  <strong>{botanical[1]}</strong>
                  <p>
                    {botanical[0] === "lily"
                      ? "An editorial cover variation."
                      : "An editorial selection from traditional monthly flower associations."}
                  </p>
                  <a href={BOTANICAL_SOURCE} target="_blank" rel="noreferrer">
                    About the tradition ↗
                  </a>
                </div>
              </details>
              <motion.span
                className="calendar-featured-date"
                key={selected}
                initial={{ opacity: still ? 1 : 0.3 }}
                animate={{ opacity: 1 }}
                transition={{ duration: still ? 0 : 0.25 }}
              >
                {Number(selected.slice(-2))}
              </motion.span>
            </div>
          </motion.section>
        </AnimatePresence>
      </div>
      {mottoOpen && (
        <div className="calendar-motto-editor">
          <CalendarNote
            key={`motto-${user?.id}`}
            kind="motto"
            date="2000-01-01"
            label="Your personal motto"
            placeholder="A few words to keep close."
          />
          <button
            onClick={() => {
              setMottoOpen(false);
              setMottoRefresh((value) => value + 1);
            }}
          >
            Done
          </button>
        </div>
      )}
      <div className="calendar-workspace" aria-busy={loading || unavailable}>
        <div className="calendar-main">
          <div className="calendar-heading">
            <div>
              <h2>Your Study Calendar</h2>
              <p>Choose a date to open its study archive.</p>
            </div>
            <button
              className="calendar-text-link"
              onClick={() => navigateTo("/focus")}
            >
              Begin focus ↗
            </button>
          </div>
          <div className="calendar-toolbar">
            <div>
              <button aria-label={`Previous ${view}`} onClick={() => move(-1)}>
                <ChevronLeft size={18} />
              </button>
              <span>
                {view === "year"
                  ? selected.slice(0, 4)
                  : view === "week"
                    ? `${dayLabel(start)} – ${dayLabel(end)}`
                    : dayLabel(month, { month: "long", year: "numeric" })}
              </span>
              <button aria-label={`Next ${view}`} onClick={() => move(1)}>
                <ChevronRight size={18} />
              </button>
              <button onClick={() => select(today)}>Today</button>
            </div>
            <div className="calendar-view-tabs">
              {(["week", "month", "year"] as const).map((value) => (
                <button
                  key={value}
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <label className="calendar-date-jump">
              <span className="sr-only">Go to date</span>
              <input
                aria-label="Go to date"
                type="date"
                min="1900-01-01"
                max="2100-12-31"
                value={selected}
                onChange={(event) => {
                  if (event.target.value) select(event.target.value);
                }}
              />
            </label>
          </div>
          {error && (
            <p role="alert">
              {error}{" "}
              <button onClick={() => setRevision((value) => value + 1)}>
                Try again
              </button>
            </p>
          )}
          <div className="calendar-load-status" role="status">
            {loading ? "Opening your study archive…" : ""}
          </div>
          {view === "year" ? (
            <div className="calendar-year">
              {BOTANICALS.map((flower, i) => {
                const monthKey = `${selected.slice(0, 4)}-${String(i + 1).padStart(2, "0")}-01`;
                const rows = (data?.days || []).filter(
                  (row) => row.date.slice(0, 7) === monthKey.slice(0, 7),
                );
                return (
                  <button
                    key={flower[0]}
                    onClick={() => {
                      select(monthKey);
                      setView("month");
                    }}
                  >
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <h3>{dayLabel(monthKey, { month: "long" })}</h3>
                    <small>
                      {duration(
                        rows.reduce((sum, row) => sum + row.seconds, 0),
                      )}{" "}
                      · {rows.filter((row) => row.seconds > 0).length} study
                      days
                    </small>
                    <div>
                      {rows.map((row) => (
                        <i
                          key={row.date}
                          data-active={row.seconds > 0 || undefined}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="calendar-weekdays">
                {weekdayNames.map((name) => (
                  <span key={name}>{name.slice(0, 3)}</span>
                ))}
              </div>
              <div
                className={`calendar-tile-grid calendar-${view}`}
                role="group"
                aria-label={`${view} study dates`}
              >
                {dates.map(tile)}
              </div>
            </>
          )}
          <div className="calendar-legend">
            <span>Focus intensity</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <i key={level} className={`intensity-${level}`} />
            ))}
            <span>0 · &lt;30m · &lt;2h · &lt;4h · 4h+</span>
            <span>
              <Check size={12} /> Goal met
            </span>
            <span>
              <Leaf size={12} /> Rest day
            </span>
          </div>
          <CalendarJournal
            month={month}
            still={still}
            pages={[
              ...["The Reflection", "The Discovery", "The Small Victory"].map(
                (title, i) => (
                  <div key={title}>
                    <h3>
                      Your Monthly Journal {String(i + 1).padStart(2, "0")}
                    </h3>
                    <p>
                      {unavailable
                        ? "Your monthly reflections will appear when the archive is available."
                        : journalText[i]}
                    </p>
                    <span className="journal-page-index">
                      {title} /{" "}
                      {dayLabel(month, { month: "long", year: "numeric" })}
                    </span>
                  </div>
                ),
              ),
              <div key="note">
                <span className="journal-page-index">
                  04 / THE MONTHLY JOURNAL
                </span>
                <h3>A Note to My Future Self</h3>
                <CalendarNote
                  key={`${month}-${user?.id}`}
                  kind="monthly"
                  date={month}
                  label="Your monthly note"
                  placeholder="Something for your future self…"
                  coverChoice
                  onCover={(value) => setCover({ month, value })}
                />
              </div>,
            ]}
          />
        </div>
        <aside className="calendar-sidebar">
          <section
            className="calendar-consistency"
            onPointerMove={surfacePointer}
          >
            <div>
              <strong>
                {chapter ? Math.round(chapter.consistency_percent) : "—"}
                {chapter && <small>%</small>}
              </strong>
              <span>
                Study-day
                <br />
                consistency
              </span>
            </div>
            <div className="calendar-dots">
              {(
                chapter?.days ||
                calendarDates(month, monthEnd(month)).map((date) => ({
                  date,
                  seconds: 0,
                  is_rest_day: false,
                }))
              ).map((row, index) => (
                <button
                  key={row.date}
                  data-active={row.seconds > 0 || undefined}
                  data-rest={row.is_rest_day || undefined}
                  style={{ "--dot-delay": `${index * 12}ms` } as CSSProperties}
                  data-future={row.date > today || undefined}
                  aria-label={`${dayLabel(row.date)}, ${duration(row.seconds)}${row.is_rest_day ? ", planned rest" : ""}`}
                  onClick={(event) =>
                    chooseArchive(row.date, event.detail === 0)
                  }
                >
                  <span className="calendar-dot-tooltip" role="tooltip">
                    {dayLabel(row.date)} · {duration(row.seconds)}
                    <br />
                    {row.is_rest_day
                      ? "Planned rest"
                      : row.seconds
                        ? "Recorded focus"
                        : row.date > today
                          ? "Future date"
                          : "No recorded focus"}
                  </span>
                </button>
              ))}
            </div>
            <p>
              Non-rest days with focus ÷ elapsed non-rest days. Future days are
              excluded.
            </p>
            <Link href="/settings">Rest-day settings ↗</Link>
          </section>
          <div className="calendar-side-lower">
            <section
              className="calendar-goal"
              key={`${view}-${start}`}
              tabIndex={0}
              aria-label={`${view === "week" ? "Weekly" : "Monthly"} goal progress`}
            >
              <h3>{view === "week" ? "Weekly" : "Monthly"} Goal</h3>
              {view !== "year" && target > 0 ? (
                <>
                  <div
                    className="calendar-segments"
                    role="meter"
                    aria-label="Selected period daily-goal total"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(100, progress)}
                  >
                    {Array.from({ length: 20 }, (_, i) => (
                      <i
                        key={i}
                        style={
                          {
                            "--segment-tone": `${28 + Math.min(1, (19 - i) / Math.max(1, progress / 5)) * 27}%`,
                            "--segment-fill": `${Math.max(0, Math.min(1, progress / 5 - (19 - i))) * 100}%`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <strong>{progress}%</strong>
                  <p>
                    {duration(periodSeconds)} of {duration(target)}
                  </p>
                  <small>
                    Sum of daily goals on non-rest days in this {view}.
                  </small>
                </>
              ) : (
                <p>
                  {unavailable
                    ? "Your intention will appear with your study data."
                    : view === "year"
                      ? "Choose a month to view its intention."
                      : "Set a daily intention to give this period a target."}
                  <br />
                  <Link href="/settings">Goal settings ↗</Link>
                </p>
              )}
            </section>
            <section
              className="calendar-streak"
              tabIndex={0}
              aria-label={
                data?.streak
                  ? `Current streak: ${data.streak.current} study days, as of ${dayLabel(data.streak.as_of)}`
                  : "Current study streak"
              }
            >
              <span className="calendar-streak-label">CURRENT STREAK</span>
              <strong
                style={
                  {
                    "--streak-size":
                      (data?.streak?.current ?? 0) >= 100 ? "60cqw" : "90cqw",
                  } as CSSProperties
                }
              >
                {data?.streak?.current ?? "—"}
              </strong>
              <span className="calendar-streak-caption">Days in a row</span>
              <img
                src="/calendar/streak-mountain.jpg"
                alt="Monochrome engraved mountain peaks"
                width={736}
                height={1313}
                loading="lazy"
              />
              <p>
                Your Streak
                <span>
                  {data?.streak
                    ? `As of ${dayLabel(data.streak.as_of, { month: "short", day: "numeric", year: "numeric" })}`
                    : "Your present rhythm"}
                </span>
              </p>
              <small>Planned rest days preserve your streak.</small>
            </section>
            <section className="calendar-glance">
              <h3>At a glance</h3>
              {leading ? (
                <>
                  <small>Most-studied subject this month</small>
                  <strong>{leading.name}</strong>
                  <span>{duration(leading.seconds)}</span>
                </>
              ) : (
                <p>A place for your next chapter.</p>
              )}
              <small>{preferences.timezone}</small>
            </section>
          </div>
        </aside>
      </div>
      <motion.section
        className="calendar-daily"
        ref={archive}
        id="daily-archive"
        aria-label="Daily study archive"
        data-date={selected}
        initial={{ opacity: still ? 1 : 0.6, y: still ? 0 : 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: still ? 0 : 0.28 }}
      >
        <motion.header
          key={`archive-heading-${selected}`}
          initial={{ opacity: still ? 1 : 0.55 }}
          animate={{ opacity: 1 }}
          transition={{ duration: still ? 0 : 0.28 }}
        >
          <div>
            <span className="calendar-kicker">
              THE DAILY ARCHIVE / {selected.slice(0, 7)} ·{" "}
              {String(Number(selected.slice(-2))).padStart(3, "0")}
            </span>
            <h2
              tabIndex={-1}
              aria-label={dayLabel(selected, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            >
              <span>{dayLabel(selected, { weekday: "long" })},</span>
              {dayLabel(selected, { month: "long", day: "numeric" })}
            </h2>
          </div>
          <div>
            <strong className="folio-total">
              {unavailable ? "—" : duration(day?.seconds || 0, true)}
            </strong>
            <p>
              {unavailable ? "—" : day?.session_count || 0}{" "}
              {day?.session_count === 1 ? "session" : "sessions"} ·{" "}
              {day?.is_rest_day
                ? "Planned rest day"
                : day?.goal_achieved
                  ? "Daily goal reached"
                  : day?.goal_minutes
                    ? `${Math.round(((day.seconds || 0) / (day.goal_minutes * 60)) * 100)}% of ${duration(day.goal_minutes * 60)} daily goal`
                    : "No daily target"}
            </p>
          </div>
        </motion.header>
        <p className="calendar-accounting-note">
          {data?.daily_bounds?.[selected] && (
            <span className="calendar-focus-window">
              First focus{" "}
              {clock(
                data.daily_bounds[selected].first_focus,
                preferences.timezone,
              )}{" "}
              · Last focus{" "}
              {clock(
                data.daily_bounds[selected].last_focus,
                preferences.timezone,
              )}
            </span>
          )}
          Focus is allocated to each date in {preferences.timezone}. Breaks and
          paused time are excluded. Session details show full-session totals.
        </p>
        {dailySessions.length ? (
          <DailySessions
            key={selected}
            date={selected}
            items={dailySessions.map((session) => ({
              session,
              allocated: data?.allocations?.[selected]?.[session.id] || 0,
              accounting: data?.accounting?.[session.id],
            }))}
            intervals={data?.focus_intervals?.[selected] || []}
            dayWindow={data?.day_windows?.[selected]}
            zone={preferences.timezone}
            still={still}
            onEdit={setEditing}
          />
        ) : (
          <p className="calendar-empty">
            {unavailable
              ? "Your daily archive is not available yet."
              : selected > today
                ? "A little space for what’s ahead."
                : day?.is_rest_day
                  ? "A planned pause in your study rhythm."
                  : "No sessions recorded for this day."}{" "}
            {!user && (
              <button onClick={openAuth}>Sign in to see your archive</button>
            )}
          </p>
        )}
        {day?.goal_achieved && (
          <p className="calendar-daily-insight">You reached your daily goal.</p>
        )}
        <div className="folio-reflection">
          <span className="calendar-kicker">A NOTE FOR TODAY</span>
          <h3>What stayed with you?</h3>
          <CalendarNote
            key={`${selected}-${user?.id}`}
            kind="daily"
            date={selected}
            label={`Reflection for ${dayLabel(selected)}`}
            placeholder="A little something to remember about today…"
          />
        </div>
      </motion.section>
      <SessionEditor
        session={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setRevision((value) => value + 1)}
      />
    </div>
  );
}

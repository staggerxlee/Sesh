"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Edit3,
  Leaf,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useSesh } from "@/lib/store";
import { useSystemStill } from "@/lib/navigation-motion";
import { api, signOut as endLogin } from "@/lib/api";
import { dateKey, dayLabel, duration } from "@/lib/utils";
import type {
  Analytics,
  DayStat,
  Preferences,
  StudySession,
  Subject,
  Topic,
  WeeklyReview,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import "./reflection.css";
import { motion } from "motion/react";

const COLORS = [
  "#748367",
  "#af9478",
  "#8b9da8",
  "#b18d98",
  "#aea56f",
  "#8b86a1",
  "#b78870",
  "#697f7c",
];
const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
const err = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
function Header({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="r-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="r-subtitle">{description}</p>
      </div>
      {action && <div className="r-header-action">{action}</div>}
    </header>
  );
}
function Empty({
  icon = <BookOpen size={28} strokeWidth={1.3} />,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="r-empty">
      <span className="r-empty-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p className="r-error" role="alert">
      {message}
    </p>
  ) : null;
}
function RemoteError({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="r-remote-error">
      <ErrorNote message={error} />
      <Button variant="outline" onClick={retry}>
        <RotateCcw size={14} /> Try again
      </Button>
    </div>
  );
}
function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="r-meter"
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.min(100, Math.round(value) || 0)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="r-stat">
      <span>{label}</span>
      <motion.strong
        initial={{ y: 6 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.28 }}
      >
        {value}
      </motion.strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}
function useRemote<T>(path: string) {
  const { user, sessions, subjects, preferences } = useSesh();
  const [data, setData] = useState<T | null>(null),
    [loading, setLoading] = useState(!!user),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    if (!user) {
      setData(null);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    api<T>(path)
      .then((value) => {
        if (live) setData(value);
      })
      .catch((e) => {
        if (live) {
          setError(err(e));
          setData(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, user?.id, sessions, subjects, preferences, revision]);
  return { data, loading, error, retry: () => setRevision((x) => x + 1) };
}
function Loading() {
  return (
    <div className="r-loading" role="status">
      <span /> Gathering your study time…
    </div>
  );
}
function dayAdd(key: string, days: number) {
  const date = new Date(key + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function weekday(key: string) {
  return (new Date(key + "T12:00:00Z").getUTCDay() + 6) % 7;
}
function weekStart(key: string, start: number) {
  return dayAdd(key, -((weekday(key) - start + 7) % 7));
}
function monthStart(key: string) {
  return key.slice(0, 7) + "-01";
}
function monthEnd(key: string) {
  const date = new Date(key + "T12:00:00Z");
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12),
  )
    .toISOString()
    .slice(0, 10);
}
function monthAdd(key: string, n: number) {
  const date = new Date(key + "T12:00:00Z");
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1, 12),
  )
    .toISOString()
    .slice(0, 10);
}
function inputDateTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T");
}
function localToUtc(value: string, timeZone: string) {
  const nominal = Date.parse(value + "Z");
  if (!Number.isFinite(nominal))
    throw new Error("Choose a valid date and time.");
  let result = nominal;
  for (let i = 0; i < 4; i++) {
    const rendered = inputDateTime(new Date(result), timeZone);
    const offset = Date.parse(rendered + "Z") - nominal;
    if (!offset) break;
    result -= offset;
  }
  if (inputDateTime(new Date(result), timeZone) !== value)
    throw new Error(
      "This local time does not exist because the clocks change. Choose another time.",
    );
  return new Date(result).toISOString();
}
function timeLabel(iso: string, timeZone: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });
}
function SubjectDot({ color }: { color: string }) {
  return <span className="r-subject-dot" style={{ background: color }} />;
}

export function SubjectsPage() {
  const { user, subjects, topics, stats, refresh, notify, openAuth } =
    useSesh();
  const [archived, setArchived] = useState(false),
    [editing, setEditing] = useState<Subject | "new" | null>(null),
    [name, setName] = useState(""),
    [color, setColor] = useState(COLORS[0]),
    [goal, setGoal] = useState(""),
    [icon, setIcon] = useState("book"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState<Subject | null>(null),
    [confirmation, setConfirmation] = useState("");
  const [topicSubject, setTopicSubject] = useState<Subject | null>(null),
    [topicEdit, setTopicEdit] = useState<Topic | null>(null),
    [topicName, setTopicName] = useState(""),
    [topicDelete, setTopicDelete] = useState<Topic | null>(null);
  const visible = subjects.filter((s) => s.archived === archived);
  function edit(subject: Subject | "new") {
    if (!user) {
      openAuth();
      return;
    }
    setEditing(subject);
    setName(subject === "new" ? "" : subject.name);
    setColor(subject === "new" ? COLORS[0] : subject.color);
    setGoal(subject === "new" ? "" : String(subject.weekly_goal_minutes || ""));
    setIcon(subject === "new" ? "book" : subject.icon || "book");
    setError("");
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Give your subject a name.");
      return;
    }
    const target = Number(goal) || 0;
    if (target < 0 || target > 10080) {
      setError("Choose a weekly target between 0 and 10,080 minutes.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(
        editing === "new"
          ? "/subjects/"
          : `/subjects/${(editing as Subject).id}/`,
        {
          method: editing === "new" ? "POST" : "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            color,
            icon,
            weekly_goal_minutes: target,
          }),
        },
      );
      await refresh();
      setEditing(null);
      notify(editing === "new" ? "Your subject is ready." : "Subject updated.");
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  async function archive(subject: Subject) {
    setSaving(true);
    try {
      await api(`/subjects/${subject.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ archived: !subject.archived }),
      });
      await refresh();
      notify(
        subject.archived
          ? "Subject restored."
          : "Subject archived. Your study history is preserved.",
      );
    } catch (e) {
      notify(err(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!deleting || confirmation !== deleting.name) return;
    setSaving(true);
    setError("");
    try {
      await api(`/subjects/${deleting.id}/`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: true }),
      });
      await refresh();
      setDeleting(null);
      notify("Subject deleted.");
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  async function saveTopic(e: FormEvent) {
    e.preventDefault();
    if (!topicSubject || !topicName.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api(topicEdit ? `/topics/${topicEdit.id}/` : "/topics/", {
        method: topicEdit ? "PATCH" : "POST",
        body: JSON.stringify({
          subject: topicSubject.id,
          name: topicName.trim(),
        }),
      });
      await refresh();
      setTopicName("");
      setTopicEdit(null);
      notify("Topic saved.");
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  async function removeTopic() {
    if (!topicDelete) return;
    setSaving(true);
    setError("");
    try {
      await api(`/topics/${topicDelete.id}/`, { method: "DELETE" });
      await refresh();
      setTopicDelete(null);
      notify("Topic deleted.");
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="reflection">
      <Header
        eyebrow="A little structure"
        title="Room for every curiosity."
        description="Give your focus a home. Keep it as simple as you like."
        action={
          <Button onClick={() => edit("new")}>
            <Plus size={16} /> New subject
          </Button>
        }
      />
      <div className="r-toolbar">
        <div className="r-segmented" aria-label="Subject status">
          <button aria-pressed={!archived} onClick={() => setArchived(false)}>
            Your subjects{" "}
            <span>{subjects.filter((s) => !s.archived).length}</span>
          </button>
          <button aria-pressed={archived} onClick={() => setArchived(true)}>
            Archived <span>{subjects.filter((s) => s.archived).length}</span>
          </button>
        </div>
        <span className="r-meta">A subject is all you need to begin.</span>
      </div>
      {!visible.length ? (
        <Empty
          title={
            archived ? "A place for past chapters." : "What are you learning?"
          }
        >
          {archived
            ? "Archived subjects will stay here, with all your history intact."
            : "Add your first subject, then settle into a session. You can add topics whenever you need them."}
          {!archived && (
            <Button onClick={() => edit("new")}>
              <Plus size={15} /> Add your first subject
            </Button>
          )}
        </Empty>
      ) : (
        <div className="r-subject-grid">
          {visible.map((subject) => {
            const totals = stats?.subjects.find((s) => s.id === subject.id);
            const progress = subject.weekly_goal_minutes
              ? ((totals?.weekly_seconds || 0) /
                  (subject.weekly_goal_minutes * 60)) *
                100
              : 0;
            return (
              <article className="r-subject-card" key={subject.id}>
                <div className="r-subject-card-top">
                  <span
                    className="r-book-icon"
                    style={{
                      background: subject.color + "16",
                      color: subject.color,
                    }}
                  >
                    <BookOpen size={23} strokeWidth={1.4} />
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${subject.name}`}
                    onClick={() => edit(subject)}
                  >
                    <MoreHorizontal size={19} />
                  </Button>
                </div>
                <h2>{subject.name}</h2>
                <p className="r-meta">
                  {topics.filter((t) => t.subject === subject.id).length} topics
                  · {duration(totals?.seconds || 0)} in selected period
                </p>
                <div className="r-subject-week">
                  <span>This week</span>
                  <strong>{duration(totals?.weekly_seconds || 0)}</strong>
                </div>
                {subject.weekly_goal_minutes > 0 ? (
                  <>
                    <Meter
                      value={progress}
                      label={`${subject.name} weekly goal`}
                    />
                    <p className="r-meta r-goal-caption">
                      of {duration(subject.weekly_goal_minutes * 60)} weekly
                      goal
                    </p>
                  </>
                ) : (
                  <p className="r-meta r-no-goal">
                    No weekly target. Your pace, your choice.
                  </p>
                )}
                <div className="r-card-actions">
                  <button
                    onClick={() => {
                      setTopicSubject(subject);
                      setTopicName("");
                      setTopicEdit(null);
                      setError("");
                    }}
                  >
                    Manage topics <ArrowUpRight size={14} />
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => archive(subject)}
                    aria-label={`${subject.archived ? "Restore" : "Archive"} ${subject.name}`}
                  >
                    {subject.archived ? (
                      <RotateCcw size={15} />
                    ) : (
                      <Archive size={15} />
                    )}
                  </button>
                  <button
                    aria-label={`Delete ${subject.name}`}
                    onClick={() => {
                      setDeleting(subject);
                      setConfirmation("");
                      setError("");
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Modal
        open={!!editing}
        onOpenChange={(v) => {
          if (!v && !saving) setEditing(null);
        }}
        title={editing === "new" ? "A new subject." : "Make it your own."}
        description="A name, a color, and a little room to grow."
      >
        <form onSubmit={save} className="r-form">
          <label className="field">
            Subject name
            <input
              className="input"
              autoFocus
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Organic chemistry"
              required
            />
          </label>
          <fieldset className="r-color-field">
            <legend>Subject color</legend>
            <div>
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ background: c }}
                  className="r-color-option"
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  onClick={() => setColor(c)}
                >
                  {color === c && <Check size={16} />}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="field">
            Weekly target <span className="r-meta">Optional, in minutes</span>
            <input
              className="input"
              type="number"
              min={0}
              max={10080}
              step={5}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="No target"
            />
          </label>
          <ErrorNote message={error} />
          <div className="r-form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save subject"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !saving) setDeleting(null);
        }}
        title="Delete this subject?"
        description="Only subjects without study sessions can be deleted. Archive a subject to preserve its history."
      >
        <form className="r-form" onSubmit={remove}>
          <label className="field">
            Type “{deleting?.name}” to confirm
            <input
              className="input"
              autoComplete="off"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <ErrorNote message={error} />
          <div className="r-form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(null)}
            >
              Keep subject
            </Button>
            <Button
              variant="destructive"
              disabled={saving || confirmation !== deleting?.name}
            >
              {saving ? "Deleting…" : "Delete subject"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={!!topicSubject}
        onOpenChange={(v) => {
          if (!v && !saving) {
            setTopicSubject(null);
            setTopicDelete(null);
          }
        }}
        title={`Inside ${topicSubject?.name || "your subject"}.`}
        description="Topics are optional. Add one when a little more detail feels useful."
      >
        <div className="r-topic-list">
          {topics
            .filter((t) => t.subject === topicSubject?.id)
            .map((topic) => (
              <div key={topic.id}>
                <span>{topic.name}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Rename ${topic.name}`}
                  onClick={() => {
                    setTopicEdit(topic);
                    setTopicName(topic.name);
                    setTopicDelete(null);
                    setError("");
                  }}
                >
                  <Edit3 size={14} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${topic.name}`}
                  onClick={() => {
                    setTopicDelete(topic);
                    setError("");
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
        </div>
        {topicDelete ? (
          <div className="r-inline-confirm">
            <p>
              Delete “{topicDelete.name}”? Topics used in a session are
              protected.
            </p>
            <ErrorNote message={error} />
            <div className="r-form-actions">
              <Button variant="ghost" onClick={() => setTopicDelete(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={removeTopic}
                disabled={saving}
              >
                {saving ? "Deleting…" : "Delete topic"}
              </Button>
            </div>
          </div>
        ) : (
          <form className="r-form" onSubmit={saveTopic}>
            <label className="field">
              {topicEdit ? "Rename topic" : "New topic"}
              <input
                className="input"
                maxLength={100}
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                placeholder="e.g. Reaction mechanisms"
                required
              />
            </label>
            <ErrorNote message={error} />
            <div className="r-form-actions">
              {topicEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setTopicEdit(null);
                    setTopicName("");
                  }}
                >
                  Cancel edit
                </Button>
              )}
              <Button disabled={saving || !topicName.trim()}>
                {saving ? "Saving…" : topicEdit ? "Save topic" : "Add topic"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function SessionEditor({
  session,
  onClose,
  onSaved,
}: {
  session: StudySession | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { subjects, topics, preferences, refresh, notify } = useSesh();
  const zone = preferences.timezone;
  const [subject, setSubject] = useState(""),
    [topic, setTopic] = useState(""),
    [started, setStarted] = useState(""),
    [minutes, setMinutes] = useState(""),
    [note, setNote] = useState(""),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!session) return;
    setSubject(
      session === "new"
        ? String(subjects.find((s) => !s.archived)?.id || "")
        : String(session.subject),
    );
    setTopic(session === "new" ? "" : String(session.topic || ""));
    setStarted(
      inputDateTime(
        session === "new"
          ? new Date(Date.now() - 30 * 60000)
          : new Date(session.started_at),
        zone,
      ),
    );
    setMinutes(
      session === "new"
        ? "30"
        : String(Math.round((session.elapsed_seconds / 60) * 100) / 100),
    );
    setNote(session === "new" ? "" : session.note);
    setError("");
    setConfirmDelete(false);
  }, [session, zone]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    const value = Number(minutes);
    if (!subject) {
      setError("Choose a subject for this session.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0 || value > 1440) {
      setError(
        "Enter a duration greater than 0 and no more than 1,440 minutes.",
      );
      return;
    }
    setSaving(true);
    try {
      const started_at = localToUtc(started, zone);
      if (Date.parse(started_at) + value * 60000 > Date.now() + 1000)
        throw new Error("A completed session cannot end in the future.");
      const payload: Record<string, unknown> = {
        subject: Number(subject),
        topic: topic ? Number(topic) : null,
        note: note.trim(),
      };
      if (
        session === "new" ||
        (session &&
          started !== inputDateTime(new Date(session.started_at), zone))
      )
        payload.started_at = started_at;
      if (
        session === "new" ||
        (session &&
          minutes !==
            String(Math.round((session.elapsed_seconds / 60) * 100) / 100))
      )
        payload.duration_seconds = Math.round(value * 60);
      await api(
        session === "new"
          ? "/sessions/"
          : `/sessions/${(session as StudySession).id}/`,
        {
          method: session === "new" ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        },
      );
      await refresh();
      onSaved();
      onClose();
      notify(
        session === "new"
          ? "Study time added."
          : "Session updated. All your totals are in sync.",
      );
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!session || session === "new") return;
    setSaving(true);
    setError("");
    try {
      await api(`/sessions/${session.id}/`, { method: "DELETE" });
      await refresh();
      onSaved();
      onClose();
      notify("Session deleted. Your totals have been updated.");
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open={!!session}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
      title={
        session === "new"
          ? "Every bit of focus counts."
          : "Your session, in detail."
      }
      description={
        session === "new"
          ? "Add study time you recorded elsewhere."
          : `${session?.source === "manual" ? "Manually added" : "Recorded with the timer"} · ${session ? duration(session.elapsed_seconds) : ""}`
      }
    >
      <form className="r-form" onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Subject
            <select
              className="select"
              required
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setTopic("");
              }}
            >
              <option value="">Choose a subject</option>
              {subjects
                .filter((s) => !s.archived || String(s.id) === subject)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.archived ? " (archived)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Topic <span className="r-meta">Optional</span>
            <select
              className="select"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            >
              <option value="">No topic</option>
              {topics
                .filter((t) => String(t.subject) === subject)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="field">
          Started at <span className="r-meta">{zone}</span>
          <input
            className="input"
            type="datetime-local"
            value={started}
            onChange={(e) => setStarted(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Focused time <span className="r-meta">Minutes, excluding breaks</span>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            max="1440"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            required
          />
        </label>
        <label className="field">
          Session note <span className="r-meta">Optional</span>
          <textarea
            className="input r-textarea"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you work on?"
            rows={3}
          />
        </label>
        <ErrorNote message={error} />
        {confirmDelete ? (
          <div className="r-inline-confirm">
            <p>
              Delete this session permanently? Its study time will be removed
              from your history and totals.
            </p>
            <div className="r-form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Keep session
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={remove}
                disabled={saving}
              >
                {saving ? "Deleting…" : "Delete session"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="r-form-actions">
            {session !== "new" && (
              <Button
                type="button"
                variant="ghost"
                className="r-delete-action"
                aria-label="Delete session"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={16} />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button disabled={saving}>
              {saving
                ? "Saving…"
                : session === "new"
                  ? "Add study time"
                  : "Save changes"}
            </Button>
          </div>
        )}
      </form>
    </Modal>
  );
}

function SessionRow({
  session,
  onClick,
  timeZone,
}: {
  session: StudySession;
  onClick: () => void;
  timeZone: string;
}) {
  return (
    <button className="r-session-row" onClick={onClick}>
      <span className="r-session-marker">
        <SubjectDot color={session.subject_color || COLORS[0]} />
      </span>
      <span className="r-session-name">
        <strong>{session.subject_name}</strong>
        <small>
          {session.topic_name || session.note || "A little time, well spent."}
        </small>
      </span>
      <span className="r-session-time">
        {timeLabel(session.started_at, timeZone)}
      </span>
      <span className="r-session-source">
        {session.source === "manual"
          ? "Manual"
          : session.mode === "pomodoro"
            ? "Pomodoro"
            : session.mode === "countdown"
              ? "Countdown"
              : "Stopwatch"}
      </span>
      <strong className="r-session-duration">
        {duration(session.elapsed_seconds)}
      </strong>
      <ArrowUpRight className="r-session-arrow" size={16} />
    </button>
  );
}

export function HistoryPage() {
  const { user, subjects, topics, preferences, openAuth } = useSesh();
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [subject, setSubject] = useState(""),
    [topic, setTopic] = useState(""),
    [editing, setEditing] = useState<StudySession | "new" | null>(null);
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (subject) params.set("subject", subject);
  if (topic) params.set("topic", topic);
  const remote = useRemote<StudySession[]>(`/sessions/?${params}`);
  const entries = (remote.data || []).filter((s) => s.status === "completed");
  const groups = useMemo(() => {
    const result: Record<string, StudySession[]> = {};
    for (const session of entries) {
      const key = dateKey(new Date(session.started_at), preferences.timezone);
      (result[key] ??= []).push(session);
    }
    return Object.entries(result).sort(([a], [b]) => b.localeCompare(a));
  }, [remote.data, preferences.timezone]);
  return (
    <div className="reflection">
      <Header
        eyebrow="Your study journal"
        title="Time, well spent."
        description="Every session is a small part of the bigger picture."
        action={
          <Button onClick={() => (user ? setEditing("new") : openAuth())}>
            <Plus size={16} /> Add study time
          </Button>
        }
      />
      <div className="r-filters">
        <label>
          From
          <input
            aria-label="Sessions from date"
            className="input"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            aria-label="Sessions to date"
            className="input"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          Subject
          <select
            className="select"
            value={subject}
            onChange={(e) => {
              setSubject(e.target.value);
              setTopic("");
            }}
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Topic
          <select
            className="select"
            value={topic}
            disabled={!subject}
            onChange={(e) => setTopic(e.target.value)}
          >
            <option value="">All topics</option>
            {topics
              .filter((t) => String(t.subject) === subject)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        {(from || to || subject || topic) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFrom("");
              setTo("");
              setSubject("");
              setTopic("");
            }}
          >
            <X size={14} /> Clear
          </Button>
        )}
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <RemoteError error={remote.error} retry={remote.retry} />
      ) : !entries.length ? (
        <Empty
          icon={<Clock3 size={29} strokeWidth={1.3} />}
          title={
            from || to || subject
              ? "No sessions in this view."
              : "The beginning of your story."
          }
        >
          {from || to || subject
            ? "Try a different date range or subject. Your other sessions are still here."
            : "Your completed sessions will collect here. Begin with a little focus, or add time you have already studied."}
        </Empty>
      ) : (
        <>
          <div className="r-list-summary">
            <span>
              {entries.length} {entries.length === 1 ? "session" : "sessions"}
            </span>
            <span>
              {duration(entries.reduce((sum, s) => sum + s.elapsed_seconds, 0))}{" "}
              of focused time
            </span>
          </div>
          {groups.map(([date, sessions]) => (
            <section className="r-session-group" key={date}>
              <div className="r-group-heading">
                <h2>
                  {dayLabel(date, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h2>
                <span>
                  {duration(
                    sessions.reduce((sum, s) => sum + s.elapsed_seconds, 0),
                  )}
                </span>
              </div>
              {sessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onClick={() => setEditing(session)}
                  timeZone={preferences.timezone}
                />
              ))}
            </section>
          ))}
        </>
      )}
      <SessionEditor
        session={editing}
        onClose={() => setEditing(null)}
        onSaved={remote.retry}
      />
    </div>
  );
}

type CalendarData = {
  days: (DayStat & { session_ids?: number[] })[];
  sessions: StudySession[];
};
export function CalendarPage() {
  const { preferences, user, openAuth } = useSesh();
  const today = dateKey(new Date(), preferences.timezone);
  const [view, setView] = useState<"month" | "week" | "year">("month"),
    [cursor, setCursor] = useState(today),
    [selected, setSelected] = useState(today),
    [editing, setEditing] = useState<StudySession | "new" | null>(null);
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const start =
    view === "year"
      ? cursor.slice(0, 4) + "-01-01"
      : view === "week"
        ? weekStart(cursor, preferences.week_start)
        : weekStart(monthStart(cursor), preferences.week_start);
  const end =
    view === "year"
      ? cursor.slice(0, 4) + "-12-31"
      : view === "week"
        ? dayAdd(start, 6)
        : dayAdd(weekStart(monthEnd(cursor), preferences.week_start), 6);
  const remote = useRemote<CalendarData>(`/calendar/?from=${start}&to=${end}`);
  const dates = useMemo(() => {
    const list: string[] = [];
    for (let date = start; date <= end; date = dayAdd(date, 1)) list.push(date);
    return list;
  }, [start, end]);
  const dayMap = new Map(
    (remote.data?.days || []).map((day) => [day.date, day]),
  );
  const currentDay = dayMap.get(selected);
  const sessions = (remote.data?.sessions || []).filter((s) =>
    currentDay?.session_ids
      ? currentDay.session_ids.includes(s.id)
      : dateKey(new Date(s.started_at), preferences.timezone) === selected,
  );
  const weekNames = Array.from(
    { length: 7 },
    (_, i) => WEEKDAYS[(i + preferences.week_start) % 7],
  );
  function move(direction: number) {
    let next;
    if (view === "year")
      next = String(Number(cursor.slice(0, 4)) + direction) + "-01-01";
    else if (view === "month") next = monthAdd(cursor, direction);
    else next = dayAdd(cursor, direction * 7);
    setCursor(next);
    setSelected(next);
  }
  function selectDate(date: string) {
    setSelected(date);
    if (date < start || date > end) setCursor(date);
  }
  function keyboard(e: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offsets: Record<string, number> = {
      ArrowLeft: view === "year" ? -7 : -1,
      ArrowRight: view === "year" ? 7 : 1,
      ArrowUp: view === "year" ? -1 : -7,
      ArrowDown: view === "year" ? 1 : 7,
      Home: -((weekday(date) - preferences.week_start + 7) % 7),
      End: 6 - ((weekday(date) - preferences.week_start + 7) % 7),
    };
    if (!(e.key in offsets)) return;
    e.preventDefault();
    const next = dayAdd(date, offsets[e.key]);
    selectDate(next);
    requestAnimationFrame(() => dayButtons.current.get(next)?.focus());
  }
  useEffect(() => {
    if (
      selected >= start &&
      selected <= end &&
      document.activeElement?.classList.contains("r-calendar-day")
    )
      dayButtons.current.get(selected)?.focus();
  }, [start, end, selected]);
  const title =
    view === "year"
      ? cursor.slice(0, 4)
      : view === "week"
        ? `${dayLabel(start)} – ${dayLabel(end, { month: "short", day: "numeric", year: "numeric" })}`
        : dayLabel(cursor, { month: "long", year: "numeric" });
  function dateButton(date: string) {
    const day = dayMap.get(date);
    const seconds = day?.seconds || 0;
    const ratio =
      seconds /
      (Math.max(day?.goal_minutes || preferences.daily_goal_minutes, 1) * 60);
    const intensity =
      seconds === 0
        ? 0
        : ratio < 0.25
          ? 1
          : ratio < 0.6
            ? 2
            : ratio < 1
              ? 3
              : 4;
    return (
      <button
        key={date}
        ref={(node) => {
          if (node) dayButtons.current.set(date, node);
          else dayButtons.current.delete(date);
        }}
        className={`r-calendar-day r-intensity-${intensity}${day?.goal_achieved ? " r-goal-met" : ""}${day?.is_rest_day ? " r-rest-day" : ""}${date === today ? " r-today" : ""}${date === selected ? " r-selected" : ""}${view === "month" && date.slice(0, 7) !== cursor.slice(0, 7) ? " r-other-month" : ""}`}
        aria-label={`${dayLabel(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}, ${duration(seconds)} studied${day?.goal_achieved ? ", goal achieved" : ""}${day?.is_rest_day ? ", rest day" : ""}`}
        aria-pressed={selected === date}
        tabIndex={date === selected ? 0 : -1}
        onKeyDown={(e) => keyboard(e, date)}
        onClick={() => selectDate(date)}
        title={`${dayLabel(date)} · ${duration(seconds)}${day?.is_rest_day ? " · Rest day" : ""}`}
      >
        <span className="r-date-number">
          {Number(date.slice(-2))}
          {date === today && <i />}
        </span>
        {view !== "year" && (
          <>
            <span className="r-calendar-time">
              {seconds > 0
                ? duration(seconds, true)
                : day?.is_rest_day
                  ? "Rest day"
                  : ""}
            </span>
            <span className="r-calendar-status">
              {day?.goal_achieved ? (
                <Check size={12} aria-hidden="true" />
              ) : day?.is_rest_day ? (
                <Leaf size={12} aria-hidden="true" />
              ) : null}
            </span>
          </>
        )}
      </button>
    );
  }
  return (
    <div className="reflection">
      <Header
        eyebrow="Study index / Calendar"
        title="Your study calendar."
        description="Choose a day to see its sessions and progress."
      />
      <div className="r-calendar-toolbar">
        <div className="r-calendar-nav">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Previous ${view}`}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </Button>
          <h2>{title}</h2>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Next ${view}`}
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCursor(today);
              setSelected(today);
            }}
          >
            Today
          </Button>
        </div>
        <div className="r-segmented" aria-label="Calendar view">
          {(["week", "month", "year"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setCursor(selected);
              }}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <RemoteError error={remote.error} retry={remote.retry} />
      ) : (
        <>
          <div className={`r-calendar r-calendar-${view}`}>
            {view === "year" ? (
              <>
                <div className="r-year-months">
                  {Array.from({ length: 12 }, (_, i) => (
                    <span key={i}>
                      {new Date(2000, i, 1).toLocaleDateString("en-US", {
                        month: "short",
                      })}
                    </span>
                  ))}
                </div>
                <div
                  className="r-year-heatmap"
                  role="group"
                  aria-label={`Study activity in ${cursor.slice(0, 4)}`}
                >
                  {Array.from(
                    {
                      length: (weekday(start) - preferences.week_start + 7) % 7,
                    },
                    (_, i) => (
                      <span key={`blank${i}`} className="r-heatmap-blank" />
                    ),
                  )}
                  {dates.map(dateButton)}
                </div>
              </>
            ) : (
              <>
                <div className="r-weekday-labels">
                  {weekNames.map((name) => (
                    <span key={name}>{name.slice(0, 3)}</span>
                  ))}
                </div>
                <div
                  className="r-calendar-grid"
                  role="group"
                  aria-label={`${view === "month" ? "Monthly" : "Weekly"} study calendar`}
                >
                  {dates.map(dateButton)}
                </div>
              </>
            )}
          </div>
          <div className="r-calendar-legend">
            <span>Less</span>
            <div className="r-intensity-legend">
              {[0, 1, 2, 3, 4].map((i) => (
                <i key={i} className={`r-intensity-${i}`} />
              ))}
            </div>
            <span>More focus</span>
            <span className="r-legend-separator" />
            <span>
              <Check size={13} /> Goal met
            </span>
            <span>
              <Leaf size={13} /> Rest day
            </span>
            <span className="r-calendar-timezone">{preferences.timezone}</span>
          </div>
          <motion.section
            key={selected}
            initial={{ y: 7 }}
            animate={{ y: 0 }}
            className="r-day-detail"
          >
            <div className="r-day-detail-title">
              <div>
                <p className="eyebrow">A closer look</p>
                <h2>
                  {dayLabel(selected, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </h2>
              </div>
              <div className="r-day-total">
                <strong>{duration(currentDay?.seconds || 0)}</strong>
                <span>
                  {currentDay?.is_rest_day
                    ? "A planned day to rest"
                    : currentDay?.goal_achieved
                      ? "Daily goal reached"
                      : `of ${duration((currentDay?.goal_minutes || preferences.daily_goal_minutes) * 60)} daily goal`}
                </span>
              </div>
            </div>
            {sessions.length ? (
              <>
                <p className="r-meta">
                  {sessions.length}{" "}
                  {sessions.length === 1 ? "session" : "sessions"} touched this
                  day. Session rows show their full duration.
                </p>
                {sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    onClick={() => setEditing(session)}
                    timeZone={preferences.timezone}
                  />
                ))}
              </>
            ) : (
              <div className="r-day-empty">
                <span>
                  {currentDay?.is_rest_day ? (
                    <Leaf size={21} strokeWidth={1.3} />
                  ) : (
                    <BookOpen size={21} strokeWidth={1.3} />
                  )}
                </span>
                <p>
                  {selected > today
                    ? "A little space for what’s ahead."
                    : currentDay?.is_rest_day
                      ? "Rest is part of a sustainable rhythm."
                      : "No study sessions on this day."}
                </p>
                {!user && (
                  <Button variant="ghost" size="sm" onClick={openAuth}>
                    Sign in to begin <ArrowRight size={14} />
                  </Button>
                )}
              </div>
            )}
          </motion.section>
        </>
      )}
      <SessionEditor
        session={editing}
        onClose={() => setEditing(null)}
        onSaved={remote.retry}
      />
    </div>
  );
}

const chartTooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--text)",
  boxShadow: "0 6px 20px #00000008",
};
function StudyChart({
  daily,
  reducedMotion,
  kind = "area",
}: {
  daily: { date: string; seconds: number }[];
  reducedMotion: boolean;
  kind?: "area" | "bar";
}) {
  const systemStill = useSystemStill();
  const data = daily.map((d) => ({
    ...d,
    hours: Math.round((d.seconds / 3600) * 100) / 100,
    label: dayLabel(d.date, { month: "short", day: "numeric" }),
  }));
  return (
    <div
      className="r-chart"
      role="img"
      aria-label={`Daily study time. ${daily.filter((d) => d.seconds > 0).length} active days, ${duration(daily.reduce((sum, d) => sum + d.seconds, 0))} total.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {kind === "area" ? (
          <AreaChart
            data={data}
            margin={{ top: 15, right: 10, bottom: 0, left: -22 }}
          >
            <defs>
              <linearGradient id="studyArea" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--plot-glow)"
                  stopOpacity={0.65}
                />
                <stop
                  offset="100%"
                  stopColor="var(--accent)"
                  stopOpacity={0.01}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--line)"
              strokeOpacity={0.6}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              minTickGap={34}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              unit="h"
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              formatter={(_value, _name, item) => [
                duration(Number(item.payload.seconds)),
                "Focused time",
              ]}
              labelStyle={{ color: "var(--text)" }}
            />
            <Area
              type="monotone"
              dataKey="hours"
              stroke="var(--plot-glow)"
              strokeWidth={1.7}
              fill="url(#studyArea)"
              animationDuration={280}
              animationEasing="ease-out"
              isAnimationActive={!reducedMotion && !systemStill}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 3 }}
            />
          </AreaChart>
        ) : (
          <BarChart
            data={data}
            margin={{ top: 15, right: 10, bottom: 0, left: -22 }}
          >
            <defs>
              <linearGradient id="studyBar" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="var(--plot-glow)" offset="0%" />
                <stop
                  stopColor="var(--plot-glow)"
                  stopOpacity={0.18}
                  offset="100%"
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="var(--line)"
              strokeOpacity={0.6}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              minTickGap={28}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted)", fontSize: 11 }}
              unit="h"
            />
            <Tooltip
              contentStyle={chartTooltipStyle}
              cursor={{ fill: "var(--accent-soft)" }}
              formatter={(_value, _name, item) => [
                duration(Number(item.payload.seconds)),
                "Focused time",
              ]}
            />
            <Bar
              dataKey="hours"
              fill="url(#studyBar)"
              radius={[5, 5, 0, 0]}
              maxBarSize={36}
              animationDuration={280}
              animationEasing="ease-out"
              isAnimationActive={!reducedMotion && !systemStill}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
function changeLabel(value: number | null) {
  return value === null
    ? "No previous study time"
    : `${value >= 0 ? "+" : ""}${Math.round(value)}% from the previous period`;
}
export function AnalyticsPage() {
  const systemStill = useSystemStill();
  const { user, preferences, openAuth } = useSesh();
  const today = dateKey(new Date(), preferences.timezone);
  const [range, setRange] = useState("month"),
    [customFrom, setCustomFrom] = useState(dayAdd(today, -29)),
    [customTo, setCustomTo] = useState(today),
    [chart, setChart] = useState<"area" | "bar">("area"),
    [selectedSubject, setSelectedSubject] = useState<number | null>(null);
  const from =
    range === "week"
      ? weekStart(today, preferences.week_start)
      : range === "year"
        ? today.slice(0, 4) + "-01-01"
        : range === "custom"
          ? customFrom
          : dayAdd(today, -29);
  const to = range === "custom" ? customTo : today;
  const remote = useRemote<Analytics>(`/analytics/?from=${from}&to=${to}`);
  const data = remote.data;
  const activeSubjects = (data?.subjects || []).filter((s) => s.seconds > 0);
  const selected =
    activeSubjects.find((s) => s.id === selectedSubject) || activeSubjects[0];
  return (
    <div className="reflection">
      <Header
        eyebrow="The shape of your progress"
        title="Your focus over time."
        description="Study time, subjects, and the rhythm of your week."
        action={
          <select
            className="select r-range-select"
            aria-label="Analytics date range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="month">Last 30 days</option>
            <option value="week">This week so far</option>
            <option value="year">This year so far</option>
            <option value="custom">Custom dates</option>
          </select>
        }
      />
      {range === "custom" && (
        <div className="r-filters r-date-range">
          <label>
            From
            <input
              className="input"
              type="date"
              max={customTo}
              value={customFrom}
              onChange={(e) =>
                setCustomFrom(e.target.value || dayAdd(today, -29))
              }
            />
          </label>
          <label>
            To
            <input
              className="input"
              type="date"
              min={customFrom}
              max={today}
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value || today)}
            />
          </label>
        </div>
      )}
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <RemoteError error={remote.error} retry={remote.retry} />
      ) : !data || data.range_seconds === 0 ? (
        <Empty
          icon={<Leaf size={30} strokeWidth={1.2} />}
          title="Your progress starts with presence."
          action={
            !user ? (
              <Button onClick={openAuth}>
                Create your account <ArrowRight size={15} />
              </Button>
            ) : undefined
          }
        >
          Once you complete a session, your time, habits, and subjects will come
          into focus here.{" "}
          {user
            ? "Try a different date range to revisit earlier sessions."
            : ""}
        </Empty>
      ) : (
        <>
          <p className="r-period-caption">
            {dayLabel(from, { month: "long", day: "numeric", year: "numeric" })}{" "}
            — {dayLabel(to, { month: "long", day: "numeric", year: "numeric" })}
            {to >= today ? " · Period in progress" : ""}
          </p>
          <div className="r-stats-strip">
            <Stat
              label="Total focused time"
              value={duration(data.range_seconds)}
              detail={`${data.total_sessions} completed sessions`}
            />
            <Stat
              label="Daily average"
              value={duration(data.average_daily_seconds)}
              detail="Across every day in this range"
            />
            <Stat
              label="Average session"
              value={duration(data.average_session_seconds)}
              detail={`Longest: ${duration(data.longest_session_seconds)}`}
            />
            <Stat
              label="Days you showed up"
              value={data.active_days}
              detail={`${Math.round(data.goal_achievement_rate)}% daily goal achievement`}
            />
          </div>
          <section className="r-chart-section">
            <div className="r-section-heading">
              <div>
                <h2>Daily study time.</h2>
                <p>Completed focus time by day.</p>
              </div>
              <div className="r-segmented" aria-label="Chart type">
                <button
                  aria-pressed={chart === "area"}
                  onClick={() => setChart("area")}
                >
                  Trend
                </button>
                <button
                  aria-pressed={chart === "bar"}
                  onClick={() => setChart("bar")}
                >
                  Daily
                </button>
              </div>
            </div>
            <StudyChart
              daily={data.daily}
              reducedMotion={preferences.reduced_motion}
              kind={chart}
            />
            <details className="r-data-table">
              <summary>View daily study data</summary>
              <div className="r-scroll-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Focused time</th>
                      <th>Daily target</th>
                      <th>Goal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day) => (
                      <tr key={day.date}>
                        <td>
                          {dayLabel(day.date, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td>{duration(day.seconds)}</td>
                        <td>{duration(day.goal_minutes * 60)}</td>
                        <td>
                          {day.is_rest_day
                            ? "Rest day"
                            : day.goal_achieved
                              ? "Reached"
                              : "In progress"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="r-analytics-two">
            <section>
              <div className="r-section-heading">
                <div>
                  <h2>Where your time goes.</h2>
                  <p>A little perspective on your subjects.</p>
                </div>
              </div>
              <div className="r-distribution">
                <div
                  className="r-donut"
                  role="img"
                  aria-label={activeSubjects
                    .map(
                      (s) =>
                        `${s.name}: ${duration(s.seconds)}, ${Math.round(s.percent)} percent`,
                    )
                    .join(". ")}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeSubjects}
                        dataKey="seconds"
                        nameKey="name"
                        innerRadius="69%"
                        outerRadius="87%"
                        paddingAngle={activeSubjects.length > 1 ? 3 : 0}
                        stroke="none"
                        animationDuration={280}
                        animationBegin={0}
                        animationEasing="ease-out"
                        isAnimationActive={
                          !preferences.reduced_motion && !systemStill
                        }
                      >
                        {activeSubjects.map((s) => (
                          <Cell key={s.id} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        formatter={(value) => duration(Number(value))}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="r-donut-center">
                    <strong>{activeSubjects.length}</strong>
                    <span>
                      {activeSubjects.length === 1 ? "subject" : "subjects"}
                    </span>
                  </div>
                </div>
                <div className="r-subject-breakdown">
                  {activeSubjects.map((subject) => (
                    <button
                      key={subject.id}
                      aria-pressed={selected?.id === subject.id}
                      onClick={() => setSelectedSubject(subject.id)}
                    >
                      <SubjectDot color={subject.color} />
                      <span>{subject.name}</span>
                      <strong>{duration(subject.seconds)}</strong>
                      <small>{Math.round(subject.percent)}%</small>
                    </button>
                  ))}
                </div>
              </div>
              {selected && (
                <div className="r-subject-drilldown">
                  <h3>
                    <SubjectDot color={selected.color} />
                    {selected.name}
                  </h3>
                  <div className="r-subject-mini-stats">
                    <span>
                      This week{" "}
                      <strong>{duration(selected.weekly_seconds)}</strong>
                    </span>
                    <span>
                      This month{" "}
                      <strong>{duration(selected.monthly_seconds)}</strong>
                    </span>
                    <span>
                      Weekly target{" "}
                      <strong>
                        {selected.weekly_goal_minutes
                          ? duration(selected.weekly_goal_minutes * 60)
                          : "Not set"}
                      </strong>
                    </span>
                  </div>
                  {selected.weekly_goal_minutes > 0 && (
                    <Meter
                      label={`${selected.name} weekly target`}
                      value={
                        (selected.weekly_seconds /
                          (selected.weekly_goal_minutes * 60)) *
                        100
                      }
                    />
                  )}
                  {selected.daily?.some((day) => day.seconds > 0) && (
                    <>
                      <p className="r-meta">
                        This subject over the selected dates
                      </p>
                      <StudyChart
                        daily={selected.daily}
                        reducedMotion={preferences.reduced_motion}
                      />
                    </>
                  )}
                  <div className="r-topic-breakdown">
                    {selected.topics.length ? (
                      selected.topics.map((topic) => (
                        <div key={topic.id}>
                          <span>{topic.name}</span>
                          <strong>{duration(topic.seconds)}</strong>
                        </div>
                      ))
                    ) : (
                      <p className="r-meta">
                        No topic breakdown for this subject.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
            <section className="r-consistency">
              <div className="r-section-heading">
                <div>
                  <h2>Finding your rhythm.</h2>
                  <p>Consistency has its own quiet momentum.</p>
                </div>
              </div>
              <div className="r-consistency-grid">
                <Stat
                  label="Current streak"
                  value={
                    <>
                      {data.current_streak}
                      <em> days</em>
                    </>
                  }
                  detail="Planned rest days preserve your streak"
                />
                <Stat
                  label="Longest streak"
                  value={
                    <>
                      {data.longest_streak}
                      <em> days</em>
                    </>
                  }
                  detail="Across your complete study history"
                />
              </div>
              <div className="r-insight-lines">
                <div>
                  <CalendarDays size={18} />
                  <p>
                    Most focused day
                    <strong>
                      {data.most_productive_day
                        ? dayLabel(data.most_productive_day.date, {
                            month: "long",
                            day: "numeric",
                          })
                        : "Not enough data yet"}
                    </strong>
                  </p>
                </div>
                <div>
                  <Leaf size={18} />
                  <p>
                    Your strongest weekday
                    <strong>
                      {data.most_productive_weekday?.name ||
                        "Not enough data yet"}
                    </strong>
                  </p>
                </div>
                <div>
                  <Clock3 size={18} />
                  <p>
                    Your most common study window
                    <strong>
                      {data.common_study_window?.label || "Not enough data yet"}
                    </strong>
                  </p>
                </div>
              </div>
            </section>
          </div>
          <section className="r-comparisons">
            <div className="r-section-heading">
              <div>
                <h2>A little perspective.</h2>
                <p>
                  Current periods are still in progress; previous periods are
                  complete.
                </p>
              </div>
            </div>
            <div className="r-comparison-grid">
              <Stat
                label="This week so far"
                value={duration(data.week_seconds)}
                detail={
                  <>
                    {changeLabel(data.week_change_percent)}
                    <br />
                    {duration(
                      Math.abs(data.week_seconds - data.previous_week_seconds),
                    )}{" "}
                    {data.week_seconds >= data.previous_week_seconds
                      ? "more"
                      : "less"}{" "}
                    · last week {duration(data.previous_week_seconds)}
                  </>
                }
              />
              <Stat
                label="This month so far"
                value={duration(data.month_seconds)}
                detail={
                  <>
                    {changeLabel(data.month_change_percent)}
                    <br />
                    {duration(
                      Math.abs(
                        data.month_seconds - data.previous_month_seconds,
                      ),
                    )}{" "}
                    {data.month_seconds >= data.previous_month_seconds
                      ? "more"
                      : "less"}{" "}
                    · last month {duration(data.previous_month_seconds)}
                  </>
                }
              />
              <Stat
                label="This year"
                value={duration(data.year_seconds)}
                detail={`${duration(data.all_time_seconds)} across all time`}
              />
            </div>
            <div className="r-today-comparison">
              <span>
                Today <strong>{duration(data.today_seconds)}</strong>
              </span>
              <span>
                Yesterday <strong>{duration(data.yesterday_seconds)}</strong>
              </span>
              <span>
                Weekly goal{" "}
                <strong>{Math.round(data.week_goal_percent)}%</strong>
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export function ReviewsPage() {
  const { preferences, user, openAuth } = useSesh();
  const today = dateKey(new Date(), preferences.timezone),
    lastWeek = dayAdd(weekStart(today, preferences.week_start), -7);
  const [week, setWeek] = useState(lastWeek);
  const list = useRemote<WeeklyReview[]>("/reviews/");
  const remote = useRemote<WeeklyReview>(`/reviews/?week=${week}`);
  const review = remote.data;
  const options = Array.from(
    new Set([lastWeek, week, ...(list.data || []).map((r) => r.week_start)]),
  )
    .sort()
    .reverse();
  const subjects = (review?.subjects || []).filter((s) => s.seconds > 0);
  const mostStudied = [...subjects].sort((a, b) => b.seconds - a.seconds)[0];
  return (
    <div className="reflection r-review-page">
      <Header
        eyebrow="A moment to reflect"
        title="The week, in perspective."
        description="Step back. Notice the work you’ve made room for."
        action={
          <select
            className="select r-review-select"
            aria-label="Choose a completed week"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          >
            {options.map((date) => (
              <option key={date} value={date}>
                {dayLabel(date, { month: "short", day: "numeric" })} —{" "}
                {dayLabel(dayAdd(date, 6), {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>
        }
      />
      <div className="r-review-navigation">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWeek(dayAdd(week, -7))}
        >
          <ArrowLeft size={14} /> Previous week
        </Button>
        <span>
          Completed week · {dayLabel(week)} – {dayLabel(dayAdd(week, 6))}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={week >= lastWeek}
          onClick={() => setWeek(dayAdd(week, 7))}
        >
          Next week <ArrowRight size={14} />
        </Button>
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <RemoteError error={remote.error} retry={remote.retry} />
      ) : !review || review.total_seconds === 0 ? (
        <Empty
          icon={<BookOpen size={29} strokeWidth={1.2} />}
          title="A fresh page for next week."
          action={
            !user ? (
              <Button onClick={openAuth}>
                Start your study story <ArrowRight size={15} />
              </Button>
            ) : undefined
          }
        >
          There are no completed study sessions in this week. Your weekly
          reviews will appear as you build your rhythm.
        </Empty>
      ) : (
        <>
          <section className="r-review-hero">
            <p className="eyebrow">Your weekly review</p>
            <div className="r-review-total">
              {duration(review.total_seconds)}
            </div>
            <h2>Dedicated to what matters to you.</h2>
            <p>
              {review.session_count} focused{" "}
              {review.session_count === 1 ? "session" : "sessions"} across{" "}
              {review.active_days} {review.active_days === 1 ? "day" : "days"}.
              {mostStudied ? (
                <>
                  {" "}
                  Most of your time went to <span>{mostStudied.name}</span>.
                </>
              ) : null}
            </p>
            <span className="r-review-change">
              {review.change_percent === null
                ? "Your first chapter of recorded study."
                : `${duration(Math.abs(review.total_seconds - review.previous_seconds))} ${review.total_seconds >= review.previous_seconds ? "more" : "less"} than the previous week · ${review.change_percent >= 0 ? "+" : ""}${Math.round(review.change_percent)}%`}
            </span>
          </section>
          <div className="r-stats-strip r-review-stats">
            <Stat
              label="Days with focus"
              value={
                <>
                  {review.active_days}
                  <em> / 7</em>
                </>
              }
              detail={`${review.daily_goals_achieved} daily goals reached`}
            />
            <Stat
              label="Per active day"
              value={duration(review.average_active_day_seconds)}
              detail="Your average when you studied"
            />
            <Stat
              label="Longest session"
              value={duration(review.longest_session_seconds)}
              detail="A deeper stretch of attention"
            />
            <Stat
              label="Weekly goal"
              value={`${Math.round(review.weekly_goal_percent)}%`}
              detail={`${duration(review.total_seconds)} of ${duration(review.weekly_goal_minutes * 60)}`}
            />
          </div>
          <section className="r-review-chart">
            <div className="r-section-heading">
              <div>
                <h2>A week of small beginnings.</h2>
                <p>Your focused time, day by day.</p>
              </div>
            </div>
            <StudyChart
              daily={review.daily}
              reducedMotion={preferences.reduced_motion}
              kind="bar"
            />
          </section>
          <div className="r-review-columns">
            <section>
              <p className="eyebrow">Your subjects</p>
              <h2>Where you put your mind.</h2>
              <div className="r-review-subjects">
                {subjects.map((subject) => (
                  <div key={subject.id}>
                    <div>
                      <SubjectDot color={subject.color} />
                      <h3>{subject.name}</h3>
                      <strong>{duration(subject.seconds)}</strong>
                      <span>{Math.round(subject.percent)}%</span>
                    </div>
                    <div className="r-subject-meter">
                      <i
                        style={{
                          width: `${Math.min(100, subject.percent)}%`,
                          background: subject.color,
                        }}
                      />
                    </div>
                    {"previous_seconds" in subject && (
                      <p className="r-meta">
                        {duration(
                          Math.abs(
                            subject.seconds - Number(subject.previous_seconds),
                          ),
                        )}{" "}
                        {subject.seconds >= Number(subject.previous_seconds)
                          ? "more"
                          : "less"}{" "}
                        than the previous week
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
            <section className="r-review-insights">
              <p className="eyebrow">A few things to notice</p>
              <h2>The story in your sessions.</h2>
              {review.insights.length ? (
                <ol>
                  {review.insights.map((insight, i) => (
                    <li key={`${i}-${insight}`}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <p>{insight}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="r-meta">
                  More sessions will give your study patterns room to emerge.
                </p>
              )}
            </section>
          </div>
          <p className="r-review-footer">
            <Leaf size={16} strokeWidth={1.4} /> A record of your attention. A
            little perspective for the week ahead.
          </p>
        </>
      )}
    </div>
  );
}

export function SettingsPage({
  profileOnly = false,
}: {
  profileOnly?: boolean;
}) {
  const { user, preferences, refresh, notify, openAuth } = useSesh();
  const [draft, setDraft] = useState<Preferences>(preferences),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false),
    [resending, setResending] = useState(false),
    [deleting, setDeleting] = useState(false),
    [deletePassword, setDeletePassword] = useState(""),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [deleteBusy, setDeleteBusy] = useState(false);
  const previousPreferences = useRef(JSON.stringify(preferences));
  useEffect(() => {
    const before = previousPreferences.current;
    setDraft((current) =>
      JSON.stringify(current) === before ? preferences : current,
    );
    previousPreferences.current = JSON.stringify(preferences);
  }, [preferences]);
  const zones = useMemo(() => {
    try {
      return Array.from(
        new Set([preferences.timezone, ...Intl.supportedValuesOf("timeZone")]),
      ).sort();
    } catch {
      return [
        preferences.timezone,
        "UTC",
        "America/New_York",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Berlin",
        "Asia/Kathmandu",
        "Asia/Kolkata",
        "Asia/Tokyo",
        "Australia/Sydney",
      ].filter((v, i, a) => a.indexOf(v) === i);
    }
  }, [preferences.timezone]);
  const changed = JSON.stringify(draft) !== JSON.stringify(preferences);
  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      openAuth();
      return;
    }
    setError("");
    if (
      draft.daily_goal_minutes < 1 ||
      draft.daily_goal_minutes > 1440 ||
      draft.weekly_goal_minutes < 1 ||
      draft.weekly_goal_minutes > 10080
    ) {
      setError(
        "Daily goals must be 1–1,440 minutes and weekly goals 1–10,080 minutes.",
      );
      return;
    }
    if (
      [
        draft.default_duration,
        draft.pomodoro_focus,
        draft.short_break,
        draft.long_break,
      ].some((value) => !Number.isInteger(value) || value < 1) ||
      draft.default_duration > 1440 ||
      draft.pomodoro_focus > 180 ||
      draft.short_break > 60 ||
      draft.long_break > 120
    ) {
      setError(
        "Choose whole minutes: 1–1,440 for countdown, 1–180 for focus, 1–60 for short breaks, and 1–120 for long breaks.",
      );
      return;
    }
    setSaving(true);
    try {
      await api("/preferences/", {
        method: "PATCH",
        body: JSON.stringify(draft),
      });
      await refresh();
      notify("Your preferences are saved.");
    } catch (e) {
      setError(err(e));
    } finally {
      setSaving(false);
    }
  }
  async function notifications(enabled: boolean) {
    if (!enabled) {
      update("notifications", false);
      return;
    }
    if (!("Notification" in window)) {
      setError("This browser does not support notifications.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        update("notifications", true);
        setError("");
      } else
        setError(
          "Notifications are turned off in your browser. You can allow them in its site settings.",
        );
    } catch {
      setError("Your browser could not enable notifications.");
    }
  }
  async function exportData() {
    if (!user) {
      openAuth();
      return;
    }
    setExporting(true);
    try {
      const data = await api("/export/");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sesh-study-data-${dateKey(new Date(), preferences.timezone)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("Your study data is ready to keep.");
    } catch (e) {
      notify(err(e));
    } finally {
      setExporting(false);
    }
  }
  async function resend() {
    setResending(true);
    try {
      const result = await api<{ detail: string }>(
        "/auth/resend-verification/",
        { method: "POST" },
      );
      notify(result.detail || "Verification email sent.");
    } catch (e) {
      notify(err(e));
    } finally {
      setResending(false);
    }
  }
  async function signOut() {
    try {
      await endLogin();
    } catch (e) {
      notify(err(e));
    }
  }
  async function removeAccount(e: FormEvent) {
    e.preventDefault();
    if (!deleteConfirm || !deletePassword) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api("/auth/account/", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      window.location.assign("/");
    } catch (e) {
      setDeleteError(err(e));
      setDeleteBusy(false);
    }
  }
  return (
    <div className="reflection r-settings">
      <Header
        eyebrow="Make yourself at home"
        title={profileOnly ? "Your profile." : "A space that suits you."}
        description={
          profileOnly
            ? "Your account and study data."
            : "A few thoughtful preferences. Then, back to what matters."
        }
      />
      {!profileOnly && (
        <form onSubmit={save}>
          <section className="r-settings-section">
            <div className="r-setting-intro">
              <h2>Look & feel</h2>
              <p>Keep your study space comfortable.</p>
            </div>
            <div className="r-setting-fields">
              <fieldset className="r-theme-field">
                <legend>Appearance</legend>
                <div className="r-theme-options">
                  {(["light", "dark", "system"] as const).map((theme) => (
                    <button
                      type="button"
                      key={theme}
                      aria-pressed={draft.theme === theme}
                      onClick={() => update("theme", theme)}
                    >
                      <span className={`r-theme-preview r-theme-${theme}`}>
                        <i />
                        <i />
                        <i />
                      </span>
                      <span>
                        {theme[0].toUpperCase() + theme.slice(1)}
                        {draft.theme === theme && <Check size={13} />}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="r-toggle">
                <span>
                  <strong>Reduce motion</strong>
                  <small>Gentler transitions and still charts.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.reduced_motion}
                  onChange={(e) => update("reduced_motion", e.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </div>
          </section>
          <section className="r-settings-section">
            <div className="r-setting-intro">
              <h2>Your goals</h2>
              <p>A gentle direction for your study time.</p>
            </div>
            <div className="r-setting-fields">
              <div className="form-grid">
                <label className="field">
                  Daily target <span className="r-meta">Minutes</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={1440}
                    value={draft.daily_goal_minutes}
                    onChange={(e) =>
                      update("daily_goal_minutes", Number(e.target.value))
                    }
                    required
                  />
                </label>
                <label className="field">
                  Weekly target <span className="r-meta">Minutes</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={10080}
                    value={draft.weekly_goal_minutes}
                    onChange={(e) =>
                      update("weekly_goal_minutes", Number(e.target.value))
                    }
                    required
                  />
                </label>
              </div>
              <fieldset className="r-rest-field">
                <legend>Preferred rest days</legend>
                <div>
                  {WEEKDAYS.map((day, i) => (
                    <label key={day} title={day}>
                      <input
                        type="checkbox"
                        checked={(draft.rest_days || []).includes(i)}
                        onChange={(e) =>
                          update(
                            "rest_days",
                            e.target.checked
                              ? [...(draft.rest_days || []), i].sort()
                              : (draft.rest_days || []).filter((d) => d !== i),
                          )
                        }
                      />
                      <span>{day.slice(0, 3)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p className="r-setting-note">
                Rest days preserve your streak. Daily changes apply today;
                weekly changes apply to this week. Earlier periods keep their
                goals.
              </p>
            </div>
          </section>
          <section className="r-settings-section">
            <div className="r-setting-intro">
              <h2>Your focus rhythm</h2>
              <p>Set the defaults that feel natural to you.</p>
            </div>
            <div className="r-setting-fields">
              <div className="form-grid">
                <label className="field">
                  Default timer
                  <select
                    className="select"
                    value={draft.default_mode}
                    onChange={(e) =>
                      update(
                        "default_mode",
                        e.target.value as Preferences["default_mode"],
                      )
                    }
                  >
                    <option value="stopwatch">Stopwatch</option>
                    <option value="countdown">Countdown</option>
                    <option value="pomodoro">Pomodoro</option>
                  </select>
                </label>
                <label className="field">
                  Countdown duration <span className="r-meta">Minutes</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={1440}
                    value={draft.default_duration}
                    onChange={(e) =>
                      update("default_duration", Number(e.target.value))
                    }
                    required
                  />
                </label>
              </div>
              <div className="r-three-fields">
                <label className="field">
                  Pomodoro focus
                  <input
                    className="input"
                    aria-label="Pomodoro focus minutes"
                    type="number"
                    min={1}
                    max={180}
                    value={draft.pomodoro_focus}
                    onChange={(e) =>
                      update("pomodoro_focus", Number(e.target.value))
                    }
                    required
                  />
                  <small>minutes</small>
                </label>
                <label className="field">
                  Short break
                  <input
                    className="input"
                    aria-label="Short break minutes"
                    type="number"
                    min={1}
                    max={60}
                    value={draft.short_break}
                    onChange={(e) =>
                      update("short_break", Number(e.target.value))
                    }
                    required
                  />
                  <small>minutes</small>
                </label>
                <label className="field">
                  Long break
                  <input
                    className="input"
                    aria-label="Long break minutes"
                    type="number"
                    min={1}
                    max={120}
                    value={draft.long_break}
                    onChange={(e) =>
                      update("long_break", Number(e.target.value))
                    }
                    required
                  />
                  <small>minutes</small>
                </label>
              </div>
              <label className="r-toggle">
                <span>
                  <strong>Session notifications</strong>
                  <small>A quiet reminder when a focus interval ends.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.notifications}
                  onChange={(e) => notifications(e.target.checked)}
                />
                <i aria-hidden="true" />
              </label>
            </div>
          </section>
          <section className="r-settings-section">
            <div className="r-setting-intro">
              <h2>Time & place</h2>
              <p>Your calendar follows your day.</p>
            </div>
            <div className="r-setting-fields">
              <label className="field">
                Timezone
                <select
                  className="select"
                  value={draft.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                >
                  {zones.map((zone) => (
                    <option value={zone} key={zone}>
                      {zone.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Start the week on
                <select
                  className="select"
                  value={draft.week_start}
                  onChange={(e) => update("week_start", Number(e.target.value))}
                >
                  <option value={0}>Monday</option>
                  <option value={6}>Sunday</option>
                </select>
              </label>
              <p className="r-setting-note">
                Calendar days, goals, and weekly reviews use this timezone.
              </p>
            </div>
          </section>
          <div className="r-settings-save">
            <ErrorNote message={error} />
            <span className="r-meta">
              {changed
                ? "You have a few unsaved changes."
                : "Everything is just as you left it."}
            </span>
            <Button type="submit" disabled={saving || (!changed && !!user)}>
              {saving
                ? "Saving…"
                : user
                  ? "Save preferences"
                  : "Sign in to save"}
            </Button>
          </div>
        </form>
      )}
      <section className="r-settings-section">
        <div className="r-setting-intro">
          <h2>Your account</h2>
          <p>Your study time belongs to you.</p>
        </div>
        <div className="r-setting-fields">
          {user ? (
            <>
              <div className="r-account-details">
                <span className="r-account-avatar">
                  {(user.first_name || user.email).slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <strong>{user.first_name || "Your Sesh account"}</strong>
                  <span>{user.email}</span>
                </div>
                <small>
                  {user.email_verified ? (
                    <>
                      <Check size={12} /> Verified
                    </>
                  ) : (
                    "Not verified"
                  )}
                </small>
              </div>
              {!user.email_verified && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={resend}
                  disabled={resending}
                >
                  {resending ? "Sending…" : "Resend verification email"}
                </Button>
              )}
              <div className="r-account-action">
                <div>
                  <strong>Take your data with you</strong>
                  <p>
                    Download your subjects, sessions, goals, and preferences.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={exportData}
                  disabled={exporting}
                >
                  <ArrowDownToLine size={15} />
                  {exporting ? "Preparing…" : "Export data"}
                </Button>
              </div>
              <div className="r-account-action">
                <div>
                  <strong>Sign out</strong>
                  <p>Your study history will be here when you return.</p>
                </div>
                <Button type="button" variant="outline" onClick={signOut}>
                  Sign out
                </Button>
              </div>
              <div className="r-account-action">
                <div>
                  <strong>Delete account</strong>
                  <p>Permanently remove your account and all study data.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="r-danger"
                  onClick={() => {
                    setDeleting(true);
                    setDeletePassword("");
                    setDeleteConfirm(false);
                    setDeleteError("");
                  }}
                >
                  Delete account
                </Button>
              </div>
            </>
          ) : (
            <div className="r-account-action">
              <div>
                <strong>A home for your focus.</strong>
                <p>
                  Create an account to save your preferences and study history.
                </p>
              </div>
              <Button type="button" onClick={openAuth}>
                Sign in <ArrowRight size={15} />
              </Button>
            </div>
          )}
        </div>
      </section>
      <Modal
        open={deleting}
        onOpenChange={(value) => {
          if (!value && !deleteBusy) setDeleting(false);
        }}
        title="Leave nothing behind?"
        description="Deleting your account permanently removes all your subjects, sessions, goals, and preferences. This cannot be undone."
      >
        <form onSubmit={removeAccount} className="r-form">
          <p className="r-meta">
            You can export your data in Settings before you leave.
          </p>
          <label className="field">
            Your password
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
            />
          </label>
          <label className="r-checkbox-label">
            <input
              type="checkbox"
              checked={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.checked)}
            />{" "}
            I understand that all of my study data will be permanently deleted.
          </label>
          <ErrorNote message={deleteError} />
          <div className="r-form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(false)}
              disabled={deleteBusy}
            >
              Keep my account
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={deleteBusy || !deleteConfirm || !deletePassword}
            >
              {deleteBusy ? "Deleting…" : "Delete my account"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

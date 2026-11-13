"use client";
import { useId, useMemo, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown, MessageSquare } from "lucide-react";
import { dayLabel, duration } from "@/lib/utils";
import {
  archiveClock as clock,
  fullSessionStamp,
  timelineLanes,
  type FocusInterval,
  type DayWindow,
  type FolioSession,
} from "@/lib/calendar-folio";

export function FocusTimeline({
  intervals,
  window: dayWindow,
  sessions,
  zone,
  onSelect,
}: {
  intervals: FocusInterval[];
  window?: DayWindow;
  sessions: FolioSession[];
  zone: string;
  onSelect: (id: number) => void;
}) {
  const [active, setActive] = useState<number | null>(null);
  const lanes = useMemo(() => timelineLanes(intervals), [intervals]);
  const tooltipId = useId();
  if (!dayWindow || !intervals.length || dayWindow.seconds <= 0) return null;
  const laneCount = Math.max(...lanes.map((interval) => interval.lane)) + 1;
  const detail = active == null ? null : lanes[active];
  const selected =
    detail &&
    sessions.find((item) => item.session.id === detail.session_id)?.session;
  return (
    <div className="folio-timeline">
      <div className="folio-timeline-heading">
        <span>THE SHAPE OF YOUR DAY</span>
        <small>
          Recorded focus · {zone}
          {dayWindow.seconds !== 86400
            ? ` · ${dayWindow.seconds / 3600}-hour local day`
            : ""}
        </small>
      </div>
      <div
        className="folio-timeline-track"
        style={{ height: Math.max(24, laneCount * 14 + 10) }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <i
            className="folio-timeline-tick"
            key={i}
            style={{ left: `${i * 25}%` }}
          />
        ))}
        {lanes.map((interval, i) => {
          const session = sessions.find(
            (item) => item.session.id === interval.session_id,
          )?.session;
          const description = `${session?.subject_name || "Focus"}${session?.topic_name ? " / " + session.topic_name : ""}: ${clock(interval.started_at, zone, true)} – ${clock(interval.ended_at, zone, true)}, ${duration(interval.seconds)} focused`;
          return (
            <button
              key={`${interval.session_id}-${interval.started_at}`}
              style={
                {
                  left: `${(interval.offset_seconds / dayWindow.seconds) * 100}%`,
                  width: `${(interval.span_seconds / dayWindow.seconds) * 100}%`,
                  top: interval.lane * 14,
                  "--interval-color": session?.subject_color || "#97bca6",
                } as CSSProperties
              }
              aria-label={description}
              aria-describedby={active === i ? tooltipId : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => onSelect(interval.session_id)}
            >
              <span />
            </button>
          );
        })}
      </div>
      <div className="folio-timeline-hours">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i}>
            {clock(
              new Date(
                Date.parse(dayWindow.started_at) +
                  (dayWindow.seconds * 1000 * i) / 4,
              ).toISOString(),
              zone,
            )}
          </span>
        ))}
      </div>
      <div className="folio-timeline-caption" id={tooltipId} role="tooltip">
        {detail ? (
          <>
            <strong>
              {selected?.subject_name}
              {selected?.topic_name ? ` / ${selected.topic_name}` : ""}
            </strong>
            <span>
              {clock(detail.started_at, zone, true)} –{" "}
              {clock(detail.ended_at, zone, true)} · {duration(detail.seconds)}{" "}
              focus
            </span>
          </>
        ) : (
          <span>
            Quiet spaces between marks are pauses, breaks, or time away.
          </span>
        )}
      </div>
    </div>
  );
}

function FolioEntry({
  item,
  zone,
  open,
  onToggle,
  onEdit,
  still,
}: {
  item: FolioSession;
  zone: string;
  open: boolean;
  onToggle: () => void;
  onEdit: () => void;
  still: boolean;
}) {
  const { session, accounting, allocated } = item;
  const id = useId();
  const details = [
    ["Focused", duration(accounting?.focus_seconds ?? session.elapsed_seconds)],
    ["Breaks", accounting ? duration(accounting.break_seconds) : "Unavailable"],
    [
      "Paused",
      accounting?.paused_seconds == null
        ? "Unavailable"
        : duration(accounting.paused_seconds),
    ],
    [
      "Elapsed",
      accounting?.wall_seconds == null
        ? "Unavailable"
        : duration(accounting.wall_seconds),
    ],
  ];
  return (
    <article
      className="folio-entry"
      data-open={open || undefined}
      style={{ "--subject-accent": session.subject_color } as CSSProperties}
    >
      <button
        className="folio-session-trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <i className="folio-subject-mark" aria-hidden="true" />
        <span className="folio-subject">
          <strong>{session.subject_name}</strong>
          <span>{session.topic_name || session.mode}</span>
        </span>
        <span className="folio-session-time">
          {clock(session.started_at, zone)} —{" "}
          {session.ended_at ? clock(session.ended_at, zone) : "…"}
          {session.note && (
            <MessageSquare size={12} aria-label="Has session note" />
          )}
        </span>
        <strong className="folio-session-duration">
          {duration(allocated, true)}
        </strong>
        <ChevronDown
          className="folio-session-arrow"
          size={16}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            className="folio-session-reveal"
            initial={{ height: still ? "auto" : 0, opacity: still ? 1 : 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: still ? "auto" : 0, opacity: 0 }}
            transition={{
              duration: still ? 0 : 0.28,
              ease: [0.22, 0.68, 0.18, 1],
            }}
          >
            <div className="folio-session-detail">
              <div className="folio-accounting">
                {details.map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="folio-full-stamp">
                {fullSessionStamp(session.started_at, zone)}
                {session.ended_at && (
                  <> → {fullSessionStamp(session.ended_at, zone)}</>
                )}
                <br />
                {session.mode} · Full-session totals; only {duration(allocated)}{" "}
                falls on this archive date.
              </p>
              {session.note && <blockquote>{session.note}</blockquote>}
              <button className="calendar-text-link" onClick={onEdit}>
                Open session details <ArrowUpRight size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}

export function DailySessions({
  date,
  items,
  intervals,
  dayWindow,
  zone,
  still,
  onEdit,
}: {
  date: string;
  items: FolioSession[];
  intervals: FocusInterval[];
  dayWindow?: DayWindow;
  zone: string;
  still: boolean;
  onEdit: (item: FolioSession["session"]) => void;
}) {
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <div
      className="folio-records"
      aria-label={`Sessions for ${dayLabel(date)}`}
    >
      <FocusTimeline
        intervals={intervals}
        window={dayWindow}
        sessions={items}
        zone={zone}
        onSelect={(id) => setOpened(id)}
      />
      <div className="folio-record-heading">
        <span>THE SESSIONS</span>
        <span>FOCUS ON THIS DATE</span>
      </div>
      {items.map((item) => (
        <FolioEntry
          key={item.session.id}
          item={item}
          zone={zone}
          open={opened === item.session.id}
          onToggle={() =>
            setOpened((value) =>
              value === item.session.id ? null : item.session.id,
            )
          }
          onEdit={() => onEdit(item.session)}
          still={still}
        />
      ))}
    </div>
  );
}

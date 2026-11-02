"use client";
import { PageLink as Link } from "@/lib/navigation-motion";
import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
} from "lucide-react";
import { useSesh } from "@/lib/store";
import { dateKey, duration, dayLabel } from "@/lib/utils";
import { salonEditions, enterSalon } from "@/lib/salon";
import { PersonalHero } from "./personal-hero";
import { FocusSetup } from "./focus";
import { api } from "@/lib/api";
import type { DayStat } from "@/lib/types";
import { useEffect } from "react";
function add(key: string, n: number) {
  let d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function stripStart(key: string, weekday: number) {
  let i = (new Date(key + "T12:00:00Z").getUTCDay() + 6) % 7;
  return add(key, -((i - weekday + 7) % 7));
}
function WeekIndex() {
  const { user, stats, preferences } = useSesh();
  const today = dateKey(new Date(), preferences.timezone);
  const [cursor, setCursor] = useState(today);
  const [days, setDays] = useState<DayStat[]>([]),
    [error, setError] = useState("");
  const start = stripStart(cursor, preferences.week_start),
    end = add(start, 6);
  useEffect(() => {
    let live = true;
    setError("");
    setDays([]);
    if (user)
      api<{ days: DayStat[] }>(`/calendar/?from=${start}&to=${end}`)
        .then((r) => {
          if (live) setDays(r.days);
        })
        .catch(() => {
          if (live) setError("Could not load this week.");
        });
    return () => {
      live = false;
    };
  }, [user?.id, start, end, stats]);
  const day = days.find((d) => d.date === cursor);
  return (
    <section className="week-index">
      <div className="index-label">
        <span>02 / ACTIVITY</span>
        <span>7 DAYS</span>
      </div>
      <div className="week-title">
        <h2>
          Week strip<span>.</span>
        </h2>
        <div>
          <button
            aria-label="Previous week"
            onClick={() => setCursor(add(cursor, -7))}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            aria-label="Next week"
            onClick={() => setCursor(add(cursor, 7))}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="strip-leaves">
        {Array.from({ length: 7 }, (_, i) => {
          const k = add(start, i),
            d = days.find((v) => v.date === k);
          return (
            <button
              key={k}
              aria-pressed={cursor === k}
              aria-label={dayLabel(k, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              onClick={() => setCursor(k)}
            >
              <small>{dayLabel(k, { weekday: "short" })}</small>
              <b>{k.slice(-2)}</b>
              <i
                style={{
                  height:
                    3 +
                    Math.min(
                      19,
                      ((d?.seconds || 0) /
                        Math.max(1, (d?.goal_minutes || 120) * 60)) *
                        19,
                    ),
                }}
              />
            </button>
          );
        })}
      </div>
      <div className="strip-readout" aria-live="polite">
        <b>{dayLabel(cursor)}</b>
        <span>
          {error ||
            (!user
              ? "Sign in to track this day"
              : day
                ? duration(day.seconds) +
                  " focused · " +
                  day.session_count +
                  " sessions"
                : "Reading…")}
        </span>
      </div>
      <Link href="/calendar">
        Full calendar <ArrowUpRight size={14} />
      </Link>
    </section>
  );
}
export function Home({ indexOnly = false }: { indexOnly?: boolean }) {
  const { stats, sessions, preferences, user } = useSesh();
  const personalizeAfterLogin = useRef(false);
  const reduced = useReducedMotion();
  return (
    <div className="study-sheet">
      {indexOnly ? (
        <h1 className="study-index-heading">Study Index</h1>
      ) : (
        <PersonalHero
          key={user?.id ?? "guest"}
          resume={!!user && personalizeAfterLogin.current}
          onAuthIntent={(value) => {
            personalizeAfterLogin.current = value;
          }}
        />
      )}
      <div className="studio-spread" id="study-index">
        <section className="salon-library">
          <div className="index-label">
            <span>01 / THE LISTENING ROOM</span>
            <span>SOUND EDITIONS</span>
          </div>
          <h2>Choose an atmosphere.</h2>
          <div className="edition-grid">
            {salonEditions.slice(0, 4).map(({ sound, title, detail }) => (
              <button
                key={sound}
                onClick={() => enterSalon(sound)}
                aria-label={`Enter ${title} · ${detail}`}
              >
                <img
                  src={`/atelier/editions/${sound}.webp`}
                  alt=""
                  loading="lazy"
                />
                <span>
                  <small>{detail}</small>
                  {title}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="instrument-column">
          <div className="index-label">
            <span>01 / INSTRUMENT</span>
            <span className="live-label">STANDBY</span>
          </div>
          <h2>Session timer</h2>
          <FocusSetup compact />
        </section>
      </div>
      <div className="ledger-spread">
        <WeekIndex />
        <section className="time-ledger">
          <div className="index-label">
            <span>03 / MEASURES</span>
            <Link href="/analytics">Analytics ↗</Link>
          </div>
          <h2>
            Time ledger<span>.</span>
          </h2>
          {[
            ["Today", stats?.today_seconds || 0],
            ["This week", stats?.week_seconds || 0],
            ["This month", stats?.month_seconds || 0],
            ["All time", stats?.all_time_seconds || 0],
          ].map(([title, value], i) => (
            <div className="ledger-row" key={title}>
              <small>0{i + 1}</small>
              <b>{title}</b>
              <span>{duration(Number(value))}</span>
            </div>
          ))}
          <div className="goal-rule">
            <span>
              Daily target · {duration(preferences.daily_goal_minutes * 60)}
            </span>
            <b>{Math.round(stats?.today_goal_percent || 0)}%</b>
            <motion.i
              initial={{ scaleX: 0 }}
              animate={{
                scaleX: Math.min(1, (stats?.today_goal_percent || 0) / 100),
              }}
              transition={{
                duration: reduced || preferences.reduced_motion ? 0 : 0.5,
              }}
            />
          </div>
        </section>
      </div>
      <section className="subject-ledger">
        <div className="index-label">
          <span>04 / SUBJECT MIX</span>
          <Link href="/subjects">Subjects ↗</Link>
        </div>
        {stats?.subjects.some((s) => s.seconds > 0) ? (
          <>
            <div className="distribution-ribbon">
              {stats.subjects
                .filter((s) => s.seconds > 0)
                .map((s) => (
                  <span
                    key={s.id}
                    style={{ width: s.percent + "%", background: s.color }}
                    title={s.name + " · " + duration(s.seconds)}
                  />
                ))}
            </div>
            <div className="mix-legend">
              {stats.subjects
                .filter((s) => s.seconds > 0)
                .map((s) => (
                  <span key={s.id}>
                    <i style={{ background: s.color }} />
                    {s.name} · {Math.round(s.percent)}%
                  </span>
                ))}
            </div>
          </>
        ) : (
          <p>Finish a session to see your subject mix.</p>
        )}
        <div className="folio-meta">
          <span>
            Weekly target: {duration(stats?.week_seconds || 0)} /{" "}
            {duration(preferences.weekly_goal_minutes * 60)}
          </span>
          <span>{stats?.current_streak || 0}-day streak</span>
          <span>{stats?.active_days || 0} active days / last 30</span>
        </div>
      </section>
      <section className="session-register">
        <div className="index-label">
          <span>05 / SESSION REGISTER</span>
          <Link href="/history">History ↗</Link>
        </div>
        {sessions.length ? (
          sessions.slice(0, 3).map((s) => (
            <Link href="/history" key={s.id}>
              <i style={{ background: s.subject_color }} />
              <b>{s.subject_name}</b>
              <span>{s.topic_name || s.mode}</span>
              <strong>{duration(s.elapsed_seconds)}</strong>
            </Link>
          ))
        ) : (
          <p>
            <CornerDownRight size={16} /> Your completed sessions will appear
            here.
          </p>
        )}
      </section>
      <div className="edition-end">
        SESH® <span>STUDY ATELIER — EDITION 01</span>
        <Link href="/reviews">Weekly review ↗</Link>
      </div>
    </div>
  );
}

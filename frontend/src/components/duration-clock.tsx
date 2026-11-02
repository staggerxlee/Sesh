"use client";
import { createPortal } from "react-dom";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { adjustTime, clockParts, editTime, type TimeUnit } from "@/lib/clock";

export function ClockDigits({ seconds }: { seconds: number }) {
  const parts = clockParts(seconds);
  return (
    <span className="clock-digits" data-hours={parts.hours > 0}>
      {parts.hours > 0 && (
        <>
          <span>{parts.hours}</span>
          <span className="clock-colon">:</span>
        </>
      )}
      <span>{String(parts.minutes).padStart(2, "0")}</span>
      <span className="clock-colon">:</span>
      <span className="clock-seconds">
        {String(parts.seconds).padStart(2, "0")}
      </span>
    </span>
  );
}

function ClockUnit({
  unit,
  total,
  max,
  onChange,
  label,
  describedBy,
  report,
}: {
  unit: TimeUnit;
  total: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  describedBy: string;
  report: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const spin = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const skipBlur = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const value = clockParts(total)[unit];
  const step = (direction: number) => {
    onChange(adjustTime(total, unit, direction, max));
    report("");
  };
  // Native, non-passive listener prevents scrolling only inside an editable unit.
  const latest = useRef({ step, editing: draft !== null });
  latest.current = { step, editing: draft !== null };
  useEffect(() => {
    const element = host.current!;
    let last = -Infinity;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      if (latest.current.editing || event.timeStamp - last < 100) return;
      last = event.timeStamp;
      latest.current.step(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  useEffect(() => {
    if (draft !== null) {
      input.current?.focus();
      input.current?.select();
    }
  }, [draft === null]);
  function commit(fromBlur = false) {
    if (draft === null) return;
    const result = editTime(total, unit, draft, max);
    if (result.error) {
      setInvalid(true);
      report(result.error);
      if (fromBlur) setDraft(null);
      return;
    }
    skipBlur.current = !fromBlur;
    onChange(result.value!);
    setDraft(null);
    setInvalid(false);
    report("");
    if (!fromBlur) spin.current?.focus();
  }
  return (
    <div ref={host} className={`clock-unit clock-${unit}`}>
      <button
        type="button"
        className="clock-arrow up"
        aria-label={`Increase ${label} ${unit}`}
        disabled={total >= max}
        onClick={() => step(1)}
      >
        <span aria-hidden="true" />
      </button>
      <span
        ref={spin}
        role="spinbutton"
        tabIndex={draft === null ? 0 : -1}
        aria-label={`${label} ${unit}`}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={
          unit === "hours"
            ? max / 3600
            : unit === "minutes" && total < 3600
              ? max / 60
              : 59
        }
        aria-describedby={describedBy}
        className="clock-value"
        onDoubleClick={() => {
          setInvalid(false);
          setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (
            ["ArrowUp", "ArrowDown", "Enter", " "].includes(e.key) ||
            /^\d$/.test(e.key)
          ) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === "ArrowUp" || e.key === "ArrowDown")
              step(e.key === "ArrowUp" ? 1 : -1);
            else {
              setInvalid(false);
              setDraft(/^\d$/.test(e.key) ? e.key : String(value));
            }
          }
        }}
      >
        <span style={{ visibility: draft === null ? "visible" : "hidden" }}>
          {unit === "hours" ? value : String(value).padStart(2, "0")}
        </span>
        {draft !== null && (
          <input
            ref={input}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            aria-label={`Edit ${label} ${unit}`}
            aria-invalid={invalid}
            value={draft}
            maxLength={6}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onBlur={() => {
              if (skipBlur.current) {
                skipBlur.current = false;
                return;
              }
              commit(true);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
              if (e.key === "Escape") {
                skipBlur.current = true;
                e.preventDefault();
                setDraft(null);
                setInvalid(false);
                report("");
                spin.current?.focus();
              }
            }}
          />
        )}
      </span>
      <button
        type="button"
        className="clock-arrow down"
        aria-label={`Decrease ${label} ${unit}`}
        disabled={total === 0}
        onClick={() => step(-1)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

export function DurationClock({
  seconds,
  onChange,
  max,
  label = "Focus",
  editable = true,
}: {
  seconds: number;
  onChange: (value: number) => void;
  max: number;
  label?: string;
  editable?: boolean;
}) {
  const id = useId();
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const hint = useRef<HTMLSpanElement>(null);
  const [error, setError] = useState("");
  const [showHours, setShowHours] = useState(false);
  useEffect(() => {
    if (seconds >= 3600) setShowHours(false);
  }, [seconds]);
  const hours = seconds >= 3600 || showHours;
  return (
    <div
      className="duration-clock"
      role="group"
      aria-label={`${label} duration`}
    >
      {editable ? (
        <>
          <div
            className="setup-time clock-editor"
            data-hours={hours}
            onPointerMove={(event) => {
              if (
                event.pointerType === "touch" ||
                (event.target as HTMLElement).closest("input")
              ) {
                setPointer(null);
                return;
              }
              const width = hint.current?.offsetWidth ?? 180;
              setPointer({
                x: Math.max(
                  8,
                  Math.min(event.clientX + 24, window.innerWidth - width - 8),
                ),
                y: Math.max(
                  8,
                  Math.min(event.clientY + 8, window.innerHeight - 24),
                ),
              });
            }}
            onPointerLeave={() => setPointer(null)}
            onFocusCapture={(event) => {
              if (event.target instanceof HTMLInputElement) setPointer(null);
            }}
          >
            {(
              [...(hours ? ["hours"] : []), "minutes", "seconds"] as TimeUnit[]
            ).map((unit, i) => (
              <Fragment key={unit}>
                {i > 0 && (
                  <span className="clock-colon" aria-hidden="true">
                    :
                  </span>
                )}
                <ClockUnit
                  unit={unit}
                  total={seconds}
                  max={max}
                  onChange={onChange}
                  label={label}
                  describedBy={id}
                  report={setError}
                />
              </Fragment>
            ))}
          </div>
          <div className="clock-guidance">
            <span className="sr-only" id={id}>
              Scroll or use arrow keys to adjust. Double-click or press Enter to
              edit. Maximum {max / 3600} hours.
            </span>
            {pointer &&
              createPortal(
                <span
                  ref={hint}
                  className="clock-hint"
                  aria-hidden="true"
                  style={{ left: pointer.x, top: pointer.y }}
                >
                  Scroll · double-click to edit
                </span>,
                document.body,
              )}
            {!hours && (
              <button type="button" onClick={() => setShowHours(true)}>
                Set hours
              </button>
            )}
            {hours && seconds < 3600 && (
              <button type="button" onClick={() => setShowHours(false)}>
                Hide hours
              </button>
            )}
          </div>
          <p className="clock-error" role="status">
            {error || (seconds === 0 ? "Choose a duration to begin." : "")}
          </p>
        </>
      ) : (
        <div className="setup-time">
          <ClockDigits seconds={seconds} />
        </div>
      )}
    </div>
  );
}

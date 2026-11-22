"use client";
import { useEffect, useRef, useState } from "react";

/** Display hours/minutes while preserving the API's total-minute representation. */
export function DurationField({
  label,
  value,
  onChange,
  max,
  min = 1,
  optional = false,
  fractional = false,
}: {
  label: string;
  value: number;
  onChange: (minutes: number) => void;
  max: number;
  min?: number;
  optional?: boolean;
  fractional?: boolean;
}) {
  const split = (v: number) => [
    String(Math.floor(v / 60)),
    String(Math.round((v % 60) * 100) / 100),
  ];
  const [parts, setParts] = useState(() => split(value));
  const emitted = useRef(value);
  const minuteInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setParts(split(value));
    }
  }, [value]);
  useEffect(() => {
    const total = Number(parts[0]) * 60 + Number(parts[1]);
    minuteInput.current?.setCustomValidity(
      total < min || total > max
        ? `Choose ${min ? "at least 1 minute and " : ""}no more than ${Math.floor(max / 60)} hours${max % 60 ? ` ${max % 60} minutes` : ""}.`
        : "",
    );
  }, [parts, min, max]);
  function change(index: number, text: string) {
    const next = [...parts];
    next[index] = text;
    setParts(next);
    emitted.current =
      Math.round((Number(next[0]) * 60 + Number(next[1])) * 100) / 100;
    onChange(emitted.current);
  }
  return (
    <fieldset className="duration-field">
      <legend>
        {label}
        {optional && (
          <span className="r-meta"> Optional · 0 for no target</span>
        )}
      </legend>
      <div className="duration-parts">
        <label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            aria-label={`${label} hours`}
            min={0}
            max={Math.floor(max / 60)}
            step={1}
            value={parts[0]}
            onChange={(e) => change(0, e.target.value)}
            required
          />
          <span>hours</span>
        </label>
        <label>
          <input
            ref={minuteInput}
            className="input"
            type="number"
            inputMode={fractional ? "decimal" : "numeric"}
            aria-label={`${label} minutes`}
            min={0}
            max={fractional ? 59.99 : 59}
            step={fractional ? 0.01 : 1}
            value={parts[1]}
            onChange={(e) => change(1, e.target.value)}
            required
          />
          <span>minutes</span>
        </label>
      </div>
    </fieldset>
  );
}

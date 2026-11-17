"use client";
import { useRef, useState, useEffect } from "react";
import { useSesh } from "@/lib/store";
export function ShriName() {
  const { preferences } = useSesh();
  const [burst, setBurst] = useState(0);
  const last = useRef(-Infinity),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  function reveal() {
    if (
      preferences.reduced_motion ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      performance.now() - last.current < 2200
    )
      return;
    last.current = performance.now();
    setBurst((v) => v + 1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setBurst(0), 2000);
  }
  return (
    <span
      className="shri-name"
      tabIndex={0}
      role="button"
      aria-label="Shri — a little heart greeting"
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") reveal();
      }}
      onFocus={reveal}
      onClick={reveal}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          reveal();
        }
      }}
    >
      Shri
      {burst > 0 && (
        <span className="shri-hearts" aria-hidden="true" key={burst}>
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              style={
                {
                  "--dx": `${(i - 3.5) * 9}px`,
                  "--turn": `${(i - 4) * 7}deg`,
                  left: `${12 + i * 10}%`,
                  animationDelay: `${i * 55}ms`,
                  fontSize: `${9 + (i % 3) * 2}px`,
                  color: ["#d5a3b4", "#e4c5ba", "#f0e2cd", "#ba879b"][i % 4],
                } as React.CSSProperties
              }
            >
              ♥
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

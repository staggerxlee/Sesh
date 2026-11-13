"use client";
import {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  type CSSProperties,
} from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionValueEvent,
} from "motion/react";
import type { Topic } from "@/lib/types";
export type TopicWheelHandle = { select: (index: number) => void };

function WheelLabel({
  topic,
  index,
  position,
  selected,
  select,
}: {
  topic: Topic;
  index: number;
  position: ReturnType<typeof useMotionValue<number>>;
  selected: boolean;
  select: () => void;
}) {
  const transform = useTransform(position, (value) => {
    const offset = Math.max(-4, Math.min(4, index - value));
    const angle = offset * 0.34;
    const x = 64 - 220 * (1 - Math.cos(angle));
    return `translate(${x}px, calc(${Math.sin(angle) / 0.34} * var(--topic-step, 66px))) rotate(${offset * 10}deg) scale(${1 - Math.min(Math.abs(offset), 3) * 0.08})`;
  });
  const opacity = useTransform(position, (value) =>
    Math.max(0, 1 - Math.abs(index - value) / 2.8),
  );
  const visibility = useTransform(position, (value) =>
    Math.abs(index - value) < 2.8 ? "visible" : "hidden",
  );
  return (
    <motion.button
      className="topic-orbit-item"
      title={topic.name}
      style={{ transform, opacity, visibility }}
      aria-pressed={selected}
      tabIndex={Math.abs(index - position.get()) < 2.8 ? 0 : -1}
      onClick={select}
    >
      {topic.name}
    </motion.button>
  );
}

export const TopicWheel = forwardRef<
  TopicWheelHandle,
  {
    topics: Topic[];
    index: number;
    color: string;
    still: boolean;
    onSelect: (id: number | null) => void;
  }
>(function TopicWheel({ topics, index, color, still, onSelect }, ref) {
  const root = useRef<HTMLDivElement>(null);
  const target = useMotionValue(index);
  const spring = useSpring(target, {
    stiffness: 155,
    damping: 29,
    mass: 0.85,
    restDelta: 0.001,
    restSpeed: 0.01,
  });
  const position = still ? target : spring;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{
    id: number;
    y: number;
    time: number;
    velocity: number;
    distance: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const latest = useRef({ topics, onSelect, index });
  latest.current = { topics, onSelect, index };
  function clamp(value: number) {
    return Math.max(0, Math.min(topics.length - 1, value));
  }
  function select(value: number) {
    if (timer.current) clearTimeout(timer.current);
    target.set(clamp(Math.round(value)));
  }
  useImperativeHandle(ref, () => ({ select }));
  useMotionValueEvent(position, "change", (value) => {
    const next = Math.max(
      0,
      Math.min(latest.current.topics.length - 1, Math.round(value)),
    );
    if (next !== latest.current.index)
      latest.current.onSelect(latest.current.topics[next]?.id ?? null);
  });
  const ids = topics.map((topic) => topic.id).join(",");
  useEffect(() => {
    target.set(latest.current.index);
    spring.jump(latest.current.index);
  }, [ids, target, spring]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const count = latest.current.topics.length;
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1);
      if (
        count < 2 ||
        !delta ||
        (target.get() <= 0 && delta < 0) ||
        (target.get() >= count - 1 && delta > 0)
      )
        return;
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      target.set(Math.max(0, Math.min(count - 1, target.get() + delta / 110)));
      timer.current = setTimeout(
        () => target.set(Math.round(target.get())),
        120,
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [target]);
  function release(pointerId: number, cancelled = false) {
    const gesture = drag.current;
    if (!gesture || gesture.id !== pointerId) return;
    drag.current = null;
    root.current?.releasePointerCapture(pointerId);
    root.current?.removeAttribute("data-dragging");
    const velocity =
      performance.now() - gesture.time < 100 ? gesture.velocity : 0;
    select(
      target.get() +
        (cancelled || still
          ? 0
          : Math.max(-1.4, Math.min(1.4, velocity * 0.16))),
    );
  }
  return (
    <div
      ref={root}
      className="topic-orbit"
      role="region"
      aria-label="Choose a topic"
      tabIndex={0}
      style={
        {
          "--subject-color": color,
          touchAction:
            topics.length < 2
              ? "pan-y"
              : index === 0
                ? "pan-x pan-down"
                : index === topics.length - 1
                  ? "pan-x pan-up"
                  : "pan-x",
        } as CSSProperties
      }
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        select(
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? topics.length - 1
              : Math.round(target.get()) + (event.key === "ArrowDown" ? 1 : -1),
        );
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || topics.length < 2) return;
        if (timer.current) clearTimeout(timer.current);
        suppressClick.current = false;
        drag.current = {
          id: event.pointerId,
          y: event.clientY,
          time: performance.now(),
          velocity: 0,
          distance: 0,
        };
      }}
      onPointerMove={(event) => {
        const gesture = drag.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        const now = performance.now();
        const delta = gesture.y - event.clientY;
        gesture.distance += Math.abs(delta);
        const step =
          parseFloat(
            getComputedStyle(event.currentTarget).getPropertyValue(
              "--topic-step",
            ),
          ) || 66;
        gesture.velocity =
          delta / step / Math.max(0.008, (now - gesture.time) / 1000);
        gesture.y = event.clientY;
        gesture.time = now;
        if (gesture.distance > 4) {
          suppressClick.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          event.currentTarget.dataset.dragging = "true";
          target.set(clamp(target.get() + delta / step));
        }
      }}
      onPointerLeave={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId))
          drag.current = null;
      }}
      onLostPointerCapture={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
        drag.current = null;
        root.current?.removeAttribute("data-dragging");
      }}
      onPointerUp={(event) => release(event.pointerId)}
      onPointerCancel={(event) => release(event.pointerId, true)}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      <svg className="topic-arc" viewBox="0 0 100 360" aria-hidden="true">
        <path d="M 0 0 Q 165 180 0 360" />
      </svg>
      <span className="topic-indicator" aria-hidden="true" />
      {topics.map((topic, i) => (
        <WheelLabel
          key={topic.id}
          topic={topic}
          index={i}
          position={position}
          selected={i === index}
          select={() => select(i)}
        />
      ))}
      {!topics.length && (
        <p className="topic-empty">Room for your first topic.</p>
      )}
    </div>
  );
});

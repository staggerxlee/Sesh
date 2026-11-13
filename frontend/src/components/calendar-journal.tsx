"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type MotionValue,
} from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dayLabel } from "@/lib/utils";

const clamp = (value: number) => Math.max(0, Math.min(3, value));
function Leaf({
  index,
  position,
  selected,
  children,
  still,
}: {
  index: number;
  position: MotionValue<number>;
  selected: number;
  children: ReactNode;
  still: boolean;
}) {
  const angle = useTransform(position, (value) =>
    still ? 0 : -180 * Math.max(0, Math.min(1, value - index)),
  );
  const shade = useTransform(
    angle,
    (value) => Math.sin((Math.abs(value) * Math.PI) / 180) * 0.23,
  );
  const opacity = useTransform(position, (value) =>
    still ? (index === selected ? 1 : 0) : value - index >= 0.999 ? 0 : 1,
  );
  const zIndex = useTransform(position, (value) =>
    value > index && value < index + 1 ? 10 : 5 - index,
  );
  return (
    <motion.div
      className="journal-leaf"
      style={{ rotateY: angle, opacity, zIndex }}
      inert={selected !== index}
      aria-hidden={selected !== index}
      data-page={index + 1}
    >
      <div className="journal-face journal-front">
        <div className="journal-paper">{children}</div>
        <motion.i
          className="journal-light"
          style={{ opacity: shade }}
          aria-hidden="true"
        />
      </div>
      <div className="journal-face journal-back" aria-hidden="true">
        <span>sesh / notes</span>
        <i />
      </div>
    </motion.div>
  );
}

/** Each sheet stays mounted and turns about the binding. A single spring position
 * can be retargeted in either direction, so rapid input never queues animations. */
export function CalendarJournal({
  month,
  pages,
  still,
}: {
  month: string;
  pages: ReactNode[];
  still: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const intended = useRef(0);
  const position = useMotionValue(0);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [pageHeight, setPageHeight] = useState(170);
  // Measure the active sheet, not the tallest hidden page. Writing can expand
  // naturally while the overview retains the proportions of a short folio.
  useLayoutEffect(() => {
    const paper = stage.current?.querySelector<HTMLElement>(
      `[data-page="${selected + 1}"] .journal-paper`,
    );
    if (!paper) return;
    const measure = () => setPageHeight(Math.ceil(paper.offsetHeight));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(paper);
    return () => observer.disconnect();
  }, [selected, month]);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    origin: number;
    lastX: number;
    lastAt: number;
    velocity: number;
    horizontal: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const shadow = useTransform(
    position,
    (value) => Math.sin((value % 1) * Math.PI) * 0.32,
  );
  function settle(page: number) {
    page = clamp(page);
    intended.current = page;
    setSelected(page);
    animation.current?.stop();
    if (still) position.set(page);
    else
      animation.current = animate(position, page, {
        type: "spring",
        stiffness: 245,
        damping: 33,
        mass: 0.85,
        restDelta: 0.001,
        restSpeed: 0.01,
      });
  }
  useEffect(() => {
    animation.current?.stop();
    position.set(intended.current);
    return () => {
      animation.current?.stop();
    };
  }, [month, still, position]);
  function down(event: PointerEvent<HTMLDivElement>) {
    // Only suppress the compatibility click from the drag itself. A new press,
    // including a form control, always starts a fresh interaction.
    suppressClick.current = false;
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(
        "button,a,input,textarea,select,label",
      )
    )
      return;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: position.get(),
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocity: 0,
      horizontal: false,
    };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const dx = event.clientX - g.x,
      dy = event.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dy) > 9 && Math.abs(dy) > Math.abs(dx)) {
        gesture.current = null;
        return;
      }
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      g.horizontal = true;
      animation.current?.stop();
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    suppressClick.current = true;
    g.velocity =
      (event.clientX - g.lastX) / Math.max(1, event.timeStamp - g.lastAt);
    g.lastX = event.clientX;
    g.lastAt = event.timeStamp;
    position.set(
      clamp(
        g.origin - (dx / Math.max(1, event.currentTarget.clientWidth)) * 1.6,
      ),
    );
  }
  function release(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.horizontal) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const delta = position.get() - g.origin;
    const velocity = event.timeStamp - g.lastAt < 100 ? -g.velocity : 0;
    const direction =
      Math.abs(velocity) > 0.45
        ? Math.sign(velocity)
        : Math.abs(delta) > 0.18
          ? Math.sign(delta)
          : 0;
    settle(cancel ? intended.current : Math.round(g.origin) + direction);
  }
  return (
    <section
      className="calendar-journal journal-book"
      aria-label="Monthly journal"
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("input,textarea,select"))
          return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          settle(intended.current + (event.key === "ArrowRight" ? 1 : -1));
        }
      }}
    >
      <i className="journal-binding" aria-hidden="true" />
      <div className="journal-controls">
        <span>{dayLabel(month, { month: "long", year: "numeric" })}</span>
        <button
          aria-label="Previous journal page"
          disabled={selected === 0}
          onClick={() => settle(intended.current - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <span aria-live="polite">
          {String(selected + 1).padStart(2, "0")} / 04
        </span>
        <button
          aria-label="Next journal page"
          disabled={selected === 3}
          onClick={() => settle(intended.current + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
      <motion.div
        className="journal-stage"
        ref={stage}
        initial={false}
        animate={{ height: pageHeight }}
        transition={{ duration: still ? 0 : 0.32, ease: [0.22, 0.68, 0.18, 1] }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={(e) => release(e)}
        onPointerCancel={(e) => release(e, true)}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        <div className="journal-board" aria-hidden="true" />
        <motion.div
          className="journal-cast-shadow"
          style={{ opacity: shadow }}
          aria-hidden="true"
        />
        {pages.map((content, i) => (
          <Leaf
            key={i}
            index={i}
            position={position}
            selected={selected}
            still={still}
          >
            {content}
          </Leaf>
        ))}
      </motion.div>
    </section>
  );
}

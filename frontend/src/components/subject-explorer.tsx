"use client";
import * as Dialog from "@radix-ui/react-dialog";
import {
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import gsap from "gsap";
import { Edit3, Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { useSesh } from "@/lib/store";
import { useSystemStill } from "@/lib/navigation-motion";
import { duration } from "@/lib/utils";
import type { Subject, SubjectStat, Topic } from "@/lib/types";
import "./subjects.css";
import { TopicWheel, type TopicWheelHandle } from "./topic-wheel";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

export function SubjectCover({
  subject,
  count,
  totals,
  interactive = false,
}: {
  subject: Subject;
  count: number;
  totals?: SubjectStat;
  interactive?: boolean;
}) {
  const { preferences } = useSesh();
  const systemStill = useSystemStill();
  const enabled = interactive && !systemStill && !preferences.reduced_motion;
  const opening = useSpring(0, { stiffness: 105, damping: 24, mass: 1 });
  const pointer = useSpring(0, { stiffness: 95, damping: 24 });
  const tilt = useTransform(opening, (value) => value * -6);
  const lift = useTransform(opening, (value) => value * -4);
  const frontX = useTransform(pointer, (value) => value * 2.5);
  const rearX = useTransform(pointer, (value) => value * -0.8);
  const shadow = useTransform(
    opening,
    (value) =>
      `0 ${6 + value * 12}px ${18 + value * 20}px rgba(0,0,0,${0.12 + value * 0.16})`,
  );
  return (
    <motion.div
      className="subject-cover"
      style={{
        ...({ "--subject-color": subject.color } as CSSProperties),
        y: enabled ? lift : 0,
        boxShadow: enabled ? shadow : undefined,
      }}
      onPointerEnter={(event) => {
        if (enabled && event.pointerType !== "touch") opening.set(1);
      }}
      onPointerLeave={() => {
        opening.set(0);
        pointer.set(0);
      }}
      onPointerMove={(event) => {
        if (!enabled || event.pointerType === "touch") return;
        const rect = event.currentTarget.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
      }}
    >
      <motion.div
        className="subject-gradient"
        style={{ x: enabled ? rearX : 0 }}
      />
      <motion.div
        className="subject-folder"
        style={{ rotateX: enabled ? tilt : 0, x: enabled ? frontX : 0 }}
      >
        <motion.i
          className="folder-sheen"
          aria-hidden="true"
          style={{
            opacity: opening,
            x: useTransform(opening, [0, 1], ["-70%", "70%"]),
          }}
        />
        <span className="subject-hours">
          {duration(totals?.seconds || 0)} <small>last 30 days</small>
        </span>
        <h2>{subject.name}</h2>
        <span className="subject-count">
          <strong>{String(count).padStart(2, "0")}</strong> Topics
        </span>
      </motion.div>
    </motion.div>
  );
}

export function SubjectExplorer({
  subject,
  topics,
  totals,
  origin,
  onClose,
  onRename,
  onDelete,
  children,
}: {
  subject: Subject;
  topics: Topic[];
  totals?: SubjectStat;
  origin: HTMLElement | null;
  onClose: () => void;
  onRename: (topic: Topic) => void;
  onDelete: (topic: Topic) => void;
  children: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const attachCard = useCallback((node: HTMLDivElement | null) => {
    card.current = node;
    setReady(!!node);
  }, []);
  const wheel = useRef<TopicWheelHandle>(null);
  const layer = useRef<HTMLDivElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [closing, setClosing] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(
    topics[0]?.id ?? null,
  );
  const { preferences } = useSesh();
  const systemStill = useSystemStill();
  const still = systemStill || preferences.reduced_motion;
  const index = Math.max(
    0,
    topics.findIndex((topic) => topic.id === selectedId),
  );
  const current = topics[index];

  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  useLayoutEffect(() => {
    const target = card.current;
    if (!target) return;
    const source = origin?.isConnected
      ? origin.getBoundingClientRect()
      : undefined;
    const destination = target.getBoundingClientRect();
    const context = gsap.context(() => {
      const tl = gsap.timeline({
        onReverseComplete: () => closeCallback.current(),
      });
      tl.fromTo(
        document.documentElement,
        { "--subject-blur": "0px" },
        { "--subject-blur": "9px", duration: still ? 0 : 0.45 },
        0,
      );
      tl.fromTo(
        target,
        {
          x: source ? source.x - destination.x : 0,
          y: source ? source.y - destination.y : 0,
          scaleX: source ? source.width / destination.width : 1,
          scaleY: source ? source.height / destination.height : 1,
        },
        {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          duration: still ? 0 : 0.55,
          ease: "power3.inOut",
        },
        0,
      );
      tl.fromTo(
        ".subject-explorer-backdrop",
        { opacity: 0 },
        { opacity: 1, duration: still ? 0 : 0.45 },
        0,
      );
      tl.fromTo(
        ".subject-explorer-detail",
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: still ? 0 : 0.3 },
        still ? 0 : 0.2,
      );
      timeline.current = tl;
    }, layer);
    return () => context.revert();
  }, [origin, still, ready]);
  useLayoutEffect(() => {
    if (!closing) return;
    if (still || !timeline.current?.time()) closeCallback.current();
    else {
      timeline.current.pause();
      const target = card.current;
      const source = origin?.isConnected
        ? origin.getBoundingClientRect()
        : undefined;
      if (!target) {
        closeCallback.current();
        return;
      }
      if (!source || !source.width) {
        const fade = gsap.to(layer.current, {
          opacity: 0,
          duration: 0.25,
          onComplete: () => closeCallback.current(),
        });
        return () => {
          fade.kill();
        };
      }
      const rect = target.getBoundingClientRect();
      const exit = gsap.timeline({ onComplete: () => closeCallback.current() });
      exit.to(
        target,
        {
          x: source.x - rect.x + Number(gsap.getProperty(target, "x")),
          y: source.y - rect.y + Number(gsap.getProperty(target, "y")),
          scaleX: source.width / target.offsetWidth,
          scaleY: source.height / target.offsetHeight,
          duration: 0.42,
          ease: "power3.inOut",
        },
        0,
      );
      exit.to(
        document.documentElement,
        { "--subject-blur": "0px", duration: 0.42 },
        0,
      );
      exit.to(
        layer.current?.querySelectorAll(
          ".subject-explorer-backdrop, .subject-explorer-detail",
        ) || [],
        { opacity: 0, duration: 0.25 },
        0,
      );
      return () => {
        exit.kill();
      };
    }
  }, [closing, still, origin]);
  function move(delta: number) {
    wheel.current?.select(index + delta);
  }
  return (
    <Dialog.Root
      open
      onOpenChange={(value) => {
        if (!value) setClosing(true);
      }}
    >
      <Dialog.Portal>
        <div
          ref={layer}
          className="subject-explorer-layer"
          data-closing={closing || undefined}
        >
          <Dialog.Overlay className="subject-explorer-backdrop" />
          <Dialog.Content
            className="subject-explorer"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              origin?.focus({ preventScroll: true });
            }}
          >
            <Dialog.Title className="sr-only">
              Inside {subject.name}
            </Dialog.Title>
            <button
              className="subject-explorer-close"
              aria-label="Close subject"
              onClick={() => setClosing(true)}
            >
              <X size={22} />
            </button>
            <div ref={attachCard} className="subject-expanded-card">
              <SubjectCover
                subject={subject}
                count={topics.length}
                totals={totals}
              />
            </div>
            <div className="subject-explorer-detail">
              <TopicWheel
                ref={wheel}
                topics={topics}
                index={index}
                color={subject.color}
                still={still}
                onSelect={setSelectedId}
              />
              <div className="topic-current" aria-live="polite">
                {current && (
                  <>
                    <motion.span
                      key={current.id}
                      initial={{ opacity: still ? 1 : 0.35 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.22 }}
                    >
                      {duration(
                        totals?.topics.find((topic) => topic.id === current.id)
                          ?.seconds || 0,
                      )}{" "}
                      last 30 days
                    </motion.span>
                    <button
                      aria-label={`Rename ${current.name}`}
                      onClick={() => onRename(current)}
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      aria-label={`Delete ${current.name}`}
                      onClick={() => onDelete(current)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                <button
                  aria-label="Previous topic"
                  disabled={!topics.length || index === 0}
                  onClick={() => move(-1)}
                >
                  <ChevronUp size={18} />
                </button>
                <button
                  aria-label="Next topic"
                  disabled={!topics.length || index === topics.length - 1}
                  onClick={() => move(1)}
                >
                  <ChevronDown size={18} />
                </button>
              </div>
              <div className="topic-editor">{children}</div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

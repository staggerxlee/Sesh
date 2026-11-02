"use client";
import { useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { editorialEase } from "@/lib/navigation-motion";

type Change = {
  current: string;
  leaving: string | null;
  visited: Set<string>;
  firstVisit: boolean;
  homeEdge: boolean;
};
// The two keyed siblings keep their actual React instances during a handoff.
// A newer request takes over from the current layer, including mid-animation.
export function RouteStage({
  page,
  render,
  still,
}: {
  page: string;
  render: (page: string) => ReactNode;
  still: boolean;
}) {
  const reduced = still;
  const [change, setChange] = useState<Change>(() => ({
    current: page,
    leaving: null,
    visited: new Set([page]),
    firstVisit: false,
    homeEdge: false,
  }));
  if (change.current !== page) {
    setChange({
      current: page,
      leaving: reduced ? null : change.current,
      firstVisit: !change.visited.has(page),
      visited: new Set([...change.visited, page]),
      homeEdge: [change.current, page].includes("home"),
    });
  }
  const duration = reduced ? 0 : change.homeEdge ? 0.38 : 0.26;
  return (
    <main id="main" className="route-stage" tabIndex={-1}>
      {[change.leaving, change.current]
        .filter((key): key is string => !!key)
        .map((key) => {
          const leaving = key !== change.current;
          const travel = change.homeEdge ? 8 : 4;
          return (
            <motion.div
              key={key}
              className="route-layer"
              data-route={key}
              data-leaving={leaving || undefined}
              data-first-entry={
                (!leaving && change.firstVisit && !reduced) || undefined
              }
              inert={leaving}
              aria-hidden={leaving || undefined}
              initial={
                change.leaving && !reduced ? { opacity: 0, y: travel } : false
              }
              animate={{
                opacity: leaving ? 0 : 1,
                y: reduced ? 0 : leaving ? -travel / 2 : 0,
              }}
              transition={{
                duration: leaving ? duration * 0.72 : duration,
                ease: editorialEase,
              }}
              onAnimationComplete={() => {
                if (leaving)
                  setChange((latest) =>
                    latest === change ? { ...latest, leaving: null } : latest,
                  );
              }}
            >
              {render(key)}
            </motion.div>
          );
        })}
    </main>
  );
}

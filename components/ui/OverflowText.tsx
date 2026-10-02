"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./overflow-text.module.css";

/**
 * One line of text that ellipsizes when it doesn't fit, then glides to reveal
 * the rest: on hover for a mouse, on tap for touch (out, hold, back — nothing
 * hover-only on phones, docs/DESIGN.md). The full string stays in the DOM for
 * screen readers and copy. Reduced motion unwraps in place instead of moving.
 */

const PX_PER_SECOND = 60;
const MIN_DURATION_MS = 600;
const MAX_DURATION_MS = 4000;
const START_DELAY_MS = 250;
const TOUCH_HOLD_MS = 1200;

type Phase = "rest" | "reveal" | "return";

export interface OverflowTextProps {
  text: string;
  className?: string;
}

export function OverflowText({ text, className }: OverflowTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const pointerType = useRef("mouse");
  const holdTimer = useRef<number | undefined>(undefined);
  const [overflow, setOverflow] = useState(0);
  const [phase, setPhase] = useState<Phase>("rest");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setOverflow(Math.max(0, root.scrollWidth - root.clientWidth));
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    // Satoshi swaps in after first paint and changes the text width.
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => () => window.clearTimeout(holdTimer.current), []);

  const duration = Math.min(
    MAX_DURATION_MS,
    Math.max(MIN_DURATION_MS, (overflow / PX_PER_SECOND) * 1000),
  );

  const reveal = () => {
    if (overflow === 0) return;
    window.clearTimeout(holdTimer.current);
    setPhase("reveal");
  };

  // Glide back only if the text actually moved (a quick hover may leave
  // during the start delay) — otherwise drop straight back to the ellipsis.
  const settle = () => {
    window.clearTimeout(holdTimer.current);
    const node = textRef.current;
    const moved = node ? new DOMMatrixReadOnly(getComputedStyle(node).transform).m41 !== 0 : false;
    setPhase(moved ? "return" : "rest");
  };

  const onReturnEnd = () => {
    if (phase === "return") setPhase("rest");
  };

  return (
    <span
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-phase={phase}
      style={
        {
          "--overflow-distance": `${overflow}px`,
          "--overflow-duration": `${duration}ms`,
          "--overflow-delay": `${START_DELAY_MS}ms`,
        } as CSSProperties
      }
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") reveal();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") settle();
      }}
      onClick={() => {
        if (pointerType.current === "mouse" || overflow === 0) return;
        if (phase === "reveal") {
          settle();
          return;
        }
        reveal();
        holdTimer.current = window.setTimeout(settle, START_DELAY_MS + duration + TOUCH_HOLD_MS);
      }}
      onTransitionEnd={onReturnEnd}
      onTransitionCancel={onReturnEnd}
    >
      <span ref={textRef} className={styles.text}>
        {text}
      </span>
    </span>
  );
}

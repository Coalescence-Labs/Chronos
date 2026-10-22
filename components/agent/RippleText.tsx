"use client";

/**
 * Streaming text with a color-wave highlight (Nebulae / Organic LLM RippleText).
 * Characters land in the base foreground; newly appended runs burn from the
 * stream highlight color back to inherited text color.
 *
 * Chronos settings: ~10ms stagger per new character, 140ms color transition.
 * Highlight token: `--agent-stream-highlight` (ember in dark, accent in light).
 */

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import styles from "./agent.module.css";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

export const AGENT_RIPPLE_MS_PER_CHAR = 10;
export const AGENT_RIPPLE_TRANSITION_MS = 140;

interface AgentRippleTextProps {
  text: string;
  /** When true, newly appended characters get the highlight wave. */
  active?: boolean;
  className?: string;
}

export function AgentRippleText({
  text,
  active = true,
  className,
}: AgentRippleTextProps) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
  const prevLengthRef = useRef(0);
  const [highlightStart, setHighlightStart] = useState<number | null>(null);

  useEffect(() => {
    if (!active || reducedMotion) {
      prevLengthRef.current = text.length;
      setHighlightStart(null);
      return;
    }
    if (text.length > prevLengthRef.current) {
      const start = prevLengthRef.current;
      prevLengthRef.current = text.length;
      setHighlightStart(start);
      return;
    }
    if (text.length < prevLengthRef.current) {
      prevLengthRef.current = text.length;
      setHighlightStart(null);
    }
  }, [text, active, reducedMotion]);

  const rootClass = [styles.assistantStreaming, styles.rippleRoot, className]
    .filter(Boolean)
    .join(" ");

  if (reducedMotion || !active) {
    return <p className={rootClass}>{text}</p>;
  }

  const characters = text.split("");

  return (
    <p
      className={rootClass}
      aria-label={text}
      style={
        {
          ["--ripple-speed"]: `${AGENT_RIPPLE_MS_PER_CHAR}ms`,
          ["--ripple-transition-duration"]: `${AGENT_RIPPLE_TRANSITION_MS}ms`,
        } as CSSProperties
      }
    >
      {characters.map((char, idx) => {
        const isHighlighted =
          highlightStart !== null && idx >= highlightStart && idx < text.length;
        const staggerMs = isHighlighted ? (idx - highlightStart) * AGENT_RIPPLE_MS_PER_CHAR : 0;

        return (
          <span
            key={idx}
            aria-hidden="true"
            className={
              isHighlighted ? styles.rippleCharHighlighted : styles.rippleChar
            }
            style={
              isHighlighted
                ? ({
                    ["--ripple-transition-delay"]: `${staggerMs}ms`,
                  } as CSSProperties)
                : undefined
            }
          >
            {char}
          </span>
        );
      })}
    </p>
  );
}

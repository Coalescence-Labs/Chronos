"use client";

/**
 * Streaming text with a color-wave highlight (Nebulae / Organic LLM RippleText).
 * Characters land in the base foreground; newly appended runs burn from the
 * stream highlight color back to inherited text color.
 *
 * Chronos settings: ~10ms stagger per new character, 140ms color transition.
 * Highlight token: `--agent-stream-highlight` (ember in dark, accent in light).
 */

import { useState, useSyncExternalStore, type CSSProperties } from "react";
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

type RippleTrack = { len: number; start: number | null };

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
  const [track, setTrack] = useState<RippleTrack>({ len: 0, start: null });

  // Adjust highlight window while rendering when the streamed text grows/shrinks
  // (avoids setState-in-effect; React re-renders once when track changes).
  let highlightStart = track.start;
  if (!active || reducedMotion) {
    if (track.start !== null || track.len !== text.length) {
      setTrack({ len: text.length, start: null });
    }
    highlightStart = null;
  } else if (text.length > track.len) {
    const start = track.len;
    setTrack({ len: text.length, start });
    highlightStart = start;
  } else if (text.length < track.len) {
    setTrack({ len: text.length, start: null });
    highlightStart = null;
  }

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
        const start = highlightStart;
        const isHighlighted = start !== null && idx >= start && idx < text.length;
        const staggerMs = isHighlighted ? (idx - start) * AGENT_RIPPLE_MS_PER_CHAR : 0;

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

"use client";

import { useEffect, useRef } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

/**
 * Fires a single analytics event once when mounted — for view-type events on
 * server-rendered routes (e.g. demo_view on /demo) where there's no existing
 * client handler to hang the emit off. Renders nothing.
 */
export function TrackMount({ event }: { event: AnalyticsEvent }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return; // guard StrictMode's double-invoke
    fired.current = true;
    track(event);
  }, [event]);
  return null;
}

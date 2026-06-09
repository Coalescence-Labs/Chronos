"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import {
  Button,
  EmptyState,
  ErrorState,
  InspectionSurface,
  LoadingState,
  Surface,
} from "@/components/ui";
import styles from "./styleguide.module.css";

/**
 * Living styleguide: every primitive in one place, for eyeballing polish and
 * running manual gates (contrast, touch targets, reduced motion, Lighthouse).
 * Not linked from the product UI — visit /styleguide directly.
 */

const COLOR_TOKENS = [
  "--bg",
  "--bg-elevated",
  "--bg-raised",
  "--fg",
  "--fg-muted",
  "--fg-subtle",
  "--accent",
  "--accent-2",
  "--success",
  "--warning",
  "--danger",
];

const TYPE_SCALE = ["--text-xs", "--text-sm", "--text-base", "--text-lg", "--text-xl", "--text-2xl", "--text-3xl"];

export default function Styleguide() {
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <AppShell>
      <div className={styles.page}>
        <section className={styles.section} aria-labelledby="sg-color">
          <h2 id="sg-color" className={styles.sectionTitle}>
            Color tokens
          </h2>
          <div className={styles.swatches}>
            {COLOR_TOKENS.map((token) => (
              <div key={token} className={styles.swatch}>
                <div className={styles.swatchChip} style={{ background: `var(${token})` }} />
                <code>{token}</code>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sg-type">
          <h2 id="sg-type" className={styles.sectionTitle}>
            Type scale — Satoshi
          </h2>
          {TYPE_SCALE.map((token) => (
            <p key={token} className={styles.typeSample} style={{ fontSize: `var(${token})` }}>
              Understanding per glance <code>{token}</code>
            </p>
          ))}
        </section>

        <section className={styles.section} aria-labelledby="sg-buttons">
          <h2 id="sg-buttons" className={styles.sectionTitle}>
            Buttons
          </h2>
          <div className={styles.row}>
            <Button>Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
            <Button variant="ghost" onClick={() => setInspectorOpen(true)}>
              Open inspector
            </Button>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sg-surfaces">
          <h2 id="sg-surfaces" className={styles.sectionTitle}>
            Surfaces
          </h2>
          <div className={styles.row}>
            <Surface level={1}>Level 1 — resting</Surface>
            <Surface level={2}>Level 2 — raised</Surface>
            <Surface level={3}>Level 3 — floating</Surface>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="sg-states">
          <h2 id="sg-states" className={styles.sectionTitle}>
            States
          </h2>
          <Surface padded={false}>
            <LoadingState />
          </Surface>
          <Surface padded={false}>
            <EmptyState
              title="No repo yet"
              hint="Paste a public GitHub URL to draw its branch graph."
            />
          </Surface>
          <Surface padded={false}>
            <ErrorState
              message="GitHub's rate limit was reached. Please try again in a few minutes."
              onRetry={() => setInspectorOpen(false)}
            />
          </Surface>
        </section>
      </div>

      <InspectionSurface
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        title="Inspector"
      >
        <p>
          On a laptop this is a side panel; below 880px it becomes a bottom
          sheet. Same content, same component.
        </p>
        <Button variant="ghost" onClick={() => setInspectorOpen(false)}>
          Close
        </Button>
      </InspectionSurface>
    </AppShell>
  );
}

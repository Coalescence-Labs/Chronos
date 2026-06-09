import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "@/components/shell/AppShell";
import {
  Button,
  EmptyState,
  ErrorState,
  InspectionSurface,
  LoadingState,
  Surface,
} from "@/components/ui";

describe("ui primitives", () => {
  test("Button defaults to type=button and renders every variant", () => {
    const html = renderToStaticMarkup(<Button>Go</Button>);
    expect(html).toContain('type="button"');
    for (const variant of ["primary", "ghost", "danger"] as const) {
      expect(renderToStaticMarkup(<Button variant={variant}>x</Button>)).toContain(">x</button>");
    }
    expect(renderToStaticMarkup(<Button disabled>x</Button>)).toContain("disabled");
  });

  test("Surface renders children at every level", () => {
    for (const level of [1, 2, 3] as const) {
      expect(renderToStaticMarkup(<Surface level={level}>content</Surface>)).toContain("content");
    }
  });

  test("LoadingState announces via role=status with a text label", () => {
    const html = renderToStaticMarkup(<LoadingState />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Reading history…");
  });

  test("EmptyState renders title, hint, and action", () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No repo yet" hint="Paste a URL." action={<Button>Paste</Button>} />,
    );
    expect(html).toContain("No repo yet");
    expect(html).toContain("Paste a URL.");
    expect(html).toContain('type="button"');
  });

  test("ErrorState announces via role=alert and offers retry", () => {
    const html = renderToStaticMarkup(
      <ErrorState message="Rate limited." onRetry={() => {}} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Rate limited.");
    expect(html).toContain("Try again");
  });

  test("InspectionSurface is a labelled complementary region with a close control", () => {
    const open = renderToStaticMarkup(
      <InspectionSurface open onClose={() => {}} title="Commit details">
        body
      </InspectionSurface>,
    );
    expect(open).toContain('role="complementary"');
    expect(open).toContain('aria-label="Commit details"');
    expect(open).toContain('aria-label="Close inspector"');
    expect(open).toContain('data-open="true"');

    const closed = renderToStaticMarkup(
      <InspectionSurface open={false} onClose={() => {}} title="Commit details">
        body
      </InspectionSurface>,
    );
    expect(closed).toContain('aria-hidden="true"');
    expect(closed).toContain('tabindex="-1"');
  });

  test("AppShell provides a skip link and a main landmark", () => {
    const html = renderToStaticMarkup(<AppShell>graph</AppShell>);
    expect(html).toContain("Skip to content");
    expect(html).toContain('id="main"');
    expect(html).toContain("<main");
    expect(html).toContain("Chronos");
  });
});

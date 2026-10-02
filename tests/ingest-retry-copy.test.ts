import { describe, expect, test } from "bun:test";
import { formatRetryAfterCopy, formatRetryWait } from "@/lib/ingest/errors";

describe("rate-limit wait copy (COA-210)", () => {
  test("formats short waits in seconds", () => {
    expect(formatRetryWait(1)).toBe("about 1 second");
    expect(formatRetryWait(45)).toBe("about 45 seconds");
    expect(formatRetryWait(0.2)).toBe("about 1 second");
    expect(formatRetryAfterCopy(60)).toBe("Try again in about 60 seconds.");
  });

  test("formats longer waits in minutes", () => {
    expect(formatRetryWait(90)).toBe("about 2 minutes");
    expect(formatRetryWait(120)).toBe("about 2 minutes");
    expect(formatRetryWait(59)).toBe("about 59 seconds");
    expect(formatRetryAfterCopy(180)).toBe("Try again in about 3 minutes.");
  });
});

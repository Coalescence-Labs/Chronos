import { afterEach, describe, expect, test } from "bun:test";
import { isAuthConfigured } from "@/lib/auth";

const ENV_KEYS = [
  "WORKOS_CLIENT_ID",
  "WORKOS_API_KEY",
  "WORKOS_COOKIE_PASSWORD",
  "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

const saved: Partial<Record<EnvKey, string | undefined>> = {};

const FULL_CONFIG: Record<EnvKey, string> = {
  WORKOS_CLIENT_ID: "client_test",
  WORKOS_API_KEY: "sk_test",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  NEXT_PUBLIC_WORKOS_REDIRECT_URI: "http://localhost:3005/callback",
};

function snapshotEnv() {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
}

function restoreEnv() {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function applyFullConfig() {
  for (const key of ENV_KEYS) {
    process.env[key] = FULL_CONFIG[key];
  }
}

afterEach(() => {
  restoreEnv();
});

describe("isAuthConfigured all-or-none", () => {
  test("true only when every required var is present", () => {
    snapshotEnv();
    applyFullConfig();
    expect(isAuthConfigured()).toBe(true);
  });

  for (const missing of ENV_KEYS) {
    test(`false when ${missing} alone is missing`, () => {
      snapshotEnv();
      applyFullConfig();
      delete process.env[missing];
      expect(isAuthConfigured()).toBe(false);
    });
  }

  test("false when cookie password is present but shorter than 32 chars", () => {
    snapshotEnv();
    applyFullConfig();
    process.env.WORKOS_COOKIE_PASSWORD = "short";
    expect(isAuthConfigured()).toBe(false);
  });
});

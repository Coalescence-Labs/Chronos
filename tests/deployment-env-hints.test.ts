import { describe, expect, test } from "bun:test";
import { agentMissingEnvVarNames } from "@/lib/agent/config";
import { githubAppMissingEnvVarNames } from "@/lib/github-app/config";
import {
  devOnlyMissingEnvVarNames,
  isChronosDevelopment,
  stripDevMissingEnvVarNames,
} from "@/lib/env/deployment";
import {
  publicGitHubConnectionForResponse,
  toPublicGitHubConnection,
} from "@/lib/github-app/session";

const mutableEnv = process.env as Record<string, string | undefined>;

function setNodeEnv(value: string | undefined) {
  if (value === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = value;
}

describe("Chronos development env hints", () => {
  test("isChronosDevelopment honors ENV=development and NODE_ENV=development", () => {
    const previous = {
      ENV: process.env.ENV,
      NODE_ENV: process.env.NODE_ENV,
    };
    delete process.env.ENV;
    setNodeEnv("development");
    try {
      expect(isChronosDevelopment()).toBe(true);
      process.env.ENV = "development";
      setNodeEnv("production");
      expect(isChronosDevelopment()).toBe(true);
      delete process.env.ENV;
      setNodeEnv("production");
      expect(isChronosDevelopment()).toBe(false);
    } finally {
      if (previous.ENV === undefined) delete process.env.ENV;
      else process.env.ENV = previous.ENV;
      setNodeEnv(previous.NODE_ENV);
    }
  });

  test("production responses never include missingEnvVars", () => {
    const previous = {
      ENV: process.env.ENV,
      NODE_ENV: process.env.NODE_ENV,
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
      GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
      GITHUB_SESSION_PASSWORD: process.env.GITHUB_SESSION_PASSWORD,
      GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
      GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
    };
    delete process.env.ENV;
    setNodeEnv("production");
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_SLUG;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_SESSION_PASSWORD;
    delete process.env.GITHUB_APP_CLIENT_ID;
    delete process.env.GITHUB_APP_CLIENT_SECRET;
    try {
      expect(githubAppMissingEnvVarNames().length).toBeGreaterThan(0);
      expect(devOnlyMissingEnvVarNames(githubAppMissingEnvVarNames())).toBeUndefined();
      const body = publicGitHubConnectionForResponse(toPublicGitHubConnection(undefined));
      expect(body.configured).toBe(false);
      expect(body.missingEnvVars).toBeUndefined();
      expect(stripDevMissingEnvVarNames({ missingEnvVars: ["GITHUB_APP_SLUG"] }).missingEnvVars).toBeUndefined();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test("development lists unset GitHub App and Agent env names", () => {
    const previous = {
      ENV: process.env.ENV,
      NODE_ENV: process.env.NODE_ENV,
      GITHUB_APP_ID: process.env.GITHUB_APP_ID,
      GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
      GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
      GITHUB_SESSION_PASSWORD: process.env.GITHUB_SESSION_PASSWORD,
      GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
      GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    };
    process.env.ENV = "development";
    setNodeEnv("production");
    delete process.env.GITHUB_APP_ID;
    process.env.GITHUB_APP_SLUG = "chronos";
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_SESSION_PASSWORD;
    delete process.env.GITHUB_APP_CLIENT_ID;
    delete process.env.GITHUB_APP_CLIENT_SECRET;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      const githubMissing = githubAppMissingEnvVarNames();
      expect(githubMissing).toEqual([
        "GITHUB_APP_ID",
        "GITHUB_APP_CLIENT_ID",
        "GITHUB_APP_CLIENT_SECRET",
        "GITHUB_APP_PRIVATE_KEY",
        "GITHUB_SESSION_PASSWORD",
      ]);
      expect(agentMissingEnvVarNames()).toEqual(["AI_GATEWAY_API_KEY"]);
      const body = toPublicGitHubConnection(undefined);
      expect(body.missingEnvVars).toEqual(githubMissing);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

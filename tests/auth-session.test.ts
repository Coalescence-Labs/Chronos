import { describe, expect, test } from "bun:test";
import {
  AUTH_COOKIE_POSTURE,
  assertNoSecretsInPublicSession,
  sessionCookieLooksHardened,
  toPublicSession,
  toPublicUser,
} from "@/lib/auth";

const sampleUser = {
  id: "user_01EXAMPLE",
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  emailVerified: true,
  profilePictureUrl: null as string | null,
};

describe("auth public session helpers", () => {
  test("toPublicUser allowlists identity fields only", () => {
    const pub = toPublicUser(sampleUser);
    expect(pub).toEqual({
      id: "user_01EXAMPLE",
      email: "ada@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      emailVerified: true,
      profilePictureUrl: null,
    });
    expect(Object.keys(pub).sort()).toEqual([
      "email",
      "emailVerified",
      "firstName",
      "id",
      "lastName",
      "profilePictureUrl",
    ]);
  });

  test("toPublicSession marks anonymous when user is null", () => {
    expect(toPublicSession(null)).toEqual({ authenticated: false, user: null });
    expect(toPublicSession(undefined)).toEqual({ authenticated: false, user: null });
  });

  test("toPublicSession never embeds token-like keys", () => {
    const session = toPublicSession(sampleUser);
    expect(session.authenticated).toBe(true);
    assertNoSecretsInPublicSession(session);
    const blob = JSON.stringify(session);
    expect(blob).not.toMatch(/accessToken|refreshToken|sk_/i);
  });

  test("assertNoSecretsInPublicSession rejects token leakage", () => {
    expect(() =>
      assertNoSecretsInPublicSession({
        authenticated: true,
        user: sampleUser,
        // @ts-expect-error intentional leak for the guard
        accessToken: "leak",
      }),
    ).toThrow(/secrets/i);
  });

  test("session cookie posture helper requires HttpOnly + SameSite=Lax", () => {
    expect(
      sessionCookieLooksHardened(
        "wos-session=abc; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800",
      ),
    ).toBe(true);
    expect(sessionCookieLooksHardened("wos-session=abc; Path=/; SameSite=Lax")).toBe(false);
    expect(sessionCookieLooksHardened("wos-session=abc; Path=/; HttpOnly; SameSite=None")).toBe(
      false,
    );
  });

  test("documented cookie posture matches BFF decision #7", () => {
    expect(AUTH_COOKIE_POSTURE.httpOnly).toBe(true);
    expect(AUTH_COOKIE_POSTURE.sameSite).toBe("lax");
    expect(AUTH_COOKIE_POSTURE.recommendedMaxAgeSeconds).toBe(604800);
  });
});

import { describe, expect, test } from "bun:test";
import { coordinateGitHubRefresh } from "@/lib/github-app/coordination";

describe("GitHub credential refresh coordination", () => {
  test("concurrent and slightly delayed requests share one rotation", async () => {
    let calls = 0;
    const rotate = async () => { calls++; await Promise.resolve(); return { userAccessToken: "ghu_rotated_fake" }; };
    const tokens = await Promise.all(Array.from({ length: 25 }, () => coordinateGitHubRefresh("user_a", "refresh_a", rotate)));
    expect(calls).toBe(1); expect(tokens.every((token) => token.userAccessToken === "ghu_rotated_fake")).toBe(true);
    await coordinateGitHubRefresh("user_a", "refresh_a", rotate);
    expect(calls).toBe(1);
  });
  test("another user never receives cached credentials", async () => {
    const first = await coordinateGitHubRefresh("user_b", "shared_fake", async () => ({ userAccessToken: "ghu_first_fake" }));
    const second = await coordinateGitHubRefresh("user_c", "shared_fake", async () => ({ userAccessToken: "ghu_second_fake" }));
    expect(first.userAccessToken).not.toBe(second.userAccessToken);
  });
  test("failed rotations can be retried after a provider outage", async () => {
    await expect(coordinateGitHubRefresh("user_d", "refresh_d", async () => { throw new Error("temporary"); })).rejects.toThrow("temporary");
    expect(await coordinateGitHubRefresh("user_d", "refresh_d", async () => ({ userAccessToken: "ghu_recovered_fake" })))
      .toEqual({ userAccessToken: "ghu_recovered_fake" });
  });
});

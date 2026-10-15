import { describe, expect, test } from "bun:test";
import { GlanceWorkerClient, type GlanceWorkerPort } from "@/components/repo/glance-worker-client";
import type { GlanceRequest, GlanceResponse } from "@/components/repo/glance-worker-protocol";
import { demoHistory } from "@/lib/demo/history";
import { applyGlance, canApplyGlance } from "@/lib/graph";
import { linear } from "./fixtures/history";

const FLAGS = { hideMergedIntoDefault: true, collapseMergedIntoNonDefault: true };

class FakeWorker implements GlanceWorkerPort {
  onmessage: GlanceWorkerPort["onmessage"] = null;
  onerror: GlanceWorkerPort["onerror"] = null;
  onmessageerror: GlanceWorkerPort["onmessageerror"] = null;
  requests: GlanceRequest[] = [];
  terminated = false;
  postMessage(request: GlanceRequest) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  reply(response: GlanceResponse) { this.onmessage?.({ data: response } as MessageEvent<GlanceResponse>); }
}

describe("Glance availability", () => {
  test("matches the transform's default-branch resolution, including unloaded tips", () => {
    const history = demoHistory();
    const custom = linear(3);
    custom.refs = [{ name: "release", type: "branch", sha: "c0" }];
    const missing = { ...custom, refs: [{ name: "HEAD", type: "head" as const, sha: "missing" }] };
    for (const [model, name] of [[history, undefined], [history, "develop"], [custom, "release"], [custom, undefined], [missing, undefined]] as const) {
      expect(canApplyGlance(model, name)).toBe(applyGlance(model, FLAGS, name).applied);
    }
  });
});

describe("Glance worker", () => {
  test("real worker preserves topology and capsule Maps without mutating the input", async () => {
    const client = new GlanceWorkerClient(() =>
      new Worker(new URL("../components/repo/glance.worker.ts", import.meta.url), { type: "module" }),
    );
    try {
      const history = demoHistory();
      const before = structuredClone(history);
      const result = await client.calculate(history, "main");
      expect(result).toEqual(applyGlance(history, FLAGS, "main"));
      expect(result.capsules).toBeInstanceOf(Map);
      expect(result.capsules.size).toBeGreaterThan(0);
      expect(history).toEqual(before);
      expect(await client.calculate(history, "develop")).toEqual(applyGlance(history, FLAGS, "develop"));
    } finally {
      client.dispose();
    }
  });

  test("reuses only the current snapshot and branch, and releases resources on disposal", async () => {
    const worker = new FakeWorker();
    let created = 0;
    const client = new GlanceWorkerClient(() => { created++; return worker; });
    expect(created).toBe(0);
    const history = demoHistory();
    const result = applyGlance(history, FLAGS, "main");
    const pending = client.calculate(history, "main");
    worker.reply({ generation: worker.requests[0]!.generation, result });
    expect(await pending).toEqual(result);
    expect(await client.calculate(history, "main")).toBe(result);
    expect(worker.requests).toHaveLength(1);
    const refreshed = structuredClone(history);
    const next = client.calculate(refreshed, "main");
    worker.reply({ generation: worker.requests[1]!.generation, result });
    await next;
    expect(worker.requests).toHaveLength(2);
    client.dispose();
    expect(worker.terminated).toBe(true);
  });

  test("terminates superseded work and ignores late replies and old generations", async () => {
    const workers: FakeWorker[] = [];
    const client = new GlanceWorkerClient(() => {
      const worker = new FakeWorker(); workers.push(worker); return worker;
    });
    const history = demoHistory();
    const obsolete = client.calculate(history).catch((error: Error) => error);
    const oldWorker = workers[0]!;
    const oldReply = oldWorker.onmessage!;
    const pending = client.calculate(linear(5));
    expect(oldWorker.terminated).toBe(true);
    expect(await obsolete).toHaveProperty("name", "AbortError");
    oldReply({ data: { generation: oldWorker.requests[0]!.generation, failed: true } } as MessageEvent<GlanceResponse>);
    const currentWorker = workers[1]!;
    currentWorker.reply({ generation: oldWorker.requests[0]!.generation, failed: true });
    const result = applyGlance(linear(5), FLAGS);
    currentWorker.reply({ generation: currentWorker.requests[0]!.generation, result });
    expect(await pending).toEqual(result);
    client.dispose();
  });

  test("cancellation cannot apply a result after the view is turned off", async () => {
    const worker = new FakeWorker();
    const client = new GlanceWorkerClient(() => worker);
    const pending = client.calculate(demoHistory()).catch((error: Error) => error);
    client.cancel();
    worker.reply({ generation: worker.requests[0]!.generation, result: applyGlance(demoHistory(), FLAGS) });
    expect(await pending).toHaveProperty("name", "AbortError");
    expect(worker.terminated).toBe(true);
    client.dispose();
  });

  test("construction, postMessage, computation and decoding failures reject cleanly and can retry", async () => {
    for (const mode of ["construction", "post", "compute", "error", "decode"] as const) {
      const worker = new FakeWorker();
      let attempts = 0;
      const client = new GlanceWorkerClient(() => {
        if (attempts++ === 0 && mode === "construction") throw new Error("Unavailable");
        return worker;
      });
      if (mode === "post") worker.postMessage = () => { throw new Error("Cannot clone"); };
      const pending = client.calculate(demoHistory()).catch((error: Error) => error);
      if (mode === "compute") worker.reply({ generation: worker.requests[0]!.generation, failed: true });
      if (mode === "error") worker.onerror?.({ preventDefault() {} } as ErrorEvent);
      if (mode === "decode") worker.onmessageerror?.({} as MessageEvent);
      expect(await pending).toHaveProperty("message", "Couldn't apply Glance. Try again.");
      worker.postMessage = (request) => worker.requests.push(request);
      const retry = client.calculate(linear(2));
      worker.reply({ generation: worker.requests.at(-1)!.generation, result: applyGlance(linear(2), FLAGS) });
      expect((await retry).applied).toBe(true);
      client.dispose();
    }
  });

  test("a stalled worker times out instead of leaving Glance busy forever", async () => {
    const worker = new FakeWorker();
    const client = new GlanceWorkerClient(() => worker, 5);
    const error = await client.calculate(demoHistory()).catch((error: Error) => error);
    expect(error).toHaveProperty("message", "Couldn't apply Glance. Try again.");
    expect(worker.terminated).toBe(true);
    client.dispose();
  });
});

import type { GlanceResult, RepoHistory } from "@/lib/graph";
import type { GlanceRequest, GlanceResponse } from "./glance-worker-protocol";

export interface GlanceWorkerPort {
  onmessage: ((event: MessageEvent<GlanceResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage: (request: GlanceRequest) => void;
  terminate: () => void;
}

interface CachedGlance {
  history: RepoHistory;
  defaultBranch?: string;
  result: GlanceResult;
}

interface PendingGlance {
  generation: number;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** One worker and one derived snapshot per mounted explorer; nothing persists. */
export class GlanceWorkerClient {
  private worker: GlanceWorkerPort | null = null;
  private generation = 0;
  private pending: PendingGlance | null = null;
  private cached: CachedGlance | null = null;

  constructor(
    private readonly createWorker: () => GlanceWorkerPort = () =>
      new Worker(new URL("./glance.worker.ts", import.meta.url), { type: "module" }),
    private readonly timeoutMs = 15_000,
  ) {}

  calculate(history: RepoHistory, defaultBranch?: string): Promise<GlanceResult> {
    this.cancel();
    if (this.cached?.history === history && this.cached.defaultBranch === defaultBranch) {
      return Promise.resolve(this.cached.result);
    }
    this.cached = null;
    const generation = ++this.generation;

    return new Promise((resolve, reject) => {
      const fail = () => {
        if (this.pending?.generation !== generation) return;
        this.stopWorker();
        clearTimeout(this.pending.timer);
        this.pending = null;
        reject(new Error("Couldn't apply Glance. Try again."));
      };
      const timer = setTimeout(fail, this.timeoutMs);
      this.pending = { generation, reject, timer };
      try {
        this.worker ??= this.createWorker();
        this.worker.onmessage = ({ data }) => {
          if (this.pending?.generation !== generation || data.generation !== generation) return;
          if ("failed" in data) {
            fail();
            return;
          }
          clearTimeout(timer);
          this.pending = null;
          this.cached = { history, defaultBranch, result: data.result };
          resolve(data.result);
        };
        this.worker.onerror = (event) => {
          event.preventDefault();
          fail();
        };
        this.worker.onmessageerror = fail;
        this.worker.postMessage({ generation, history, defaultBranch });
      } catch {
        fail();
      }
    });
  }

  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    ++this.generation;
    clearTimeout(pending.timer);
    this.stopWorker();
    const error = new Error("Glance calculation cancelled.");
    error.name = "AbortError";
    pending.reject(error);
  }

  dispose(): void {
    this.cancel();
    this.stopWorker();
    this.cached = null;
  }

  private stopWorker(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

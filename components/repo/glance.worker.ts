import { applyGlance } from "@/lib/graph/glance";
import type { GlanceRequest, GlanceResponse } from "./glance-worker-protocol";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<GlanceRequest>) => void) | null;
  postMessage: (response: GlanceResponse) => void;
};

scope.onmessage = ({ data }) => {
  try {
    const result = applyGlance(data.history, {
      hideMergedIntoDefault: true,
      collapseMergedIntoNonDefault: true,
    }, data.defaultBranch);
    scope.postMessage({ generation: data.generation, result });
  } catch {
    scope.postMessage({ generation: data.generation, failed: true });
  }
};

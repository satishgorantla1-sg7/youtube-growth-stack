import { after } from "next/server";
import type { SourceType } from "@/lib/providers/types";
import { dispatchResearchWorker, researchDispatchStatus } from "./dispatcher";

export function scheduleResearchDispatch(requested: SourceType[] = ["youtube", "web"]) {
  const status = researchDispatchStatus(requested);
  if (status.state === "configuration_required") return status;
  after(async () => {
    try {
      await dispatchResearchWorker(requested);
    } catch {
      // The durable queue and status endpoint preserve the job for the next safe dispatch attempt.
    }
  });
  return status;
}

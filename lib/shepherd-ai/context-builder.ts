import type { MemberSignalContext, OpsSignal } from "@/lib/shepherd-ai/types";

export class ContextBuilder {
  build(context: MemberSignalContext, signals: OpsSignal[]) {
    return {
      ...context.contextPayload,
      displayName: context.displayName,
      recentOutreachAt: context.recentOutreachAt ?? null,
      hasFollowUp: context.hasFollowUp ?? false,
      firstVisitDate: context.firstVisitDate ?? null,
      signalCount: signals.length,
    };
  }
}

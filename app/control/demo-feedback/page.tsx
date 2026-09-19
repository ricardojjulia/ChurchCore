import { requireControlPlaneSession } from "@/lib/auth";
import { loadDemoFeedback } from "@/lib/control-plane-demo-feedback";
import { DemoFeedbackWorkspace } from "@/components/application/demo-feedback-workspace";

export const metadata = { title: "Demo Feedback — ChurchCore Control" };

export default async function DemoFeedbackPage() {
  const session = await requireControlPlaneSession("/control/demo-feedback");
  const feedbackResult = await loadDemoFeedback();
  return <DemoFeedbackWorkspace feedbackResult={feedbackResult} session={session} />;
}

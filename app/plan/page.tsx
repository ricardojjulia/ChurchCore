import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const sections = [
  "RBAC is a product rule, not a UI preference. Every portal and API path enforces least privilege.",
  "The working calendar is a central operating surface with events, RSVPs, volunteer shifts, and burnout guardrails.",
  "AI ministry tools stay assistive only, require consent, and never replace prayer, Scripture study, or pastoral discernment.",
  "Security, documentation, and release discipline remain mandatory on every meaningful change.",
];

export default function PlanPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <Badge>Development Plan v1.3</Badge>
          <div className="space-y-2">
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
              ChurchForge runs from a written plan, not drifting assumptions.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              This route summarizes the repo baseline. The canonical plan lives
              in the root `DEVELOPMENT_PLAN.md` and should be updated through
              pull requests only.
            </p>
          </div>
        </div>

        <Button asChild variant="secondary">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back Home
          </Link>
        </Button>
      </div>

      <Card className="bg-card/88">
        <CardHeader>
          <CardTitle>Current execution themes</CardTitle>
          <CardDescription>
            The current plan defines the operating model that every future
            feature, workflow, and integration should inherit.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {sections.map((item) => (
            <div
              key={item}
              className="flex gap-3 rounded-2xl border border-border/70 bg-background/45 p-4"
            >
              <CheckCircle2 className="mt-1 size-5 shrink-0 text-primary" />
              <p className="text-sm leading-7 text-foreground">{item}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

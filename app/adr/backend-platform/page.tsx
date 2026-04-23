import Link from "next/link";
import { ArrowLeft, Database, ShieldCheck, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const options = [
  {
    title: "Accepted Decision",
    description:
      "Supabase is approved as the backend and data platform for ChurchCore Ops, using Postgres, Auth, Realtime, and Storage.",
    icon: Zap,
  },
  {
    title: "Why this path won",
    description:
      "It gives the project the fastest credible route to multi-tenancy, auth, realtime calendar updates, and storage without building infrastructure glue first.",
    icon: Database,
  },
  {
    title: "Execution now underway",
    description:
      "The repo now includes Supabase SSR auth scaffolding, environment setup, a root proxy, and an initial SQL schema foundation.",
    icon: ShieldCheck,
  },
];

export default function BackendAdrPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-3">
          <Badge>ADR 0001 Accepted</Badge>
          <div className="space-y-2">
            <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
              Supabase is now the approved backend platform.
            </h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              ChurchCore Ops is standardizing on Supabase for Postgres, Auth,
              Realtime, and Storage so the app can move from preview scaffolds
              into a real multi-tenant execution path.
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

      <div className="grid gap-5 md:grid-cols-3">
        {options.map((option) => (
          <Card key={option.title} className="h-full bg-card/88">
            <CardHeader>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <option.icon className="size-5" />
              </div>
              <CardTitle>{option.title}</CardTitle>
              <CardDescription>{option.description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>

      <Card className="bg-primary text-primary-foreground">
        <CardHeader>
          <CardTitle className="font-serif text-3xl text-primary-foreground">
            Immediate consequence
          </CardTitle>
          <CardDescription className="text-base text-primary-foreground/85">
            Auth, tenant membership, and calendar-backed application data should
            now be implemented on Supabase primitives instead of adding more
            backend-agnostic placeholders.
          </CardDescription>
        </CardHeader>
      </Card>
    </main>
  );
}

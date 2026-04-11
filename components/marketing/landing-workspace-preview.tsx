"use client";

import { useMemo, useState } from "react";
import {
  BrainCircuit,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { portalRoles, type PortalRoleId } from "@/lib/portal";
import { cn } from "@/lib/utils";

const roleIcons: Record<PortalRoleId, React.ComponentType<{ className?: string }>> = {
  "super-admin": ShieldCheck,
  "church-admin": HeartHandshake,
  pastor: BrainCircuit,
  "ministry-leader": UsersRound,
  member: Sparkles,
};

const roleTint = {
  "super-admin": "from-[#1c334d] to-[#2e738f]",
  "church-admin": "from-[#18565d] to-[#d5a94c]",
  pastor: "from-[#46314b] to-[#b58a57]",
  "ministry-leader": "from-[#234145] to-[#79b89f]",
  member: "from-[#5b4525] to-[#dfb56a]",
} as const;

export function LandingWorkspacePreview() {
  const [activeRoleId, setActiveRoleId] = useState<PortalRoleId>("church-admin");

  const activeRole = useMemo(
    () => portalRoles.find((role) => role.id === activeRoleId) ?? portalRoles[1],
    [activeRoleId],
  );
  const ActiveIcon = roleIcons[activeRole.id];

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0f1724] text-white shadow-[0_28px_100px_-46px_rgba(8,15,25,0.9)]">
      <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))] p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <Badge className="border-white/10 bg-white/10 text-white">
              Live product preview
            </Badge>
            <div>
              <p className="font-serif text-3xl">A dashboard with real posture</p>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-white/64">
                Role switching, command lanes, and operational density without
                the anonymous template feel.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {portalRoles.map((role) => {
              const Icon = roleIcons[role.id];

              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setActiveRoleId(role.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
                    role.id === activeRole.id
                      ? "border-[#d5a94c]/40 bg-[#d5a94c] text-[#111a26]"
                      : "border-white/10 bg-white/5 text-white/72 hover:border-white/20 hover:bg-white/8",
                  )}
                >
                  <Icon className="size-4" />
                  {role.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[220px_1fr]">
        <aside className="border-r border-white/8 bg-[#0c131d] p-4">
          <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/42">
            Roles
          </p>
          <div className="mt-4 grid gap-2">
            {portalRoles.map((role) => {
              const Icon = roleIcons[role.id];

              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => setActiveRoleId(role.id)}
                  className={cn(
                    "rounded-[1.4rem] border p-3 text-left transition",
                    role.id === activeRole.id
                      ? "border-white/10 bg-white/10"
                      : "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.06]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br text-[#111a26]",
                        roleTint[role.id],
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-white">{role.label}</p>
                      <p className="text-xs text-white/54">{role.audience}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="grid gap-4 bg-[linear-gradient(180deg,#121b28_0%,#182332_100%)] p-4 sm:p-5">
          <div
            className={cn(
              "rounded-[1.8rem] border border-white/10 bg-gradient-to-r p-5",
              roleTint[activeRole.id],
            )}
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-3xl bg-white/18">
                    <ActiveIcon className="size-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/74">
                      {activeRole.label}
                    </p>
                    <p className="text-sm text-white/72">{activeRole.audience}</p>
                  </div>
                </div>
                <p className="max-w-2xl font-serif text-3xl leading-tight text-white">
                  {activeRole.headline}
                </p>
                <p className="max-w-2xl text-sm leading-7 text-white/78">
                  {activeRole.description}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-white/12 bg-[#0e1622]/26 p-4 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/54">
                  Suggested next move
                </p>
                <p className="mt-3 max-w-sm text-sm leading-7 text-white/84">
                  {activeRole.actionBoard[0]?.detail}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="grid gap-4 md:grid-cols-3">
              {activeRole.metrics.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[1.55rem] border border-white/10 bg-white/6 p-4"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/48">
                    {metric.label}
                  </p>
                  <p className="mt-4 font-serif text-4xl text-white">{metric.value}</p>
                  <p className="mt-3 text-sm leading-7 text-white/66">
                    {metric.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.55rem] border border-white/10 bg-white/6 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/48">
                  Watchlist
                </p>
                <div className="mt-4 grid gap-3">
                  {activeRole.watchlist.slice(0, 2).map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[1.25rem] border border-white/10 bg-[#0d1520]/30 p-3"
                    >
                      <p className="font-semibold text-white">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/66">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.55rem] border border-white/10 bg-white/6 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/48">
                  AI with guardrails
                </p>
                <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-[#0d1520]/30 p-3">
                  <p className="font-semibold text-white">
                    {activeRole.aiQueue[0]?.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-white/66">
                    {activeRole.aiQueue[0]?.detail}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#d5a94c]">
                    {activeRole.aiQueue[0]?.guardrail}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

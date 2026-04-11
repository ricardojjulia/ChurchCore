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
import type { DemoProfile } from "@/lib/auth";
import type { PortalRoleId } from "@/lib/portal";
import { cn } from "@/lib/utils";

const roleIcons: Record<PortalRoleId, React.ComponentType<{ className?: string }>> = {
  "super-admin": ShieldCheck,
  "church-admin": HeartHandshake,
  pastor: BrainCircuit,
  "ministry-leader": UsersRound,
  member: Sparkles,
};

export function SignInPreviewPanel({ profiles }: { profiles: DemoProfile[] }) {
  const [activeProfileId, setActiveProfileId] = useState(
    profiles[1]?.id ?? profiles[0]?.id,
  );

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
    [activeProfileId, profiles],
  );
  const ActiveIcon = roleIcons[activeProfile.roleId];

  return (
    <div className="grid gap-4">
      <div className="rounded-[1.9rem] border border-white/10 bg-white/6 p-5">
        <Badge className="border-white/10 bg-white/10 text-white">
          Preview roles
        </Badge>
        <div className="mt-4 flex items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-3xl bg-gradient-to-br from-[#2a8f87] to-[#d5a94c] text-[#09121c]">
            <ActiveIcon className="size-6" />
          </div>
          <div>
            <p className="font-serif text-3xl text-white">{activeProfile.name}</p>
            <p className="mt-1 text-sm text-white/64">{activeProfile.title}</p>
          </div>
        </div>
        <p className="mt-5 text-sm leading-7 text-white/76">{activeProfile.focus}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[1.35rem] border border-white/10 bg-black/16 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Default route
            </p>
            <p className="mt-3 text-sm font-semibold text-white">
              {activeProfile.defaultPath}
            </p>
          </div>
          <div className="rounded-[1.35rem] border border-white/10 bg-black/16 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
              Identity mode
            </p>
            <p className="mt-3 text-sm font-semibold text-white">
              Role-shaped protected preview
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        {profiles.map((profile) => {
          const Icon = roleIcons[profile.roleId];

          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => setActiveProfileId(profile.id)}
              className={cn(
                "flex items-start gap-3 rounded-[1.45rem] border px-4 py-4 text-left transition",
                profile.id === activeProfile.id
                  ? "border-white/14 bg-white/12"
                  : "border-white/8 bg-white/5 hover:border-white/14 hover:bg-white/8",
              )}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-white">{profile.name}</p>
                <p className="text-sm text-white/58">{profile.title}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

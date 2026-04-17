import {
  AlertTriangle,
  BarChart2,
  BookOpen,
  LayoutDashboard,
  List,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  active?: boolean;
};

const BASE = "/app/church-admin/children";

export function ccmNavItems(activePath: string): NavItem[] {
  return [
    {
      href: `${BASE}/dashboard`,
      label: "Live Dashboard",
      description: "Room status & alerts",
      icon: LayoutDashboard,
      active: activePath.startsWith(`${BASE}/dashboard`),
    },
    {
      href: `${BASE}/checkin`,
      label: "Check In",
      description: "Drop-off kiosk",
      icon: UserCheck,
      active: activePath.startsWith(`${BASE}/checkin`),
    },
    {
      href: `${BASE}/checkout`,
      label: "Pick Up",
      description: "Release station",
      icon: ShieldCheck,
      active: activePath.startsWith(`${BASE}/checkout`),
    },
    {
      href: `${BASE}/children`,
      label: "Children",
      description: "Child profiles & PII",
      icon: Users,
      active: activePath.startsWith(`${BASE}/children`),
    },
    {
      href: `${BASE}/services`,
      label: "Services",
      description: "Service sessions",
      icon: List,
      active: activePath.startsWith(`${BASE}/services`),
    },
    {
      href: `${BASE}/incidents`,
      label: "Incidents",
      description: "Insurance reports",
      icon: AlertTriangle,
      active: activePath.startsWith(`${BASE}/incidents`),
    },
    {
      href: `${BASE}/volunteers`,
      label: "Volunteers",
      description: "Assignments & checks",
      icon: BookOpen,
      active: activePath.startsWith(`${BASE}/volunteers`),
    },
    {
      href: `${BASE}/emergency`,
      label: "Emergency Roster",
      description: "All children by room",
      icon: ShieldAlert,
      active: activePath.startsWith(`${BASE}/emergency`),
    },
    {
      href: `${BASE}/settings`,
      label: "Settings",
      description: "Rooms & configuration",
      icon: Settings,
      active: activePath.startsWith(`${BASE}/settings`),
    },
    {
      href: `${BASE}/..`,
      label: "Ministry Forge",
      description: "Back to ministry",
      icon: BarChart2,
      active: false,
    },
  ];
}

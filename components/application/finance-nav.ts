import { BarChart2, BookOpen, FileText, Landmark, LayoutDashboard, Upload } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  active?: boolean;
};

export function financeNavItems(activePath: string): NavItem[] {
  return [
    {
      href: "/app/church-admin/finance/dashboard",
      label: "Overview",
      description: "Financial summary",
      icon: LayoutDashboard,
      active: activePath === "/app/church-admin/finance/dashboard",
    },
    {
      href: "/app/church-admin/finance/accounts",
      label: "Accounts",
      description: "Chart of accounts",
      icon: Landmark,
      active: activePath.startsWith("/app/church-admin/finance/accounts"),
    },
    {
      href: "/app/church-admin/finance/journals",
      label: "Journals",
      description: "Journal entries",
      icon: FileText,
      active: activePath.startsWith("/app/church-admin/finance/journals"),
    },
    {
      href: "/app/church-admin/finance/budgets",
      label: "Budgets",
      description: "Annual budgets",
      icon: BookOpen,
      active: activePath.startsWith("/app/church-admin/finance/budgets"),
    },
    {
      href: "/app/church-admin/finance/reports",
      label: "Reports",
      description: "Financial statements",
      icon: BarChart2,
      active: activePath.startsWith("/app/church-admin/finance/reports"),
    },
    {
      href: "/app/church-admin/finance/import",
      label: "Import",
      description: "Import transactions",
      icon: Upload,
      active: activePath.startsWith("/app/church-admin/finance/import"),
    },
  ];
}

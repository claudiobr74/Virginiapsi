import {
  BookOpen,
  CalendarDays,
  FileText,
  Settings,
  Sparkles,
  Sun,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: "rotina" | "ia" | "sistema";
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "rotina",
    label: "Rotina",
    items: [
      { href: "/app", label: "Meu Dia", icon: Sun },
      { href: "/app/patients", label: "Pacientes", icon: Users },
      { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/app/finance", label: "Financeiro", icon: Wallet },
    ],
  },
  {
    id: "ia",
    label: "IA & Conhecimento",
    items: [
      { href: "/app/documents", label: "Documentos", icon: FileText },
      { href: "/app/supervisor", label: "Supervisor IA", icon: Sparkles },
      { href: "/app/knowledge", label: "Conhecimento", icon: BookOpen },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [{ href: "/app/settings", label: "Configurações", icon: Settings }],
  },
];

export const MOBILE_PRIMARY_NAV: NavItem[] = [
  { href: "/app", label: "Meu Dia", icon: Sun },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/patients", label: "Pacientes", icon: Users },
];

export const MOBILE_MORE_NAV: NavItem[] = [
  { href: "/app/finance", label: "Financeiro", icon: Wallet },
  { href: "/app/documents", label: "Documentos", icon: FileText },
  { href: "/app/supervisor", label: "Supervisor IA", icon: Sparkles },
  { href: "/app/knowledge", label: "Conhecimento", icon: BookOpen },
  { href: "/app/settings", label: "Configurações", icon: Settings },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

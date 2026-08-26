import {
  BookOpen,
  CalendarDays,
  CreditCard,
  FileText,
  Home,
  LineChart,
  MessageCircle,
  Settings,
  Sparkles,
  TriangleAlert,
  Users,
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
      { href: "/app", label: "Início", icon: Home },
      { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/app/patients", label: "Pacientes", icon: Users },
      { href: "/app/sessions", label: "Sessões", icon: MessageCircle },
      { href: "/app/pendencias", label: "Pendências", icon: TriangleAlert },
      { href: "/app/finance", label: "Financeiro", icon: CreditCard },
    ],
  },
  {
    id: "ia",
    label: "IA & Conhecimento",
    items: [
      { href: "/app/knowledge", label: "Conhecimento", icon: BookOpen },
      { href: "/app/supervisor", label: "Supervisor IA", icon: Sparkles },
      { href: "/app/documents", label: "Documentos", icon: FileText },
      { href: "/app/indicadores", label: "Indicadores", icon: LineChart },
    ],
  },
  {
    id: "sistema",
    label: "Sistema",
    items: [{ href: "/app/settings", label: "Configurações", icon: Settings }],
  },
];

export const MOBILE_PRIMARY_NAV: NavItem[] = [
  { href: "/app", label: "Início", icon: Home },
  { href: "/app/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/app/patients", label: "Pacientes", icon: Users },
  { href: "/app/pendencias", label: "Pendências", icon: TriangleAlert },
];

export const MOBILE_MORE_NAV: NavItem[] = [
  { href: "/app/sessions", label: "Sessões", icon: MessageCircle },
  { href: "/app/finance", label: "Financeiro", icon: CreditCard },
  { href: "/app/documents", label: "Documentos", icon: FileText },
  { href: "/app/supervisor", label: "Supervisor IA", icon: Sparkles },
  { href: "/app/knowledge", label: "Conhecimento", icon: BookOpen },
  { href: "/app/indicadores", label: "Indicadores", icon: LineChart },
  { href: "/app/settings", label: "Configurações", icon: Settings },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

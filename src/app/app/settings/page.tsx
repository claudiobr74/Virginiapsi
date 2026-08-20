import { Settings } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Configurações — Tesseli" };

export default function SettingsPage() {
  return (
    <PlaceholderModulePage
      icon={Settings}
      title="Configurações"
      subtitle="Perfil, consultório, segurança e integrações"
      phaseNote="Perfil, equipe, integrações e backup chegam na Fase 12."
    />
  );
}

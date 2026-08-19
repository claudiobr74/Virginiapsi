import { Sparkles } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Supervisor IA — SerenaPsi" };

export default function SupervisorPage() {
  return (
    <PlaceholderModulePage
      icon={Sparkles}
      title="Supervisor IA"
      subtitle="Hipóteses, formulação e apoio clínico"
      phaseNote="O Supervisor Clínico IA, com revisão humana obrigatória, chega na Fase 7."
    />
  );
}

import { Sun } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Meu Dia — SerenaPsi" };

export default function MyDayPage() {
  return (
    <PlaceholderModulePage
      icon={Sun}
      title="Meu Dia"
      subtitle="Sua rotina clínica em um só lugar"
      phaseNote="A timeline do dia, a próxima sessão, pendências e tarefas chegam na Fase 5."
    />
  );
}

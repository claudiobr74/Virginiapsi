import { CalendarDays } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Agenda — SerenaPsi" };

export default function AgendaPage() {
  return (
    <PlaceholderModulePage
      icon={CalendarDays}
      title="Agenda"
      subtitle="Google Calendar, sessões e Meet"
      phaseNote="A sincronização com o Google Calendar e o Meet chegam na Fase 4."
    />
  );
}

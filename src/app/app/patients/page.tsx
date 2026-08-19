import { Users } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Pacientes — SerenaPsi" };

export default function PatientsPage() {
  return (
    <PlaceholderModulePage
      icon={Users}
      title="Pacientes"
      subtitle="Cadastro, Patient Hub e prontuário administrativo"
      phaseNote="A lista, o cadastro guiado e o Patient Hub chegam na Fase 3."
    />
  );
}

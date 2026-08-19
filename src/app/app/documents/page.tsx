import { FileText } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Documentos — SerenaPsi" };

export default function DocumentsPage() {
  return (
    <PlaceholderModulePage
      icon={FileText}
      title="Documentos"
      subtitle="Templates, TCLE, versões e assinaturas"
      phaseNote="Templates, PDF, versionamento e o TCLE completo chegam na Fase 9."
    />
  );
}

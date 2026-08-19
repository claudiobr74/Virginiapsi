import { BookOpen } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Conhecimento — SerenaPsi" };

export default function KnowledgePage() {
  return (
    <PlaceholderModulePage
      icon={BookOpen}
      title="Conhecimento"
      subtitle="Biblioteca clínica com RAG local"
      phaseNote="Coleções, fontes e busca RAG library-only chegam na Fase 8."
    />
  );
}

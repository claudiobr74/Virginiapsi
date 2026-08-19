import { Wallet } from "lucide-react";
import { PlaceholderModulePage } from "@/features/shell/placeholder-module-page";

export const metadata = { title: "Financeiro — SerenaPsi" };

export default function FinancePage() {
  return (
    <PlaceholderModulePage
      icon={Wallet}
      title="Financeiro"
      subtitle="Cobranças, pagamentos, despesas e relatórios"
      phaseNote="Cobranças, recebimentos, despesas e relatórios chegam na Fase 10."
    />
  );
}

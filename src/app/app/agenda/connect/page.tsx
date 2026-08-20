import { CalendarCog } from "lucide-react";
import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ConnectionPanel } from "@/features/calendar/components/connection-panel";
import { getConnection } from "@/features/calendar/connection-queries";
import { requireOrgContext } from "@/lib/auth/require-org-context";

export const metadata: Metadata = { title: "Conexão Google Calendar — SerenaPsi" };

export default async function GoogleConnectionPage() {
  const { organizationId, role } = await requireOrgContext();
  const connection = await getConnection(organizationId);

  return (
    <PageContainer narrow>
      <PageHeader
        icon={CalendarCog}
        title="Conexão com o Google Calendar"
        subtitle="Conta independente do login — conecte, escolha o calendário e acompanhe a sincronização"
      />
      <ConnectionPanel connection={connection} canManage={role === "psychologist_admin"} />
    </PageContainer>
  );
}

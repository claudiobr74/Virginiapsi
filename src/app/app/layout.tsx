import { AppShell } from "@/features/shell/app-shell";
import { requireUser } from "@/lib/auth/require-user";

function displayNameFromUser(user: Awaited<ReturnType<typeof requireUser>>) {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : null;
  if (fullName && fullName.trim().length > 0) {
    return fullName;
  }
  const emailLocalPart = user.email?.split("@")[0] ?? "Profissional";
  return emailLocalPart
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const professionalName = displayNameFromUser(user);

  return (
    <AppShell
      userEmail={user.email ?? ""}
      professionalName={professionalName}
      professionalSubtitle={user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}

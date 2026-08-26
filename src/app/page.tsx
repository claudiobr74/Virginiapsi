import { redirect } from "next/navigation";
import { oauthCodeCallbackPath } from "@/features/auth/oauth-redirect";
import { getAuthenticatedUser } from "@/lib/auth/require-user";

export default async function RootPage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const oauthCallback = oauthCodeCallbackPath(params);
  if (oauthCallback) {
    redirect(oauthCallback);
  }

  const user = await getAuthenticatedUser();
  redirect(user ? "/app" : "/login");
}

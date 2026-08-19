import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth/require-user";

export default async function RootPage() {
  const user = await getAuthenticatedUser();
  redirect(user ? "/app" : "/login");
}

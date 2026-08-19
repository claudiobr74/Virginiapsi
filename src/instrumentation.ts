export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { getPublicEnv } = await import("@/lib/env/public");
  getPublicEnv();
}

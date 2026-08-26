export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  try {
    const { getPublicEnv } = await import("@/lib/env/public");
    getPublicEnv();
  } catch {
    // Fail-fast is useful in logs, but throwing here 500s every route.
  }
}

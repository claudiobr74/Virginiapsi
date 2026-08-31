import { googleOAuthCallbackMessage } from "@/features/calendar/oauth-callback";

export function GoogleOAuthResultBanner({
  status,
  detail,
  redirectUri,
}: {
  status?: string;
  detail?: string;
  redirectUri?: string;
}) {
  if (status !== "connected" && status !== "error") {
    return null;
  }

  const message = googleOAuthCallbackMessage(status, detail, redirectUri);
  const isError = status === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      className={
        isError
          ? "rounded-2xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
          : "rounded-2xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}

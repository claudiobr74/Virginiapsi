"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toGoogleAuthErrorMessage } from "@/features/auth/messages";
import { GOOGLE_SIGNIN_QUERY_PARAMS, oauthCallbackRedirectTo } from "@/features/auth/oauth-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.84Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.26v3.11C3.24 21.3 7.28 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.6 4.6 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.28 0 3.24 2.7 1.26 6.62l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

export function GoogleAuthButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setErrorMessage(null);
    setIsLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: oauthCallbackRedirectTo(window.location.origin),
        queryParams: GOOGLE_SIGNIN_QUERY_PARAMS,
      },
    });
    if (error) {
      setIsLoading(false);
      setErrorMessage(toGoogleAuthErrorMessage(error.message));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-xl border border-failed/30 bg-failed-bg px-4 py-3 text-sm text-failed"
        >
          {errorMessage}
        </p>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full border border-border bg-white text-deep-neutral hover:bg-surface dark:bg-card"
        isLoading={isLoading}
        onClick={handleClick}
      >
        {!isLoading ? <GoogleIcon /> : null}
        Continuar com Google
      </Button>
    </div>
  );
}

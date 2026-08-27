"use client";

import { LoadingState } from "@/components/ui/loading-state";

export default function SessionLoading() {
  return <LoadingState fullPage label="Carregando sessão…" />;
}

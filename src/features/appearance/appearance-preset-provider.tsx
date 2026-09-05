"use client";

import { useEffect } from "react";
import {
  applyAppearancePreset,
  type AppearancePreset,
} from "@/features/appearance/appearance-presets";

export function AppearancePresetProvider({
  preset,
}: {
  preset: AppearancePreset;
}) {
  useEffect(() => {
    applyAppearancePreset(preset);
  }, [preset]);

  return null;
}

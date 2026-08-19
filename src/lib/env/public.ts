import { parsePublicEnv, type PublicEnv } from "@/lib/env/schema";

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv();
}

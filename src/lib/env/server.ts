import "server-only";

import { parseServerEnv } from "@/lib/env/server-schema";
import type { ServerEnv } from "@/lib/env/server-schema";

export * from "@/lib/env/server-schema";

export function getServerEnv(): ServerEnv {
  return parseServerEnv();
}

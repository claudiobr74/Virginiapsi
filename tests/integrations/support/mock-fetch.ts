import { vi } from "vitest";

/**
 * A properly-typed `fetch` mock so `.mock.calls[0]` resolves to
 * `[string, RequestInit | undefined]` instead of an empty tuple — plain
 * `vi.fn(async () => ...)` infers zero parameters from the arrow function
 * and breaks call-argument assertions under `--strict`.
 */
export function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(handler) as unknown as typeof fetch & {
    mock: { calls: Array<[string, RequestInit | undefined]> };
  };
}

/** PostgREST may return a TABLE RPC as an array or as a single object. */
export function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) {
    return (data[0] as T | undefined) ?? null;
  }
  if (data && typeof data === "object") {
    return data as T;
  }
  return null;
}

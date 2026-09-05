function firstHeaderValue(value: string | null): string | null {
  const token = value?.split(",")[0]?.trim();
  return token && token.length > 0 ? token : null;
}

function isSafeHost(host: string): boolean {
  if (host.length > 253 || host.includes("/") || host.includes("@") || host.includes(" ")) {
    return false;
  }
  return /^[a-zA-Z0-9.-]+(?::\d+)?$/.test(host);
}

export function resolvePublicAuthOrigin(request: {
  url: string;
  headers: { get(name: string): string | null };
}): {
  origin: string;
  hostname: string;
  forwardedHost: string | null;
  hostMismatch: boolean;
} {
  const requestUrl = new URL(request.url);
  const hostname = requestUrl.hostname;
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  const safeHost = forwardedHost && isSafeHost(forwardedHost) ? forwardedHost : null;
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : requestUrl.protocol.replace(":", "") || "https";
  const origin = safeHost ? `${proto}://${safeHost}` : requestUrl.origin;
  const publicHostname = safeHost ? safeHost.split(":")[0]! : hostname;

  return {
    origin,
    hostname,
    forwardedHost,
    hostMismatch: Boolean(safeHost) && publicHostname !== hostname,
  };
}

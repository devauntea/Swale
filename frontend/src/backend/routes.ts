/** Shared by the browser transport and the loopback Vite proxy. */
export function isApprovedBackendRequest(
  method: string,
  path: string,
): boolean {
  if (method !== "GET" || !path.startsWith("/api/v1/") || path.includes("#"))
    return false;
  try {
    const url = new URL(path, "http://swale.local");
    if (url.origin !== "http://swale.local") return false;
    const decoded = decodeURIComponent(url.pathname);
    if (
      Array.from(decoded).some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return false;
    return (
      /^\/api\/v1\/(health|layers|sources|catch-basins|incidents)$/.test(
        decoded,
      ) || /^\/api\/v1\/(catch-basins|incidents)\/[^/\\]+$/.test(decoded)
    );
  } catch {
    return false;
  }
}

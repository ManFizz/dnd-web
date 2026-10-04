/** Only same-site paths are allowed as a post-login destination. */
export function safeNext(value: unknown, fallback = "/characters"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

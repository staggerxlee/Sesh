/** Accept media URLs, not arbitrary provider webpages or executable schemes. */
export function audioSource(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a complete audio link beginning with https://.");
  }
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Use an HTTPS audio link without sign-in credentials.");
  const host = url.hostname.toLowerCase();
  if (
    [
      "youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
      "spotify.com",
      "soundcloud.com",
    ].some((domain) => host === domain || host.endsWith("." + domain))
  )
    throw new Error(
      "That is a music page, not a direct audio file. Paste a direct MP3, M4A, WAV or OGG link, or choose an audio file.",
    );
  return url.href;
}
export function audioTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "Live";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    rest = total % 60;
  return `${hours ? hours + ":" : ""}${hours ? String(minutes).padStart(2, "0") : minutes}:${String(rest).padStart(2, "0")}`;
}

export const LOFI_ARTIST_URL = "https://soundcloud.com/wrongnumberlofi";
// Profile ID returned by SoundCloud's official oEmbed endpoint.
export const LOFI_EMBED_URL =
  "https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Fusers%2F750156451&auto_play=false&visual=false&show_artwork=true&show_user=true&show_comments=false&color=%23c99b70";

export interface SoundCloudWidget {
  bind(event: string, listener: () => void): void;
  unbind(event: string): void;
  play(): void;
  pause(): void;
  setVolume(volume: number): void;
  isPaused(callback: (paused: boolean) => void): void;
  getCurrentSoundIndex(callback: (index: number) => void): void;
  getSounds(callback: (sounds: unknown[]) => void): void;
  skip(index: number): void;
}
interface SoundCloudSDK {
  Widget: ((frame: HTMLIFrameElement) => SoundCloudWidget) & {
    Events: Record<"READY" | "PLAY" | "PAUSE" | "FINISH" | "ERROR", string>;
  };
}
declare global {
  interface Window {
    SC?: SoundCloudSDK;
  }
}
let loading: Promise<SoundCloudSDK> | undefined;
export function loadSoundCloud(): Promise<SoundCloudSDK> {
  if (window.SC?.Widget) return Promise.resolve(window.SC);
  if (loading) return loading;
  loading = new Promise<SoundCloudSDK>((resolve, reject) => {
    const script = document.createElement("script");
    let timer: ReturnType<typeof setTimeout>;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("SoundCloud could not load."));
    };
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => {
      if (!window.SC?.Widget) return fail();
      clearTimeout(timer);
      resolve(window.SC);
    };
    script.onerror = fail;
    timer = setTimeout(fail, 15000);
    document.head.appendChild(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

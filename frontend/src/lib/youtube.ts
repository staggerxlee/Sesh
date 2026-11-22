export const youtubeTracks = {
  ocean: { id: "lfHe5omdLAA", label: "Ocean music", start: 0 },
  brown: { id: "m1lLHOW-TaY", label: "Brown noise", start: 362 },
  hertz: { id: "Dq-h8LIe6II", label: "Study hertz", start: 0 },
} as const;
export type YouTubeSound = keyof typeof youtubeTracks;
export function isYouTubeSound(value: string): value is YouTubeSound {
  return value in youtubeTracks;
}
export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(volume: number): void;
  destroy(): void;
}
interface YouTubeSDK {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady(): void;
        onStateChange(event: { data: number }): void;
        onError(): void;
        onAutoplayBlocked(): void;
      };
    },
  ) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeSDK;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let pending: Promise<YouTubeSDK> | undefined;
export function loadYouTube(): Promise<YouTubeSDK> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previous = window.onYouTubeIframeAPIReady;
    const fail = () => {
      clearTimeout(timeout);
      pending = undefined;
      script.remove();
      window.onYouTubeIframeAPIReady = previous;
      reject(new Error("YouTube could not load"));
    };
    const timeout = setTimeout(fail, 15000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timeout);
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return pending;
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  loadYouTube,
  youtubeTracks,
  type YouTubeSound,
  type YouTubePlayer,
} from "@/lib/youtube";

export function YouTubeMusic(props: {
  sound: YouTubeSound;
  playing: boolean;
  canPlay: boolean;
  volume: number;
  onClose: () => void;
  onPlayback: (playing: boolean) => void;
  onHold: (hold: boolean) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading YouTube…");
  const track = youtubeTracks[props.sound];
  useEffect(() => {
    let alive = true;
    setReady(false);
    setStatus("Loading YouTube…");
    const element = document.createElement("div");
    host.current?.appendChild(element);
    const timeout = setTimeout(() => {
      if (alive)
        setStatus(
          "YouTube is taking longer than usual. Retry or open the original video.",
        );
    }, 20000);
    void loadYouTube()
      .then((YT) => {
        if (!alive) return;
        player.current = new YT.Player(element, {
          videoId: track.id,
          width: "100%",
          height: "210",
          playerVars: {
            origin: window.location.origin,
            playsinline: 1,
            start: track.start,
            loop: 1,
            playlist: track.id,
          },
          events: {
            onReady() {
              if (!alive) return;
              clearTimeout(timeout);
              setReady(true);
              setStatus("Press play if your browser doesn’t start the video.");
              player.current?.setVolume(latest.current.volume * 100);
              if (latest.current.playing && latest.current.canPlay)
                player.current?.playVideo();
            },
            onStateChange({ data }) {
              if (!alive) return;
              if (data === 1) {
                if (!latest.current.canPlay) {
                  player.current?.pauseVideo();
                  return;
                }
                latest.current.onHold(false);
                latest.current.onPlayback(true);
                setStatus("");
              } else {
                latest.current.onPlayback(false);
                if (
                  data === 2 &&
                  latest.current.playing &&
                  latest.current.canPlay
                )
                  latest.current.onHold(true);
              }
            },
            onError() {
              if (alive) {
                clearTimeout(timeout);
                latest.current.onPlayback(false);
                setStatus(
                  "This video cannot play here. Retry or open it on YouTube.",
                );
              }
            },
            onAutoplayBlocked() {
              if (alive) setStatus("Press play in the video to begin.");
            },
          },
        });
      })
      .catch(() => {
        if (alive)
          setStatus(
            "YouTube is unavailable. Retry or open the original video.",
          );
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
      player.current?.destroy();
      player.current = null;
      element.remove();
    };
  }, [track.id, track.start, attempt]);
  useEffect(() => {
    if (!ready) return;
    player.current?.setVolume(props.volume * 100);
    if (props.playing && props.canPlay) player.current?.playVideo();
    else player.current?.pauseVideo();
  }, [ready, props.playing, props.canPlay, props.volume]);
  return (
    <aside className="youtube-music" aria-label={`${track.label} player`}>
      <button
        className="youtube-close"
        aria-label="Close video and stop playback"
        onClick={props.onClose}
      >
        ×
      </button>
      <a
        href={`https://www.youtube.com/watch?v=${track.id}${track.start ? `&t=${track.start}s` : ""}`}
        target="_blank"
        rel="noreferrer"
      >
        {track.label} · YouTube ↗
      </a>
      <div ref={host} />
      {status && <p role="status">{status}</p>}
      {status.includes("Retry") && (
        <button onClick={() => setAttempt((v) => v + 1)}>Retry YouTube</button>
      )}
    </aside>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import {
  loadSoundCloud,
  LOFI_ARTIST_URL,
  LOFI_EMBED_URL,
  type SoundCloudWidget,
} from "@/lib/soundcloud";

export function SoundCloudLofi(props: {
  selected: boolean;
  playing: boolean;
  canPlay: boolean;
  volume: number;
  onPlayback: (playing: boolean) => void;
  onHold: (hold: boolean) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("Loading wrongnumber’s tracks…");
  const [failed, setFailed] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const widget = useRef<SoundCloudWidget | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const level = useRef(0);
  const heard = useRef(false);
  const waitForPlay = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    if (props.selected) setLoaded(true);
  }, [props.selected]);

  useEffect(() => {
    if (!loaded || !frame.current) return;
    let disposed = false;
    let player: SoundCloudWidget | undefined;
    let events: string[] = [];
    let pauseCheck: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    setFailed(false);
    setStatus("Loading wrongnumber’s tracks…");
    const fail = () => {
      if (disposed) return;
      clearTimeout(waitForPlay.current);
      setFailed(true);
      setStatus("SoundCloud is unavailable. Retry or open the artist below.");
      latest.current.onPlayback(false);
    };
    const timeout = setTimeout(fail, 20000);
    void loadSoundCloud()
      .then((sdk) => {
        if (disposed || !frame.current) return;
        player = sdk.Widget(frame.current);
        widget.current = player;
        const bind = (event: string, fn: () => void) => {
          events.push(event);
          player!.bind(event, () => {
            if (!disposed) fn();
          });
        };
        bind(sdk.Widget.Events.READY, () => {
          clearTimeout(timeout);
          player!.setVolume(0);
          level.current = 0;
          setFailed(false);
          setReady(true);
          setStatus("Ready · tap the player if playback doesn’t start.");
        });
        bind(sdk.Widget.Events.PLAY, () => {
          clearTimeout(pauseCheck);
          const p = latest.current;
          if (!p.selected || !p.canPlay) {
            player!.pause();
            return;
          }
          heard.current = true;
          clearTimeout(waitForPlay.current);
          setFailed(false);
          setStatus("Playing · wrongnumber");
          p.onPlayback(true);
          if (!p.playing) p.onHold(false);
        });
        bind(sdk.Widget.Events.PAUSE, () => {
          // SoundCloud also emits transient PAUSE events during track changes.
          // Confirm the settled state before changing Sesh's playback intent.
          clearTimeout(pauseCheck);
          pauseCheck = setTimeout(
            () =>
              player!.isPaused((isPaused) => {
                if (disposed || !isPaused) return;
                clearTimeout(waitForPlay.current);
                const p = latest.current;
                p.onPlayback(false);
                setStatus("Paused · tap play to continue.");
                if (heard.current && p.selected && p.playing && p.canPlay)
                  p.onHold(true);
                heard.current = false;
              }),
            150,
          );
        });
        bind(sdk.Widget.Events.FINISH, () => {
          // The widget advances between tracks itself; wrap only after the final track.
          player!.getCurrentSoundIndex((index) => {
            player!.getSounds((sounds) => {
              if (
                !disposed &&
                latest.current.playing &&
                index === sounds.length - 1
              ) {
                player!.skip(0);
              }
            });
          });
        });
        bind(sdk.Widget.Events.ERROR, fail);
      })
      .catch(fail);
    return () => {
      disposed = true;
      clearTimeout(timeout);
      clearTimeout(pauseCheck);
      clearTimeout(waitForPlay.current);
      events.forEach((event) => player?.unbind(event));
      player?.pause();
      widget.current = null;
      heard.current = false;
    };
  }, [loaded, attempt]);

  useEffect(() => {
    const player = widget.current;
    if (!ready || !player) return;
    clearTimeout(waitForPlay.current);
    if (props.playing && !heard.current) {
      player.play();
      if (!heard.current) {
        waitForPlay.current = setTimeout(() => {
          if (!heard.current)
            setStatus("Tap play in the SoundCloud player to begin.");
        }, 4000);
      }
    }
    return () => clearTimeout(waitForPlay.current);
  }, [ready, props.playing]);

  useEffect(() => {
    const player = widget.current;
    if (!ready || !player) return;
    const from = level.current;
    const to = props.playing ? props.volume * 100 : 0;
    const start = performance.now();
    const timer = setInterval(() => {
      const fraction = Math.min(1, (performance.now() - start) / 400);
      level.current = from + (to - from) * fraction;
      player.setVolume(level.current);
      if (fraction === 1) {
        clearInterval(timer);
        if (!latest.current.playing) {
          player.pause();
          latest.current.onPlayback(false);
        }
      }
    }, 40);
    return () => clearInterval(timer);
  }, [ready, props.playing, props.volume]);

  if (!loaded) return null;
  return (
    <section
      className="soundcloud-lofi"
      style={{ display: props.selected ? undefined : "none" }}
      aria-label="Lo-fi by wrongnumber"
    >
      <a href={LOFI_ARTIST_URL} target="_blank" rel="noreferrer">
        wrongnumber · on SoundCloud ↗
      </a>
      <iframe
        key={attempt}
        ref={frame}
        title="wrongnumber’s Lo-fi tracks on SoundCloud"
        src={LOFI_EMBED_URL}
        allow="autoplay; encrypted-media"
        height="240"
        width="100%"
      />
      <p role="status">{status}</p>
      {failed && (
        <button onClick={() => setAttempt((n) => n + 1)}>
          Retry SoundCloud
        </button>
      )}
    </section>
  );
}

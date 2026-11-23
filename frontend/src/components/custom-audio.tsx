"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pause, Play, Repeat2, RotateCcw } from "lucide-react";
import { audioSource, audioTime } from "@/lib/audio-source";

export function CustomAudio(props: {
  playing: boolean;
  canPlay: boolean;
  volume: number;
  onPlayback: (playing: boolean) => void;
  onHold: (hold: boolean) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const objectUrl = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [position, setPosition] = useState(0);
  const [length, setLength] = useState(0);
  const [loop, setLoop] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const media = audio.current;
    return () => {
      media?.pause();
      media?.removeAttribute("src");
      media?.load();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  useEffect(() => {
    if (audio.current) audio.current.volume = props.volume;
  }, [props.volume]);
  useEffect(() => {
    const media = audio.current;
    if (!media || !source) return;
    let current = true;
    if (props.playing && props.canPlay) {
      void media.play().catch((e) => {
        if (!current || e.name === "AbortError") return;
        if (e.name === "NotAllowedError") {
          setStatus("Press play to begin.");
          latest.current.onHold(true);
        } else
          setError(
            "This link could not play. Use a direct audio file or choose a file from your device.",
          );
      });
    } else media.pause();
    return () => {
      current = false;
    };
  }, [props.playing, props.canPlay, source, revision]);
  function load(url: string, name: string, local = false) {
    if (url === source) audio.current?.load();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = local ? url : null;
    setSource(url);
    setTitle(name);
    setPosition(0);
    setLength(0);
    setError("");
    setStatus("Loading audio…");
    props.onHold(false);
    props.onPlayback(false);
    setRevision((v) => v + 1);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const url = audioSource(draft);
      load(
        url,
        decodeURIComponent(
          new URL(url).pathname.split("/").pop() || "Custom audio",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const seekable = length > 0 && Number.isFinite(length);
  return (
    <section className="custom-audio" aria-label="Custom audio player">
      <form onSubmit={submit}>
        <label htmlFor="custom-audio-url">Your audio link</label>
        <div className="custom-audio-entry">
          <input
            id="custom-audio-url"
            type="url"
            placeholder="https://…/music.mp3"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            required
            spellCheck={false}
          />
          <button type="submit">Load audio</button>
        </div>
        <p>
          Direct audio links only. Music-service page links need their own
          players.
        </p>
      </form>
      <label className="custom-audio-file">
        Or choose an audio file
        <input
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.flac"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) load(URL.createObjectURL(file), file.name, true);
            e.target.value = "";
          }}
        />
      </label>
      <small>
        Files stay on your device. Links are kept only while this page is open.
      </small>
      <audio
        ref={audio}
        src={source || undefined}
        preload="metadata"
        loop={loop}
        onLoadedMetadata={() => setLength(audio.current?.duration || 0)}
        onDurationChange={() => setLength(audio.current?.duration || 0)}
        onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)}
        onPlaying={() => {
          if (!latest.current.canPlay || !latest.current.playing) {
            audio.current?.pause();
            return;
          }
          setError("");
          setStatus("");
          latest.current.onPlayback(true);
        }}
        onPause={() => latest.current.onPlayback(false)}
        onWaiting={() => setStatus("Buffering…")}
        onCanPlay={() => setStatus("")}
        onEnded={() => {
          latest.current.onPlayback(false);
          latest.current.onHold(true);
        }}
        onError={() => {
          if (source) {
            setStatus("");
            setError(
              "Audio is unavailable or unsupported. Check the direct link, or choose a file from your device.",
            );
            latest.current.onPlayback(false);
          }
        }}
      />
      {source && (
        <div className="custom-audio-transport">
          <strong title={title}>{title}</strong>
          <input
            aria-label="Audio position"
            type="range"
            min={0}
            max={seekable ? length : 1}
            step={0.1}
            value={seekable ? Math.min(position, length) : 0}
            disabled={!seekable}
            onChange={(e) => {
              if (audio.current) {
                audio.current.currentTime = Number(e.target.value);
                setPosition(Number(e.target.value));
              }
            }}
          />
          <div className="custom-audio-times">
            <span>{audioTime(position)}</span>
            <span>{audioTime(length)}</span>
          </div>
          <div className="custom-audio-buttons">
            <button
              type="button"
              disabled={!props.canPlay}
              aria-label={
                props.playing ? "Pause custom audio" : "Play custom audio"
              }
              onClick={() => props.onHold(props.playing)}
            >
              {props.playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button
              type="button"
              aria-label="Restart audio"
              onClick={() => {
                if (audio.current) {
                  audio.current.currentTime = 0;
                  setPosition(0);
                }
              }}
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              aria-label="Loop audio"
              aria-pressed={loop}
              onClick={() => setLoop((v) => !v)}
            >
              <Repeat2 size={16} />
            </button>
          </div>
        </div>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {source && error && (
        <button
          type="button"
          onClick={() => {
            audio.current?.load();
            setError("");
            setStatus("Loading audio…");
            setRevision((v) => v + 1);
          }}
        >
          Retry audio
        </button>
      )}
    </section>
  );
}

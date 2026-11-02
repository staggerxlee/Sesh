"use client";
import dynamic from "next/dynamic";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Eye, EyeOff, Pause, Play, Volume2 } from "lucide-react";
import { salonEditions } from "@/lib/salon";
import type { CameraMode } from "./atelier-world";
import { useSesh } from "@/lib/store";
import { RoomMix, type Sound } from "@/lib/cinema-audio";
import type { PianistState } from "@/lib/pianist";
const World = dynamic(() => import("./atelier-world"), { ssr: false });
class Guard extends Component<
  { children: ReactNode; failed: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.failed();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function RoomStage({
  parked,
  mode,
  paused,
  onLeave,
  exit,
}: {
  parked: boolean;
  mode: CameraMode;
  paused: boolean;
  onLeave: () => void;
  exit: () => void;
}) {
  const { preferences, active } = useSesh();
  const backgroundSession = parked && !!active;
  const mix = useRef<RoomMix | null>(null),
    closeTask = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    exitTask = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [quiet, setQuiet] = useState(false),
    [still, setStill] = useState(false),
    [sys, setSys] = useState(false),
    [effects, setEffects] = useState(true),
    [sound, setSound] = useState<Sound>("silence"),
    [hold, setHold] = useState(false),
    [output, setOutput] = useState<Sound>("silence"),
    [vol, setVol] = useState(0.28),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [performer, setPerformer] = useState<PianistState>("Idle"),
    [panel, setPanel] = useState(false),
    [error, setError] = useState("");
  const onReady = useCallback(() => setReady(true), []),
    onSlow = useCallback(() => setFailed(true), []);
  const moving = !sys && !preferences.reduced_motion && !still,
    home = mode === "home",
    minimal = quiet && !home && mode !== "retreat",
    complete = mode === "complete" || mode === "retreat";
  useEffect(() => {
    clearTimeout(closeTask.current);
    const q = matchMedia("(prefers-reduced-motion: reduce)"),
      apply = () => setSys(q.matches);
    apply();
    q.addEventListener("change", apply);
    setQuiet(localStorage.getItem("sesh-room-quiet") === "1");
    setStill(localStorage.getItem("sesh-room-still") === "1");
    return () => {
      q.removeEventListener("change", apply);
      clearTimeout(exitTask.current);
      closeTask.current = setTimeout(() => mix.current?.dispose(), 0);
    };
  }, []);
  useEffect(() => {
    if (ready || failed || minimal) return;
    const timeout = setTimeout(() => setFailed(true), 11000);
    return () => clearTimeout(timeout);
  }, [ready, failed, minimal]);
  const exitRef = useRef(exit);
  exitRef.current = exit;
  const onSettled = useCallback((view: CameraMode) => {
    if (view === "retreat") exitRef.current();
  }, []);
  useEffect(() => {
    if (mode === "retreat" && (!ready || failed)) {
      exitTask.current = setTimeout(() => exitRef.current(), moving ? 300 : 0);
      return () => clearTimeout(exitTask.current);
    }
    if (mode === "home") setPanel(false);
  }, [mode, ready, failed, moving]);
  useEffect(() => {
    mix.current?.volume(vol);
  }, [vol, sound]);
  const playing = (!home || backgroundSession) && !hold && !paused && !complete;
  const audible =
    playing &&
    (sound !== "piano" ||
      performer === "Playing" ||
      quiet ||
      failed ||
      backgroundSession)
      ? sound
      : "silence";
  useEffect(() => {
    let attached = true;
    mix.current
      ?.select(audible)
      .then(() => {
        if (attached)
          setOutput(
            mix.current?.ctx.state === "running"
              ? mix.current?.current?.mode || "silence"
              : "silence",
          );
      })
      .catch(() => {
        if (attached) setOutput("silence");
        if (attached)
          setError("Audio could not load. Choose another sound or retry.");
      });
    return () => {
      attached = false;
    };
  }, [audible]);
  async function select(value: Sound) {
    try {
      if (value !== "silence") {
        mix.current ??= new RoomMix();
        await mix.current.unlock();
        mix.current.volume(vol);
      }
      setSound(value);
      setHold(false);
      setError("");
    } catch {
      setError("Audio playback is unavailable in this browser.");
    }
  }
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    const enter = (event: Event) => {
      void selectRef.current((event as CustomEvent).detail?.sound || "nature");
    };
    window.addEventListener("sesh-enter-room", enter);
    return () => window.removeEventListener("sesh-enter-room", enter);
  }, []);
  useEffect(() => {
    if (home || complete) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) {
        if (panel) setPanel(false);
        else onLeave();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [panel, home, complete, onLeave]);
  return (
    <div
      className={
        (home ? "salon-home-scene " : "cinema ") +
        (minimal ? "minimal " : "") +
        (failed ? "print " : "")
      }
      data-mood={sound}
      data-audio={output}
      data-scene={mode}
      data-performer={performer}
    >
      {!minimal && (
        <>
          <img
            className={"cinema-plate " + (ready && !failed ? "conceal" : "")}
            src="/atelier/editions/home.webp"
            alt="Static plate of the grand piano salon"
          />
          {!failed && (
            <div className="cinema-canvas">
              <Guard failed={onSlow}>
                <World
                  parked={parked}
                  mode={backgroundSession ? "focus" : mode}
                  onSettled={onSettled}
                  sound={sound}
                  moving={moving}
                  effects={effects}
                  playing={playing}
                  playhead={() => {
                    const m = mix.current,
                      v = m?.current;
                    return m && v?.mode === "piano"
                      ? v.offset + m.ctx.currentTime - v.started
                      : 0;
                  }}
                  onReady={onReady}
                  onSlow={onSlow}
                  onPerformer={setPerformer}
                />
              </Guard>
            </div>
          )}
        </>
      )}
      <div className="cinema-veil" />
      {!home && (
        <div className="cinema-id">
          S / 01 &nbsp; THE LISTENING ROOM{" "}
          <span>
            {quiet
              ? "MINIMAL"
              : failed
                ? "STATIC PLATE"
                : ready
                  ? "INTERIOR"
                  : "LOADING ROOM"}
          </span>
        </div>
      )}
      {!home && !complete && (
        <>
          <button className="leave-cinema cinema-chrome" onClick={onLeave}>
            <ArrowLeft size={15} />
            {mode === "focus" ? "Leave · timer stays on" : "Leave room"}
          </button>
          <div className="cinema-dock cinema-chrome">
            {panel && (
              <div className="sound-panel">
                <span className="index-label">SOUND ENVIRONMENT</span>
                <div className="sound-list">
                  {salonEditions.map(({ sound: v, title }) => (
                    <button
                      key={v}
                      aria-label={
                        v === "lofi" ? "Lo-fi" : v[0].toUpperCase() + v.slice(1)
                      }
                      aria-pressed={v === sound}
                      onClick={() => void select(v)}
                    >
                      <img src={`/atelier/editions/${v}.webp`} alt="" />
                      <span>{title}</span>
                      {v === "lofi" ? "Lo-fi" : v[0].toUpperCase() + v.slice(1)}
                    </button>
                  ))}
                </div>
                <label>
                  Volume
                  <input
                    aria-label="Sound volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={vol}
                    onChange={(e) => setVol(+e.target.value)}
                  />
                </label>
                <div>
                  <button
                    aria-pressed={effects}
                    onClick={() => setEffects(!effects)}
                  >
                    Atmosphere {effects ? "on" : "off"}
                  </button>
                  <button
                    aria-pressed={moving}
                    disabled={sys || preferences.reduced_motion}
                    onClick={() => {
                      setStill(!still);
                      localStorage.setItem(
                        "sesh-room-still",
                        still ? "0" : "1",
                      );
                    }}
                  >
                    Motion {moving ? "on" : "off"}
                  </button>
                </div>
                {error && <p role="alert">{error}</p>}
                {failed && (
                  <button
                    onClick={() => {
                      setReady(false);
                      setFailed(false);
                    }}
                  >
                    Static plate · Retry 3D ↗
                  </button>
                )}
              </div>
            )}
            <div className="dock-row">
              <button onClick={() => setPanel(!panel)} aria-expanded={panel}>
                <Volume2 size={16} />
                {sound === "lofi" ? "Lo-fi" : sound}
              </button>
              {sound !== "silence" && (
                <button
                  disabled={paused}
                  onClick={() => setHold(!hold)}
                  aria-label={hold ? "Resume sound" : "Pause sound"}
                >
                  {hold ? <Play size={14} /> : <Pause size={14} />}
                </button>
              )}
              <button
                aria-pressed={quiet}
                onClick={() => {
                  setQuiet(!quiet);
                  localStorage.setItem("sesh-room-quiet", quiet ? "0" : "1");
                }}
              >
                {quiet ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
                {quiet ? "Show room" : "Minimal"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

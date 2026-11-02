export type Sound = "silence" | "piano" | "rain" | "lofi" | "nature";
export const sounds: Sound[] = ["silence", "piano", "rain", "lofi", "nature"];
export class RoomMix {
  ctx: AudioContext;
  master: GainNode;
  generation = 0;
  cache = new Map<Sound, Promise<AudioBuffer>>();
  current: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    started: number;
    offset: number;
    mode: Sound;
  } | null = null;
  offsets = new Map<Sound, number>();
  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.master.gain.value = 0.3;
  }
  unlock() {
    return this.ctx.resume();
  }
  volume(v: number) {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  async select(mode: Sound) {
    if (this.current?.mode === mode) return;
    const order = ++this.generation,
      c = this.ctx,
      t = c.currentTime,
      old = this.current;
    if (old) {
      this.offsets.set(old.mode, old.offset + t - old.started);
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setTargetAtTime(0, t, 0.11);
      old.source.stop(t + 0.62);
      this.current = null;
    }
    if (mode === "silence") return;
    let pending = this.cache.get(mode);
    if (!pending) {
      pending = fetch("/atelier/sound/" + mode + ".wav")
        .then((r) => {
          if (!r.ok) throw new Error("Sound could not load");
          return r.arrayBuffer();
        })
        .then((b) => c.decodeAudioData(b));
      this.cache.set(mode, pending);
    }
    let buffer: AudioBuffer;
    try {
      buffer = await pending;
    } catch (e) {
      this.cache.delete(mode);
      throw e;
    }
    if (order !== this.generation || c.state === "closed") return;
    const src = c.createBufferSource(),
      g = c.createGain(),
      now = c.currentTime;
    src.buffer = buffer;
    src.loop = true;
    src.connect(g);
    g.connect(this.master);
    g.gain.value = 0;
    g.gain.setTargetAtTime(1, now, 0.23);
    const offset = (this.offsets.get(mode) || 0) % buffer.duration;
    src.start(now, offset);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    this.current = { source: src, gain: g, started: now, offset, mode };
  }
  dispose() {
    void this.select("silence");
    setTimeout(() => {
      if (this.ctx.state !== "closed") void this.ctx.close();
    }, 700);
  }
}

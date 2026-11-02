// An original, opt-in piano étude. Audio is never initialized on page load.
export class AtelierPiano {
  context: AudioContext;
  bus: GainNode;
  job: ReturnType<typeof setInterval> | null = null;
  step = 0;
  next = 0;
  constructor() {
    this.context = new AudioContext();
    this.bus = this.context.createGain();
    this.bus.gain.value = 0.16;
    this.bus.connect(this.context.destination);
  }
  async unlock() {
    await this.context.resume();
  }
  play() {
    if (this.job) return;
    const c = this.context;
    this.next = c.currentTime + 0.045;
    this.bus.gain.cancelScheduledValues(c.currentTime);
    this.bus.gain.setTargetAtTime(0.16, c.currentTime, 0.045);
    const motifs = [
      [48, 55, 64, 67, 71, 67, 64, 55],
      [45, 52, 60, 64, 67, 64, 60, 52],
      [41, 48, 57, 60, 64, 60, 57, 48],
      [43, 50, 59, 62, 65, 62, 59, 50],
    ];
    const pump = () => {
      if (this.next < c.currentTime) this.next = c.currentTime + 0.035;
      while (this.next < c.currentTime + 0.2) {
        let n = motifs[Math.floor(this.step / 8) % 4][this.step % 8];
        this.strike(n, this.next);
        if (this.step % 8 === 0) this.strike(n - 12, this.next);
        this.step++;
        this.next += 0.42;
      }
    };
    pump();
    this.job = setInterval(pump, 60);
  }
  private strike(note: number, start: number) {
    const c = this.context,
      base = 440 * 2 ** ((note - 69) / 12);
    [1, 2, 3, 4].forEach((partial, i) => {
      const o = c.createOscillator(),
        g = c.createGain();
      o.frequency.value = base * partial * (1 + i * 0.0005);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(
        [0.55, 0.2, 0.09, 0.035][i],
        start + 0.009,
      );
      g.gain.exponentialRampToValueAtTime(0.0001, start + 2.3 / (1 + i * 0.32));
      o.connect(g);
      g.connect(this.bus);
      o.start(start);
      o.stop(start + 2.4);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    });
  }
  pause() {
    if (this.job) clearInterval(this.job);
    this.job = null;
    this.bus.gain.setTargetAtTime(0, this.context.currentTime, 0.025);
  }
  close() {
    this.pause();
    void this.context.close();
  }
}

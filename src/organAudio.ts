import type { IoBus } from "./cpu8080";
import { getAudioContext, getMasterGain } from "./audioContext";

// NEC TK-80 User's Manual (IEM-560A), 1.2 TK-80の仕様: "クロック周波数 2.048MHz". The ch.2/4/5
// application programs (電子サイレン/電子オルガン/自動演奏) all generate their tone by bit-banging
// this exact OUT loop at the real CPU's instruction rate, so the emulator has to actually run
// at (at least) the real clock rate for the scheduling below to stay ahead of real time - see
// main.ts's CYCLES_PER_SECOND.
const CPU_CLOCK_HZ = 2_048_000;

// PPI (uPD8255) port C, bit PC1 - the pin the application-program manual's ch.2.1/4.1 wire
// through a coupling capacitor to an audio amp. OUT-ing bit1 set/clear is the entire "signal":
// there's no separate carrier to gate, unlike the CMT interface's on/off-keyed tone.
const PORT = 0x02;
const BIT = 0x02;

// A gap this long since the last toggle is treated as "the speaker's been idle", so the next
// OUT starts a fresh anchor instead of trying to schedule off a stale one.
const IDLE_GAP_SECONDS = 0.25;
const LOOKAHEAD_SECONDS = 0.02;

/**
 * Turns OUT-to-port-2-bit1 into real sound: the real TK-80 speaker circuit is just this pin
 * through a coupling capacitor (which removes the DC bias, leaving an AC square wave) into an
 * audio amp, so a ConstantSourceNode driven directly by the bit - no carrier oscillator - is
 * the faithful reproduction. Cycle-accurate scheduling (via `cycles`, a running CPU cycle
 * count) rather than scheduling from whenever the JS call happens is what makes the pitch
 * come out right regardless of exactly when within a frame the emulator's step loop reaches
 * each OUT.
 */
export class SpeakerIoBus implements IoBus {
  private cycles: () => number = () => 0;
  private node: ConstantSourceNode | null = null;
  private cycleAnchor = 0;
  private timeAnchor = 0;
  private lastScheduledTime = 0;
  private lastLevel = 0;

  /** Wired up after the Cpu8080 exists, since it needs to read the CPU's own cycle counter. */
  setCycleSource(cycles: () => number): void {
    this.cycles = cycles;
  }

  private ensureNode(ctx: AudioContext): ConstantSourceNode {
    if (!this.node) {
      const src = ctx.createConstantSource();
      src.offset.value = -1;
      src.connect(getMasterGain(ctx));
      src.start();
      this.node = src;
    }
    return this.node;
  }

  input(): number {
    return 0xff; // output-only port as far as this feature is concerned
  }

  output(port: number, value: number): void {
    if (port !== PORT) return;
    const level = (value & BIT) !== 0 ? 1 : -1;
    if (level === this.lastLevel) return;
    this.lastLevel = level;

    const ctx = getAudioContext();
    if (!ctx) return;
    const node = this.ensureNode(ctx);

    if (ctx.currentTime - this.lastScheduledTime > IDLE_GAP_SECONDS) {
      this.timeAnchor = ctx.currentTime + LOOKAHEAD_SECONDS;
      this.cycleAnchor = this.cycles();
      this.lastScheduledTime = this.timeAnchor;
    }

    const t = Math.max(
      this.timeAnchor + (this.cycles() - this.cycleAnchor) / CPU_CLOCK_HZ,
      this.lastScheduledTime,
    );
    node.offset.setValueAtTime(level, t);
    this.lastScheduledTime = t;
  }
}

export { CPU_CLOCK_HZ };

import type { IoBus } from "./cpu8080";
import { getAudioContext, getMasterGain } from "./audioContext";
import { CPU_CLOCK_HZ } from "./organAudio";

// PPI (uPD8255) port B - see the application-program manual's ch.6.1/6.5. Unlike ch.2/4/5's
// single-bit port C signal, all 8 bits of port B are live at once: the program increments an
// 8-bit counter at a fixed rate and OUTs the raw value, so bit i naturally toggles at half the
// rate of bit (i-1) - a free-running binary counter's bits are already an octave-doubling stack
// with no per-bit logic needed. Ch.6.5 wires each PBn through its own 4.7kOhm resistor into one
// summing junction (all 8 resistors equal - an equal-weighted mix, not a binary DAC ladder),
// then a coupling capacitor to the audio amp, same as ch.2/4/5's single-pin circuit otherwise.
const PORT_B = 0x01;
const CHANNEL_COUNT = 8;
const CHANNEL_GAIN = 1 / CHANNEL_COUNT;

// See organAudio.ts's SpeakerIoBus for why these two constants are what they are.
const IDLE_GAP_SECONDS = 0.25;
const LOOKAHEAD_SECONDS = 0.02;

/**
 * Turns OUT-to-port-B into the "infinite scale" (a Shepard-tone-like effect): each of the 8
 * bits gets its own ConstantSourceNode, all summed through equal 1/8 gains into the shared
 * master gain, matching the manual's equal-resistor mixing circuit exactly. All 8 channels
 * share one cycle/time anchor, since every bit that changes does so at the same OUT call (and
 * therefore the same CPU cycle) - there's no need for 8 independent anchors.
 */
export class InfiniteScaleIoBus implements IoBus {
  private cycles: () => number = () => 0;
  private nodes: (ConstantSourceNode | null)[] = new Array(CHANNEL_COUNT).fill(null);
  private cycleAnchor = 0;
  private timeAnchor = 0;
  private lastScheduledTime = -Infinity; // see organAudio.ts's SpeakerIoBus for why -Infinity
  private lastValue = 0;

  /** Wired up after the Cpu8080 exists, since it needs to read the CPU's own cycle counter. */
  setCycleSource(cycles: () => number): void {
    this.cycles = cycles;
  }

  private ensureNode(ctx: AudioContext, bit: number): ConstantSourceNode {
    let node = this.nodes[bit];
    if (!node) {
      node = ctx.createConstantSource();
      node.offset.value = -1;
      const gain = ctx.createGain();
      gain.gain.value = CHANNEL_GAIN;
      node.connect(gain);
      gain.connect(getMasterGain(ctx));
      node.start();
      this.nodes[bit] = node;
    }
    return node;
  }

  input(): number {
    return 0xff; // output-only port as far as this feature is concerned
  }

  output(port: number, value: number): void {
    if (port !== PORT_B) return;
    const changed = (value ^ this.lastValue) & 0xff;
    if (changed === 0) return;
    this.lastValue = value & 0xff;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.currentTime - this.lastScheduledTime > IDLE_GAP_SECONDS) {
      this.timeAnchor = ctx.currentTime + LOOKAHEAD_SECONDS;
      this.cycleAnchor = this.cycles();
      this.lastScheduledTime = this.timeAnchor;
    }
    const t = Math.max(this.timeAnchor + (this.cycles() - this.cycleAnchor) / CPU_CLOCK_HZ, this.lastScheduledTime);

    for (let bit = 0; bit < CHANNEL_COUNT; bit++) {
      if (((changed >> bit) & 1) === 0) continue;
      const level = ((value >> bit) & 1) !== 0 ? 1 : -1;
      this.ensureNode(ctx, bit).offset.setValueAtTime(level, t);
    }
    this.lastScheduledTime = t;
  }
}

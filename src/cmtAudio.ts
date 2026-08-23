import { encodeCmtByte } from "./panel";

const BAUD_RATE = 110; // matches teletype, per the manual's ch. 6.2
const BIT_SECONDS = 1 / BAUD_RATE;
// The manual's modulator is a builder-tuned CMOS RC oscillator with a trimmer pot
// ("発振周波数 数KHz", ch. 6.4) - no fixed frequency is specified. 2kHz is a
// representative value in that range for the on/off-keyed carrier tone.
const CARRIER_HZ = 2000;
// ~14s of audio at 110 baud; STORE DATA over a much larger range would take real
// minutes on the actual hardware too, so long transfers just skip the sound cue.
const MAX_BLOCK_BYTES = 128;

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

/**
 * Plays `block` (a CMT transfer block - see panel.ts's buildCmtBlock) as the real
 * TK-80's cassette interface would sound: each byte becomes fig. 6-1's 12-bit serial
 * word, on/off-keyed onto a few-kHz tone (ch. 6.4) - a "1" bit gates the tone on, a
 * "0" bit is silence.
 */
export function playCmtBlock(block: number[]): void {
  if (block.length === 0 || block.length > MAX_BLOCK_BYTES) return;
  const ctx = getContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = CARRIER_HZ;
  osc.connect(gain);
  gain.connect(ctx.destination);

  let t = ctx.currentTime + 0.05;
  gain.gain.setValueAtTime(0, t);
  for (const byte of block) {
    for (const bit of encodeCmtByte(byte)) {
      gain.gain.setValueAtTime(bit, t);
      t += BIT_SECONDS;
    }
  }
  gain.gain.setValueAtTime(0, t);

  osc.start();
  osc.stop(t + 0.05);
}

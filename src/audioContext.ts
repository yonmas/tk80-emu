let sharedContext: AudioContext | null = null;
let sharedMasterGain: GainNode | null = null;

/** One lazily-created AudioContext shared by cmtAudio.ts and organAudio.ts. */
export function getAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext })
    .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  if (sharedContext.state === "suspended") void sharedContext.resume();
  return sharedContext;
}

// Both the CMT tone and the OUT-driven speaker signal are full-scale (gain 0/1, or a raw
// ±1 square wave) with no headroom of their own - real hardware relies on whatever volume
// knob is on the audio amp downstream. Route everything through one shared, turned-down gain
// node instead of straight to destination, so there's a single place controlling loudness.
const MASTER_VOLUME = 0.2;

/** The shared gain node every audio source should connect to instead of ctx.destination. */
export function getMasterGain(ctx: AudioContext): GainNode {
  if (!sharedMasterGain) {
    sharedMasterGain = ctx.createGain();
    sharedMasterGain.gain.value = MASTER_VOLUME;
    sharedMasterGain.connect(ctx.destination);
  }
  return sharedMasterGain;
}

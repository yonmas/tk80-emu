import type { Cpu8080, MonitorHook } from "./cpu8080";

/**
 * Reimplements the handful of TK-80 monitor ROM subroutines that the NEC application-program
 * manual's sample programs actually CALL into (chapters 1 and 4 of "TK-80 応用プログラム",
 * IEM-561A). The real monitor ROM is NEC's copyrighted firmware and isn't included here or
 * anywhere in this project - these are independent reimplementations written strictly from the
 * *published, external calling convention* documented for programmers in the "TK-80 ユーザーズ・
 * マニアル" (IEM-560A), section 4.3 "サブルーチンの機能説明": each subroutine's entry address,
 * input/output register contract, and a worked usage example, exactly the kind of black-box API
 * reference a library's public docs would give you. None of this was derived from a ROM
 * disassembly.
 *
 * How this fits into the CPU: since there's no real ROM at these addresses, a program that
 * CALLs one (e.g. `CALL RGDSP`) would otherwise just execute zeroed memory as an endless string
 * of NOPs and hang. Cpu8080.monitorHooks intercepts execution at the documented entry address
 * instead and runs the equivalent JS logic below, then returns control the same way a real RET
 * would (or, for the two subroutines documented as blocking, doesn't return yet - see KEYIN).
 *
 * What's implemented, and what isn't - see README.md's own summary of this for the full picture:
 *   - SEGCG (0x01C0) and RGDSP (0x01A1): display update. Implemented against 4.3.1/4.3.2 and the
 *     official RAM map (3.7): DISP WORD1-4 (0x83F4-83F7) and the DATA/ADRES register mirrors
 *     (0x83EC-83EF) are modeled as real memory, matching real programs that peek at them
 *     directly. DISP DIG1-8 (0x83F8-83FF, the post-conversion segment buffer) is populated with
 *     the manual's own published per-digit segment byte values (3.6.9's table) for the same
 *     reason, even though nothing in this app's own UI reads it back (the on-screen display
 *     renders straight from the hex digit values, not from decoding segment bytes).
 *   - INPUT (0x0223) and KEYIN (0x0216): key input, per 4.3.3/4.3.4. Needs to know which of the
 *     panel's 24 scanned keys (S1-S24, listed in 4.3.3) is *currently physically held down* -
 *     see HeldKeyState, wired up from pointerdown/up in main.ts.
 *   - D1/D2/D3 (0x02DD/0x02EA/0x02EF): the timing subroutines from 4.3.7. These are documented
 *     as pure delays with no register/memory contract at all (input/output conditions: none),
 *     so they're implemented as an immediate return rather than a cycle-accurate busy-wait: the
 *     manual doesn't publish their actual instruction sequence (only the three delay durations
 *     and which registers they use internally), and no target program calls them directly, so
 *     there's nothing to verify a hand-written busy-loop against.
 *   - SEGCG/RGDSP/INPUT/KEYIN's register side effects beyond what's documented as an output
 *     parameter (both list several "used registers" as being clobbered) aren't reproduced -
 *     callers aren't meant to rely on them per the manual's own contract ("出力パラメータ: なし").
 *
 * Deliberately NOT implemented (see README.md):
 *   - SRIOT/SRIIN (0x027C/0x02A0), the CMT/serial-tape subroutines from 4.3.5/4.3.6.
 *   - The restart jump table (3.6.8, RST 2-6): this is TK-80's hardware-interrupt hook, and
 *     needs real 8080 interrupt support (EI/DI, INTE, an external IRQ line) that this CPU core
 *     doesn't have at all yet - a separate feature, not just another monitor stub.
 */

/** Documented entry addresses (4.3, "(2) スタート番地" of each subroutine). */
export const MONITOR_ADDR = {
  SEGCG: 0x01c0,
  RGDSP: 0x01a1,
  INPUT: 0x0223,
  KEYIN: 0x0216,
  D1: 0x02dd,
  D2: 0x02ea,
  D3: 0x02ef,
} as const;

/** The monitor's RAM-mapped working area (3.7 (2) モニタ・ワーキング・エリア・メモリ・マップ). */
const MEM = {
  DATA_LO: 0x83ec,
  DATA_HI: 0x83ed,
  ADRES_LO: 0x83ee,
  ADRES_HI: 0x83ef,
  DISP_WORD1: 0x83f4,
  DISP_DIG1: 0x83f8,
  KEY_FLAG: 0x83f3,
} as const;

/**
 * Hex codes for the panel's 24 scanned keys, per 4.3.3's "DIGIT & FUNCTION / HEXA DATA" table
 * (S1-S24). Hex digit keys use their own value (0x00-0x0F) and aren't listed separately here.
 * RESET isn't part of this table on real hardware either - it's a separate hardwired reset line,
 * not one of the scanned keys - so it's intentionally absent.
 */
export const FN_KEY_CODE = {
  RUN: 0x10,
  RET: 0x11,
  ADRS_SET: 0x12,
  READ_DECR: 0x13,
  READ_INCR: 0x14,
  WRITE_INCR: 0x15,
  STORE_DATA: 0x16,
  LOAD_DATA: 0x17,
} as const;

/**
 * Official per-digit segment byte values (3.6.9's table): bit0=segment A ... bit6=segment G,
 * bit7=decimal point, "1" = lit. Indexed 0-15 (hex digit -> byte). Transcribed directly from the
 * manual's own printed table rather than re-derived from segment positions, so there's no risk
 * of guessing a bit assignment wrong.
 */
const SEGMENT_FONT = [
  0x5c, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x27, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71,
];

/** Tracks which of the 24 scanned keys (see FN_KEY_CODE) is currently physically held down, if any. */
export class HeldKeyState {
  private code: number | null = null;

  press(keyCode: number): void {
    this.code = keyCode;
  }

  /** No-op if a different key is currently held - matches a stray pointerup from a different key. */
  release(keyCode: number): void {
    if (this.code === keyCode) this.code = null;
  }

  get held(): number | null {
    return this.code;
  }
}

function segcgEffect(cpu: Cpu8080, onDisplayUpdate?: (address: number, data: number) => void): void {
  const words = [0, 1, 2, 3].map((i) => cpu.readMem(MEM.DISP_WORD1 + i));
  words.forEach((word, i) => {
    cpu.writeMem(MEM.DISP_DIG1 + i * 2, SEGMENT_FONT[(word >> 4) & 0xf]);
    cpu.writeMem(MEM.DISP_DIG1 + i * 2 + 1, SEGMENT_FONT[word & 0xf]);
  });
  const [w1, w2, w3, w4] = words;
  onDisplayUpdate?.((w1 << 8) | w2, (w3 << 8) | w4);
}

/**
 * Builds the SEGCG/RGDSP/INPUT/KEYIN/D1/D2/D3 hooks and installs them on the given CPU.
 * `onDisplayUpdate` mirrors what SEGCG/RGDSP just computed onto the panel's own address/data
 * display state - it doesn't come from anywhere in the monitor's memory map, since this app's
 * UI renders from the panel's state rather than reading the segment buffer back out.
 */
export function installMonitor(
  cpu: Cpu8080,
  heldKey: HeldKeyState,
  onDisplayUpdate?: (address: number, data: number) => void,
): void {
  type KeyPoll = { kind: "new"; code: number } | { kind: "released" } | { kind: "waiting" } | { kind: "idle" };

  function pollKey(c: Cpu8080): KeyPoll {
    const held = heldKey.held;
    const flagged = c.readMem(MEM.KEY_FLAG) !== 0;
    if (held === null) {
      if (flagged) c.writeMem(MEM.KEY_FLAG, 0);
      return flagged ? { kind: "released" } : { kind: "idle" };
    }
    if (flagged) return { kind: "waiting" };
    c.writeMem(MEM.KEY_FLAG, 0xff);
    return { kind: "new", code: held };
  }

  const segcg: MonitorHook = (c) => {
    segcgEffect(c, onDisplayUpdate);
    c.returnFromHook();
    return true;
  };

  const rgdsp: MonitorHook = (c) => {
    c.writeMem(MEM.DISP_WORD1, c.readMem(MEM.ADRES_HI));
    c.writeMem(MEM.DISP_WORD1 + 1, c.readMem(MEM.ADRES_LO));
    c.writeMem(MEM.DISP_WORD1 + 2, c.readMem(MEM.DATA_HI));
    c.writeMem(MEM.DISP_WORD1 + 3, c.readMem(MEM.DATA_LO));
    segcgEffect(c, onDisplayUpdate);
    c.returnFromHook();
    return true;
  };

  // (4.3.3) INPUT never blocks: with no key held it always completes with A=FF (clearing a
  // stale flag first if needed); with a key held that was already reported, the manual's own
  // spec has it wait for release before completing - modeled by not completing this tick either.
  const input: MonitorHook = (c) => {
    const poll = pollKey(c);
    if (poll.kind === "waiting") return false;
    c.a = poll.kind === "new" ? poll.code : 0xff;
    c.returnFromHook();
    return true;
  };

  // (4.3.4) KEYIN loops "until a key is first detected as pressed" - it only ever completes on
  // a genuinely new press, never returning FF for "nothing held" the way INPUT does.
  const keyin: MonitorHook = (c) => {
    const poll = pollKey(c);
    if (poll.kind !== "new") return false;
    c.a = poll.code;
    c.returnFromHook();
    return true;
  };

  // (4.3.7) see this file's doc comment: documented as a pure delay with no register/memory
  // contract, so this is an immediate return rather than a guessed-at busy-wait.
  const timer: MonitorHook = (c) => {
    c.returnFromHook();
    return true;
  };

  cpu.monitorHooks = new Map([
    [MONITOR_ADDR.SEGCG, segcg],
    [MONITOR_ADDR.RGDSP, rgdsp],
    [MONITOR_ADDR.INPUT, input],
    [MONITOR_ADDR.KEYIN, keyin],
    [MONITOR_ADDR.D1, timer],
    [MONITOR_ADDR.D2, timer],
    [MONITOR_ADDR.D3, timer],
  ]);
}

/** Clears the monitor's KEY FLAG (0x83F3), matching a real RESET clearing the monitor's working RAM. */
export function resetMonitorState(cpu: Cpu8080): void {
  cpu.writeMem(MEM.KEY_FLAG, 0);
}

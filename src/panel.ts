import type { Cpu8080 } from "./cpu8080";
import type { Bus } from "./memory";

export type RunMode = "auto" | "step";

export interface PanelState {
  address: number;
  data: number;
  running: boolean;
  halted: boolean;
  mode: RunMode;
  loadError: boolean;
}

const CASSETTE_KEY = "tk80-cassette";

function bytesToBase64(bytes: number[]): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Encodes one byte as the real CMT (cassette) interface's 12-bit serial word (NEC
 * TK-80 User's Manual ch. 6.2, fig. 6-1): a start bit (0), then 8 data bits LSB
 * first, then 3 stop bits (1). "1" is high level, "0" is low level.
 */
export function encodeCmtByte(byte: number): number[] {
  const bits = [0];
  for (let i = 0; i < 8; i++) bits.push((byte >> i) & 1);
  bits.push(1, 1, 1);
  return bits;
}

/**
 * Builds one CMT transfer block (ch. 6.3, fig. 6-2): a 4-byte start/end address
 * header (HI, LO each), the data bytes, then a trailing checksum. NEC's exact
 * checksum algorithm isn't shown in the pages of the manual we have; this uses a
 * plain 8-bit sum, which only shapes the STORE/LOAD DATA sound effect here rather
 * than verifying data integrity.
 */
export function buildCmtBlock(start: number, end: number, bytes: number[]): number[] {
  const block = [(start >> 8) & 0xff, start & 0xff, (end >> 8) & 0xff, end & 0xff, ...bytes];
  let checksum = 0;
  for (const b of block) checksum = (checksum + b) & 0xff;
  block.push(checksum);
  return block;
}

/**
 * Re-creates the TK-80 front panel's ADRS SET / hex keys / WRITE INCR / READ
 * INCR/DECR / RUN / RET / RESET / STORE DATA / LOAD DATA workflow on top of a
 * plain 8080 + memory. There is no real TK-80 monitor ROM here (it's NEC's
 * copyrighted firmware) - this class *is* the "monitor", implemented
 * directly in TypeScript instead of being 8080 machine code read off a ROM
 * chip.
 *
 * Matches the real hardware's register model (per NEC's TK-80 user's
 * manual, ch. 3.6.3-3.6.6): a single 16-bit data register (DR) that hex
 * keys shift a nibble into at a time, and a 16-bit address register (AR).
 * There is no separate "address entry" vs "data entry" mode on the real
 * panel - it's always the same DR, and which function key you press next
 * decides whether its value is read as an address or a byte. After
 * ADRS SET / READ INCR / READ DECR / WRITE INCR, DR is shifted a *byte* at
 * a time: its low byte moves up to the high byte, and the freshly
 * read/written-then-read byte becomes the new low byte.
 *
 * The MODE switch (AUTO/STEP) picks what RUN does: AUTO free-runs until
 * HLT, STEP executes exactly one instruction and shows AR=PC, DR=(A,flags)
 * so you can inspect it - then RET executes the next one the same way.
 *
 * STORE DATA / LOAD DATA write/read the [AR, DR] memory range to/from
 * localStorage as a single "cassette" slot, standing in for the real
 * machine's audio-cassette interface. onStoreData/onLoadData additionally
 * fire with the real CMT block bytes (see buildCmtBlock) so a caller can
 * play the actual cassette-interface tone (ch. 6) - that part is optional
 * and browser-only, so it's a plain callback rather than baked in here.
 */
export class TK80Panel {
  address = 0;
  dataRegister = 0;
  running = false;
  mode: RunMode = "auto";
  loadError = false;
  onStoreData?: (block: number[]) => void;
  onLoadData?: (block: number[]) => void;

  constructor(
    private cpu: Cpu8080,
    private bus: Bus,
  ) {
    this.readAt(this.address);
  }

  private readAt(addr: number): void {
    const byte = this.bus.read8(addr);
    this.dataRegister = (((this.dataRegister & 0xff) << 8) | byte) & 0xffff;
  }

  private showStepState(): void {
    this.address = this.cpu.pc;
    this.dataRegister = ((this.cpu.a << 8) | this.cpu.getFlags()) & 0xffff;
  }

  pressHex(digit: number): void {
    if (this.running) return;
    this.loadError = false;
    this.dataRegister = ((this.dataRegister << 4) | (digit & 0xf)) & 0xffff;
  }

  pressAdrsSet(): void {
    if (this.running) return;
    this.loadError = false;
    this.address = this.dataRegister;
    this.readAt(this.address);
  }

  pressIncr(): void {
    if (this.running) return;
    this.loadError = false;
    this.address = (this.address + 1) & 0xffff;
    this.readAt(this.address);
  }

  pressDecr(): void {
    if (this.running) return;
    this.loadError = false;
    this.address = (this.address - 1) & 0xffff;
    this.readAt(this.address);
  }

  pressWrite(): void {
    if (this.running) return;
    this.loadError = false;
    this.bus.write8(this.address, this.dataRegister & 0xff);
    this.address = (this.address + 1) & 0xffff;
    this.readAt(this.address);
  }

  pressReset(): void {
    this.cpu.reset();
    this.address = 0;
    this.dataRegister = 0;
    this.running = false;
    this.loadError = false;
    this.readAt(this.address);
  }

  toggleMode(): void {
    if (this.running) return;
    this.mode = this.mode === "auto" ? "step" : "auto";
  }

  pressRun(): void {
    if (this.running) return;
    this.loadError = false;
    this.cpu.pc = this.address;
    this.cpu.halted = false;
    if (this.mode === "step") {
      this.cpu.step();
      this.showStepState();
      return;
    }
    this.running = true;
  }

  /** Continues single-stepping after a STEP-mode RUN; only meaningful in STEP mode. */
  pressRet(): void {
    if (this.running || this.mode !== "step" || this.cpu.halted) return;
    this.loadError = false;
    this.cpu.step();
    this.showStepState();
  }

  pressStoreData(): void {
    if (this.running) return;
    this.loadError = false;
    const start = this.address;
    const end = this.dataRegister;
    if (end < start) return;
    const bytes: number[] = [];
    for (let a = start; a <= end; a++) bytes.push(this.bus.read8(a & 0xffff));
    this.onStoreData?.(buildCmtBlock(start, end, bytes));
    try {
      localStorage.setItem(CASSETTE_KEY, JSON.stringify({ start, end, data: bytesToBase64(bytes) }));
    } catch {
      // storage unavailable (private browsing, quota, ...) - a real recorder with no
      // tape inserted just wouldn't record either, so this is a silent no-op.
    }
  }

  pressLoadData(): void {
    if (this.running) return;
    try {
      const raw = localStorage.getItem(CASSETTE_KEY);
      if (!raw) throw new Error("no cassette data");
      const saved = JSON.parse(raw) as { start: number; end: number; data: string };
      const bytes = atob(saved.data);
      const byteValues: number[] = [];
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes.charCodeAt(i);
        this.bus.write8((saved.start + i) & 0xffff, b);
        byteValues.push(b);
      }
      this.address = saved.start;
      this.dataRegister = saved.end;
      this.loadError = false;
      this.onLoadData?.(buildCmtBlock(saved.start, saved.end, byteValues));
    } catch {
      this.loadError = true;
    }
  }

  /** Advances the CPU by roughly `cycles` clock cycles, if currently running (AUTO mode). Returns cycles actually executed. */
  runCycles(cycles: number): number {
    if (!this.running) return 0;
    let executed = 0;
    while (executed < cycles) {
      if (this.cpu.halted) {
        this.running = false;
        this.address = this.cpu.pc;
        this.readAt(this.address);
        break;
      }
      executed += this.cpu.step();
    }
    return executed;
  }

  get state(): PanelState {
    return {
      address: this.address,
      data: this.dataRegister,
      running: this.running,
      halted: this.cpu.halted,
      mode: this.mode,
      loadError: this.loadError,
    };
  }
}

import type { Cpu8080 } from "./cpu8080";
import type { Bus } from "./memory";

export interface PanelState {
  address: number;
  data: number;
  running: boolean;
  halted: boolean;
}

/**
 * Re-creates the TK-80 front panel's ADRS SET / hex keys / WRITE INCR / READ
 * INCR/DECR / RUN / RESET workflow on top of a plain 8080 + memory. There is
 * no real TK-80 monitor ROM here (it's NEC's copyrighted firmware) - this
 * class *is* the "monitor", implemented directly in TypeScript instead of
 * being 8080 machine code read off a ROM chip.
 *
 * Matches the real hardware's register model (per NEC's TK-80 user's manual,
 * ch. 3.6.3-3.6.4): a single 16-bit data register (DR) that hex keys shift a
 * nibble into at a time, and a 16-bit address register (AR). There is no
 * separate "address entry" vs "data entry" mode on the real panel - it's
 * always the same DR, and which function key you press next decides whether
 * its value is read as an address or a byte. After ADRS SET / READ INCR /
 * READ DECR / WRITE INCR, DR is shifted a *byte* at a time: its low byte
 * moves up to the high byte, and the freshly read/written-then-read byte
 * becomes the new low byte - so DR's top two digits show the previous byte,
 * not a second live byte.
 */
export class TK80Panel {
  address = 0;
  dataRegister = 0;
  running = false;

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

  pressHex(digit: number): void {
    if (this.running) return;
    this.dataRegister = ((this.dataRegister << 4) | (digit & 0xf)) & 0xffff;
  }

  pressAdrsSet(): void {
    if (this.running) return;
    this.address = this.dataRegister;
    this.readAt(this.address);
  }

  pressIncr(): void {
    if (this.running) return;
    this.address = (this.address + 1) & 0xffff;
    this.readAt(this.address);
  }

  pressDecr(): void {
    if (this.running) return;
    this.address = (this.address - 1) & 0xffff;
    this.readAt(this.address);
  }

  pressWrite(): void {
    if (this.running) return;
    this.bus.write8(this.address, this.dataRegister & 0xff);
    this.address = (this.address + 1) & 0xffff;
    this.readAt(this.address);
  }

  pressReset(): void {
    this.cpu.reset();
    this.address = 0;
    this.dataRegister = 0;
    this.running = false;
    this.readAt(this.address);
  }

  pressRun(): void {
    if (this.running) return;
    this.cpu.pc = this.address;
    this.cpu.halted = false;
    this.running = true;
  }

  /** Advances the CPU by roughly `cycles` clock cycles, if currently running. Returns cycles actually executed. */
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
    };
  }
}

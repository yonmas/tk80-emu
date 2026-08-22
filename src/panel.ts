import type { Cpu8080 } from "./cpu8080";
import type { Bus } from "./memory";

export type EntryTarget = "address" | "data";

export interface PanelState {
  address: number;
  data: number;
  entryTarget: EntryTarget;
  running: boolean;
  halted: boolean;
}

/**
 * Re-creates the TK-80 front panel's address/data entry workflow (ADRS SET,
 * hex keys, WRITE, INCR/DECR, RUN, RESET) on top of a plain 8080 + memory.
 * There is no real TK-80 monitor ROM here (it's NEC's copyrighted firmware) -
 * this class *is* the "monitor", implemented directly in TypeScript instead
 * of being 8080 machine code read off a ROM chip.
 */
export class TK80Panel {
  address = 0;
  pendingData = 0;
  entryTarget: EntryTarget = "address";
  running = false;
  private addressDigits = 0;

  constructor(
    private cpu: Cpu8080,
    private bus: Bus,
  ) {
    this.pendingData = this.bus.read8(this.address);
  }

  private armDataEntry(): void {
    this.entryTarget = "data";
    this.pendingData = this.bus.read8(this.address);
  }

  pressHex(digit: number): void {
    if (this.running) return;
    if (this.entryTarget === "address") {
      this.address = ((this.address << 4) | (digit & 0xf)) & 0xffff;
      this.addressDigits++;
      if (this.addressDigits >= 4) {
        this.addressDigits = 0;
        this.armDataEntry();
      }
    } else {
      this.pendingData = ((this.pendingData << 4) | (digit & 0xf)) & 0xff;
    }
  }

  pressAdrsSet(): void {
    if (this.running) return;
    this.entryTarget = "address";
    this.addressDigits = 0;
  }

  pressWrite(): void {
    if (this.running) return;
    if (this.entryTarget !== "data") {
      this.armDataEntry();
      return;
    }
    this.bus.write8(this.address, this.pendingData);
  }

  pressIncr(): void {
    if (this.running) return;
    this.address = (this.address + 1) & 0xffff;
    this.armDataEntry();
  }

  pressDecr(): void {
    if (this.running) return;
    this.address = (this.address - 1) & 0xffff;
    this.armDataEntry();
  }

  pressReset(): void {
    this.cpu.reset();
    this.address = 0;
    this.addressDigits = 0;
    this.entryTarget = "address";
    this.running = false;
    this.armDataEntry();
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
        this.armDataEntry();
        break;
      }
      executed += this.cpu.step();
    }
    return executed;
  }

  get state(): PanelState {
    return {
      address: this.address,
      data: this.entryTarget === "data" ? this.pendingData : this.bus.read8(this.address),
      entryTarget: this.entryTarget,
      running: this.running,
      halted: this.cpu.halted,
    };
  }
}

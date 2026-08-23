import { describe, expect, it } from "vitest";
import { Cpu8080 } from "../src/cpu8080";
import { Memory } from "../src/memory";
import { TK80Panel } from "../src/panel";

function makePanel(): { panel: TK80Panel; mem: Memory; cpu: Cpu8080 } {
  const mem = new Memory();
  const cpu = new Cpu8080(mem);
  const panel = new TK80Panel(cpu, mem);
  return { panel, mem, cpu };
}

// vitest's default "node" environment has no Web Storage API, so STORE/LOAD DATA
// tests install this tiny in-memory stand-in on globalThis before running.
class MemoryStorage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  clear(): void {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function installMemoryStorage(): void {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
}

// These mirror the worked examples in NEC's TK-80 user's manual (ch. 3.6.4),
// which describes the data register as a 16-bit shift register shared by
// address entry and byte-at-a-time reads/writes - not two separate modes.
describe("TK80Panel (matches the real front panel's DR/AR shift-register behavior)", () => {
  it("ADRS SET loads DR into AR, then shifts a read byte into DR's low byte", () => {
    const { panel } = makePanel();
    for (const d of [8, 2, 1, 2]) panel.pressHex(d);
    panel.pressAdrsSet();
    // manual example: typing 8212 then ADRS SET on blank memory -> ADDRESS 8212, DATA 1200
    expect(panel.state.address).toBe(0x8212);
    expect(panel.state.data).toBe(0x1200);
  });

  it("WRITE INCR writes DR's low byte, advances the address, and reads the new byte in", () => {
    const { panel, mem } = makePanel();
    for (const d of [8, 2, 1, 2]) panel.pressHex(d);
    panel.pressAdrsSet();
    for (const d of [0xa, 0xb]) panel.pressHex(d);
    panel.pressWrite();
    expect(mem.read8(0x8212)).toBe(0xab);
    expect(panel.state.address).toBe(0x8213);
    expect(panel.state.data).toBe(0xab00);
  });

  it("READ INCR/DECR step the address and shift the newly read byte into DR", () => {
    const { panel, mem } = makePanel();
    mem.loadBytes(0x9000, [0x11, 0x22, 0x33]);
    panel.address = 0x9000;
    panel.pressIncr();
    expect(panel.state.address).toBe(0x9001);
    expect(panel.state.data).toBe(0x0022);
    panel.pressIncr();
    expect(panel.state.data).toBe(0x2233);
    panel.pressDecr();
    expect(panel.state.address).toBe(0x9001);
    expect(panel.state.data).toBe(0x3322);
  });

  it("RESET clears AR, DR, and halts execution", () => {
    const { panel } = makePanel();
    for (const d of [1, 2, 3, 4]) panel.pressHex(d);
    panel.pressAdrsSet();
    panel.pressRun();
    panel.pressReset();
    expect(panel.state.address).toBe(0);
    expect(panel.state.data).toBe(0);
    expect(panel.state.running).toBe(false);
  });
});

// Manual ch. 3.6.5: in STEP mode, RUN executes exactly one instruction and
// shows AR=PC, DR=(A, flags); RET keeps stepping the same way.
describe("TK80Panel MODE switch (AUTO vs STEP) and RET", () => {
  it("STEP mode: RUN executes one instruction and shows PC/A/flags in AR/DR", () => {
    const { panel, mem, cpu } = makePanel();
    mem.loadBytes(0x9000, [0x3e, 0x05, 0x3c, 0x76]); // MVI A,05 ; INR A ; HLT
    panel.address = 0x9000;
    panel.toggleMode();
    expect(panel.state.mode).toBe("step");

    panel.pressRun();
    expect(cpu.pc).toBe(0x9002);
    expect(cpu.a).toBe(0x05);
    expect(panel.state.address).toBe(cpu.pc);
    expect(panel.state.data).toBe((cpu.a << 8) | cpu.getFlags());

    panel.pressRet();
    expect(cpu.pc).toBe(0x9003);
    expect(cpu.a).toBe(0x06);
    expect(panel.state.address).toBe(cpu.pc);
    expect(panel.state.data).toBe((cpu.a << 8) | cpu.getFlags());
  });

  it("AUTO mode ignores RET and free-runs on RUN instead", () => {
    const { panel, mem } = makePanel();
    mem.loadBytes(0x9000, [0x76]); // HLT
    panel.address = 0x9000;
    panel.pressRun();
    expect(panel.state.running).toBe(true);
    panel.pressRet(); // no-op outside STEP mode
    expect(panel.state.running).toBe(true);
    panel.runCycles(100);
    expect(panel.state.halted).toBe(true);
    expect(panel.state.running).toBe(false);
  });
});

describe("TK80Panel STORE DATA / LOAD DATA (cassette stand-in via localStorage)", () => {
  it("round-trips a memory range through localStorage", () => {
    installMemoryStorage();
    const { panel, mem } = makePanel();
    mem.loadBytes(0x9000, [0x11, 0x22, 0x33, 0x44]);
    panel.address = 0x9000;
    panel.dataRegister = 0x9003; // end address
    panel.pressStoreData();

    const { panel: panel2, mem: mem2 } = makePanel();
    panel2.pressLoadData();

    expect(panel2.state.loadError).toBe(false);
    expect(panel2.state.address).toBe(0x9000);
    expect(panel2.state.data).toBe(0x9003);
    expect([mem2.read8(0x9000), mem2.read8(0x9001), mem2.read8(0x9002), mem2.read8(0x9003)]).toEqual([
      0x11, 0x22, 0x33, 0x44,
    ]);
  });

  it("shows the E error state when there's nothing to load", () => {
    installMemoryStorage();
    const { panel } = makePanel();
    panel.pressLoadData();
    expect(panel.state.loadError).toBe(true);
  });
});

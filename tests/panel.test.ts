import { describe, expect, it } from "vitest";
import { Cpu8080 } from "../src/cpu8080";
import { Memory } from "../src/memory";
import { TK80Panel } from "../src/panel";

function makePanel(): { panel: TK80Panel; mem: Memory } {
  const mem = new Memory();
  const cpu = new Cpu8080(mem);
  const panel = new TK80Panel(cpu, mem);
  return { panel, mem };
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

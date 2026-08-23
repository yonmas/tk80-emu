import { describe, expect, it } from "vitest";
import { Cpu8080 } from "../src/cpu8080";
import { Memory } from "../src/memory";
import { TK80Panel } from "../src/panel";
import { MONITOR_ADDR } from "../src/monitor";

function makePanel(): { cpu: Cpu8080; mem: Memory; panel: TK80Panel } {
  const mem = new Memory();
  const cpu = new Cpu8080(mem);
  const panel = new TK80Panel(cpu, mem);
  return { cpu, mem, panel };
}

function run(cpu: Cpu8080, maxSteps = 5000): void {
  for (let i = 0; i < maxSteps && !cpu.halted; i++) cpu.step();
}

describe("monitor: SEGCG (NEC TK-80 ユーザーズ・マニアル IEM-560A, 4.3.1 使用例)", () => {
  it("reproduces the manual's own worked example: 01234567 across both displays", () => {
    const { cpu, mem, panel } = makePanel();
    // prettier-ignore
    mem.loadBytes(0x8200, [
      0x3e, 0x01, 0x32, 0xf4, 0x83, // MVI A,1  / STA 83F4H
      0x3e, 0x23, 0x32, 0xf5, 0x83, // MVI A,23H / STA 83F5H
      0x3e, 0x45, 0x32, 0xf6, 0x83, // MVI A,45H / STA 83F6H
      0x3e, 0x67, 0x32, 0xf7, 0x83, // MVI A,67H / STA 83F7H
      0xcd, 0xc0, 0x01,             // CALL SEGCG
      0x76,                         // HLT
    ]);
    cpu.pc = 0x8200;
    run(cpu);

    expect(cpu.halted).toBe(true);
    expect(panel.address).toBe(0x0123);
    expect(panel.dataRegister).toBe(0x4567);
    // the officially published per-digit segment font (3.6.9) actually got written
    expect(mem.read8(0x83f8)).toBe(0x5c); // '0'
    expect(mem.read8(0x83f9)).toBe(0x06); // '1'
    expect(mem.read8(0x83ff)).toBe(0x27); // '7'
  });
});

describe("monitor: RGDSP (NEC TK-80 ユーザーズ・マニアル IEM-560A, 4.3.2 使用例)", () => {
  it("reproduces the manual's own worked example: ADRES=1234H, DATA=ABCDH", () => {
    const { cpu, mem, panel } = makePanel();
    // prettier-ignore
    mem.loadBytes(0x8200, [
      0x21, 0x34, 0x12, // LXI H,1234H
      0x11, 0xcd, 0xab, // LXI D,0ABCDH
      0x22, 0xee, 0x83, // SHLD ADRES (83EEH)
      0xeb,             // XCHG
      0x22, 0xec, 0x83, // SHLD DATA (83ECH)
      0xcd, 0xa1, 0x01, // CALL RGDSP
      0x76,             // HLT
    ]);
    cpu.pc = 0x8200;
    run(cpu);

    expect(cpu.halted).toBe(true);
    expect(panel.address).toBe(0x1234);
    expect(panel.dataRegister).toBe(0xabcd);
  });
});

describe("monitor: RGDSP driven by a real application program (NEC TK-80 応用プログラム IEM-561A, ch.1 ディジタル・タイマ)", () => {
  it("counts centiseconds up in BCD while RGDSP mirrors DE onto the panel display, unmodified from the manual", () => {
    const { cpu, mem, panel } = makePanel();
    // Full object code transcribed from section 1.4. Free-runs forever (JMP COUNT) counting a
    // BCD clock in BC (hours:minutes) / DE (seconds:centiseconds), calling the real RGDSP entry
    // point (0x01A1) every pass and a local WAIT subroutine (0x8245, not a monitor call) to pace
    // it to roughly 1/100s. This is the same program that originally motivated implementing
    // RGDSP: it hangs without it (an endless string of zeroed-memory NOPs at 0x01A1).
    // prettier-ignore
    const program = [
      0x01, 0x00, 0x00, 0x11, 0x00, 0x00, 0xc5, 0xe1, 0x22, 0xee, 0x83, 0xd5, 0xe1, 0x22, 0xec, 0x83,
      0xc5, 0xd5, 0xcd, 0xa1, 0x01, 0xcd, 0x45, 0x82, 0xd1, 0xc1, 0x7b, 0xc6, 0x01, 0x27, 0x5f, 0x7a,
      0xce, 0x00, 0x27, 0xfe, 0x60, 0xca, 0x2c, 0x82, 0x57, 0xc3, 0x06, 0x82, 0x16, 0x00, 0x79, 0xc6,
      0x01, 0x27, 0xfe, 0x60, 0xca, 0x3b, 0x82, 0x4f, 0xc3, 0x06, 0x82, 0x0e, 0x00, 0x78, 0xc6, 0x01,
      0x27, 0x47, 0xc3, 0x06, 0x82, 0x16, 0x04, 0x1e, 0xf3, 0x1d, 0xc2, 0x49, 0x82, 0x15, 0xc2, 0x47,
      0x82, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc9,
    ];
    mem.loadBytes(0x8200, program);
    cpu.pc = 0x8200;

    const seenCentiseconds: number[] = [-1];
    for (let i = 0; i < 2_000_000 && seenCentiseconds.length <= 6; i++) {
      cpu.step();
      const cs = panel.dataRegister & 0xff;
      if (seenCentiseconds[seenCentiseconds.length - 1] !== cs) seenCentiseconds.push(cs);
    }

    expect(seenCentiseconds.slice(1)).toEqual([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    // seconds/minutes/hours haven't rolled over yet this early
    expect(panel.dataRegister >> 8).toBe(0);
    expect(panel.address).toBe(0);
  });
});

describe("monitor: KEYIN/INPUT (4.3.3/4.3.4), invoked through their real entry addresses", () => {
  // A minimal harness rather than transcribing ch.4's full 80-line note-lookup table: what's
  // under test here is the monitor hook itself (whether a real CALL to 0x0216/0x0223 behaves
  // per the documented state machine), not ch.4's own CPI/CZ dispatch logic on top of it.
  function keyinHarness(): { cpu: Cpu8080; panel: TK80Panel } {
    const mem = new Memory();
    const cpu = new Cpu8080(mem);
    const panel = new TK80Panel(cpu, mem);
    // CALL KEYIN ; MOV C,A ; HLT
    mem.loadBytes(0x8200, [0xcd, 0x16, 0x02, 0x4f, 0x76]);
    cpu.pc = 0x8200;
    return { cpu, panel };
  }

  it("blocks (never halts) while no key is held", () => {
    const { cpu } = keyinHarness();
    for (let i = 0; i < 100_000; i++) cpu.step();
    expect(cpu.halted).toBe(false);
    expect(cpu.pc).toBe(MONITOR_ADDR.KEYIN);
  });

  it("completes with the held key's code once a key is pressed, per the 4.3.3 DIGIT & FUNCTION table", () => {
    const { cpu, panel } = keyinHarness();
    panel.heldKey.press(0x05); // hex key "5" -> HEXA DATA 05 (S6 in the manual's table)
    run(cpu, 1000);
    expect(cpu.halted).toBe(true);
    expect(cpu.c).toBe(0x05);
  });

  it("does not re-report the same still-held key a second time (KEY FLAG semantics)", () => {
    const { cpu, panel } = keyinHarness();
    panel.heldKey.press(0x05);
    run(cpu, 1000);
    expect(cpu.c).toBe(0x05);

    // still holding the same key, run a second KEYIN call from scratch - must keep blocking
    cpu.halted = false;
    cpu.pc = 0x8200;
    for (let i = 0; i < 100_000; i++) cpu.step();
    expect(cpu.halted).toBe(false);
    expect(cpu.pc).toBe(MONITOR_ADDR.KEYIN);

    // release and press again -> a genuinely new press, reports again
    panel.heldKey.release(0x05);
    for (let i = 0; i < 1000 && !cpu.halted; i++) cpu.step(); // still blocking (idle in between)
    expect(cpu.halted).toBe(false);
    panel.heldKey.press(0x05);
    for (let i = 0; i < 1000 && !cpu.halted; i++) cpu.step();
    expect(cpu.halted).toBe(true);
    expect(cpu.c).toBe(0x05);
  });

  it("INPUT (0x0223) never blocks: returns A=FF immediately when no key is held", () => {
    const mem = new Memory();
    const cpu = new Cpu8080(mem);
    new TK80Panel(cpu, mem);
    // CALL INPUT ; MOV C,A ; HLT
    mem.loadBytes(0x8200, [0xcd, 0x23, 0x02, 0x4f, 0x76]);
    cpu.pc = 0x8200;
    run(cpu, 100);
    expect(cpu.halted).toBe(true);
    expect(cpu.c).toBe(0xff);
  });

  it("INPUT returns a fresh press immediately, matching KEYIN's key code", () => {
    const mem = new Memory();
    const cpu = new Cpu8080(mem);
    const panel = new TK80Panel(cpu, mem);
    mem.loadBytes(0x8200, [0xcd, 0x23, 0x02, 0x4f, 0x76]);
    cpu.pc = 0x8200;
    panel.heldKey.press(0x0a); // hex key "A"
    run(cpu, 100);
    expect(cpu.halted).toBe(true);
    expect(cpu.c).toBe(0x0a);
  });
});

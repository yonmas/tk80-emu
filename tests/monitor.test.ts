import { describe, expect, it } from "vitest";
import { Cpu8080, type IoBus } from "../src/cpu8080";
import { Memory } from "../src/memory";
import { TK80Panel } from "../src/panel";
import { MONITOR_ADDR } from "../src/monitor";
import { SAMPLE_PROGRAMS } from "../src/samplePrograms";

function findSample(name: string): number[] {
  const sample = SAMPLE_PROGRAMS.find((s) => s.name === name);
  if (!sample) throw new Error(`no sample program named ${name}`);
  return sample.bytes;
}

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
    // Full object code transcribed from section 1.4 - see src/samplePrograms.ts. Free-runs
    // forever (JMP COUNT) counting a BCD clock in BC (hours:minutes) / DE (seconds:centiseconds),
    // calling the real RGDSP entry point (0x01A1) every pass and a local WAIT subroutine (0x8245,
    // not a monitor call) to pace it to roughly 1/100s. This is the same program that originally
    // motivated implementing RGDSP: it hangs without it (an endless string of zeroed-memory NOPs
    // at 0x01A1).
    const program = findSample("第1章 ディジタル・タイマ");
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

describe("monitor: KEYIN driving a real application program (NEC TK-80 応用プログラム IEM-561A, ch.4 電子オルガン)", () => {
  it("dispatches each pressed key to SOUND with the right on/off pulse shape, and sustains while held", () => {
    const mem = new Memory();
    // Full object code transcribed from section 4.3 - see src/samplePrograms.ts, keyed off the
    // real KEYIN entry point (0x0216) rather than a synthetic harness like the KEYIN/INPUT
    // tests below - this is what originally motivated implementing KEYIN in the first place.
    // Ch.4 clears the monitor's KEY FLAG itself (the XRA A / STA 83F3H before JMP START) rather
    // than relying on KEYIN's own re-report suppression, so a still-held key re-triggers SOUND
    // every pass through the main loop - that's the mechanism that sustains a note for as long
    // as the key is held. "5" dispatches to B=24H (ファ#) via the CPI 5 branch.
    const program = findSample("第4章 電子オルガン");
    mem.loadBytes(0x8200, program);

    const outputs: number[] = [];
    const io: IoBus = {
      output: (port, value) => {
        expect(port).toBe(2);
        outputs.push(value);
      },
      input: () => 0,
    };
    const cpu = new Cpu8080(mem, io);
    const panel = new TK80Panel(cpu, mem);
    cpu.pc = 0x8200;

    // "5" key -> B=24H (ファ#, per the CPI 5 branch above). Unlike ch.2/ch.5's WAIT subroutine,
    // SOUND's own busy-wait re-issues the *same* OUT value on every pass of its D countdown
    // rather than OUTing once and counting cycles separately - so one half-cycle is B identical
    // OUT calls back to back, not one. E=1AH such half-cycles (on, off, on, off, ...).
    const b = 0x24;
    const e = 0x1a;
    const perCall = e * 2 * b;

    panel.heldKey.press(0x05);
    for (let i = 0; i < 200_000 && outputs.length < perCall; i++) cpu.step();
    expect(outputs.length).toBe(perCall);
    for (let half = 0; half < e * 2; half++) {
      const expected = half % 2 === 0 ? 2 : 0;
      for (let j = 0; j < b; j++) expect(outputs[half * b + j]).toBe(expected);
    }

    for (let i = 0; i < 200_000 && outputs.length < perCall * 2; i++) cpu.step();
    expect(outputs.length).toBe(perCall * 2); // still held -> retriggered a second time, unprompted

    panel.heldKey.release(0x05);
    const countAfterRelease = outputs.length;
    for (let i = 0; i < 200_000; i++) cpu.step();
    expect(outputs.length).toBe(countAfterRelease); // released -> back to blocking on KEYIN
    expect(cpu.pc).toBe(MONITOR_ADDR.KEYIN);
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

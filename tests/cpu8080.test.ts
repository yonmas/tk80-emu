import { describe, expect, it } from "vitest";
import { Cpu8080, type IoBus } from "../src/cpu8080";
import { Memory } from "../src/memory";

function makeCpu(program: number[], loadAddr = 0): { cpu: Cpu8080; mem: Memory } {
  const mem = new Memory();
  mem.loadBytes(loadAddr, program);
  const cpu = new Cpu8080(mem);
  cpu.pc = loadAddr;
  return { cpu, mem };
}

function run(cpu: Cpu8080, maxSteps = 1000): void {
  for (let i = 0; i < maxSteps && !cpu.halted; i++) {
    cpu.step();
  }
}

describe("Cpu8080 basic arithmetic", () => {
  it("adds two immediates via registers", () => {
    // MVI A,05 ; MVI B,03 ; ADD B ; HLT
    const { cpu } = makeCpu([0x3e, 0x05, 0x06, 0x03, 0x80, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(8);
    expect(cpu.halted).toBe(true);
    expect(cpu.z).toBe(false);
  });

  it("sets the zero flag when a subtraction result is zero", () => {
    // MVI A,05 ; MVI B,05 ; SUB B ; HLT
    const { cpu } = makeCpu([0x3e, 0x05, 0x06, 0x05, 0x90, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(0);
    expect(cpu.z).toBe(true);
    expect(cpu.cy).toBe(false);
  });

  it("sets carry on overflowing addition", () => {
    // MVI A,FF ; MVI B,02 ; ADD B ; HLT
    const { cpu } = makeCpu([0x3e, 0xff, 0x06, 0x02, 0x80, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(0x01);
    expect(cpu.cy).toBe(true);
  });
});

describe("Cpu8080 control flow", () => {
  it("takes an unconditional jump", () => {
    // JMP 0x0005 ; (0x03 unused) ; HLT-at-target: MVI A,AA ; HLT
    const { cpu } = makeCpu([0xc3, 0x05, 0x00, 0x00, 0x00, 0x3e, 0xaa, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(0xaa);
    expect(cpu.halted).toBe(true);
  });

  it("loops with a conditional jump until the counter reaches zero", () => {
    // MVI B,03 ; loop: DCR B ; JNZ loop ; HLT
    const { cpu } = makeCpu([0x06, 0x03, 0x05, 0xc2, 0x02, 0x00, 0x76]);
    run(cpu);
    expect(cpu.b).toBe(0);
    expect(cpu.halted).toBe(true);
  });

  it("calls and returns via the stack", () => {
    // MVI A,00 ; CALL sub ; HLT ; sub: MVI A,7B ; RET
    const { cpu } = makeCpu([0x3e, 0x00, 0xcd, 0x06, 0x00, 0x76, 0x3e, 0x7b, 0xc9]);
    cpu.sp = 0x0100;
    run(cpu);
    expect(cpu.a).toBe(0x7b);
    expect(cpu.halted).toBe(true);
  });
});

describe("Cpu8080 memory and registers", () => {
  it("stores and loads through a register pair pointer", () => {
    // LXI H,9000 ; MVI M,42 ; MOV A,M ; HLT
    const { cpu, mem } = makeCpu([0x21, 0x00, 0x90, 0x36, 0x42, 0x7e, 0x76]);
    run(cpu);
    expect(mem.read8(0x9000)).toBe(0x42);
    expect(cpu.a).toBe(0x42);
  });

  it("round-trips register pairs through push/pop", () => {
    // LXI B,1234 ; PUSH B ; LXI B,0000 ; POP B ; HLT
    const { cpu } = makeCpu([0x01, 0x34, 0x12, 0xc5, 0x01, 0x00, 0x00, 0xc1, 0x76]);
    cpu.sp = 0x0100;
    run(cpu);
    expect(cpu.b).toBe(0x12);
    expect(cpu.c).toBe(0x34);
  });
});

describe("Cpu8080 DAA", () => {
  it("corrects a BCD addition that overflows the low nibble", () => {
    // MVI A,09 ; MVI B,01 ; ADD B ; DAA ; HLT  ->  9 + 1 = 10 (BCD "10")
    const { cpu } = makeCpu([0x3e, 0x09, 0x06, 0x01, 0x80, 0x27, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(0x10);
    expect(cpu.cy).toBe(false);
  });
});

describe("Cpu8080 IN/OUT", () => {
  it("advances PC past the port byte with no IoBus attached", () => {
    // the TK-80 panel runs the CPU with no IoBus (see main.ts), so OUT/IN must
    // still consume their port-number operand even when there's nothing to call
    // OUT 05 ; MVI A,42 ; HLT - if OUT fails to advance PC past 05, the 05 byte
    // gets decoded as the next opcode instead of MVI A,42, and A stays 0
    const { cpu } = makeCpu([0xd3, 0x05, 0x3e, 0x42, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(0x42);
    expect(cpu.halted).toBe(true);
  });

  it("advances PC past the port byte and sets A=0xff with no IoBus attached", () => {
    // IN 05 ; MVI B,42 ; HLT - same desync check as OUT, from the read side
    const { cpu } = makeCpu([0xdb, 0x05, 0x06, 0x42, 0x76]);
    run(cpu);
    expect(cpu.a).toBe(0xff);
    expect(cpu.b).toBe(0x42);
    expect(cpu.halted).toBe(true);
  });

  it("routes OUT/IN through an attached IoBus", () => {
    const written: { port: number; value: number }[] = [];
    const io: IoBus = {
      output: (port, value) => written.push({ port, value }),
      input: (port) => 0x10 + port,
    };
    const mem = new Memory();
    // MVI A,42 ; OUT 07 ; IN 03 ; HLT
    mem.loadBytes(0, [0x3e, 0x42, 0xd3, 0x07, 0xdb, 0x03, 0x76]);
    const cpu = new Cpu8080(mem, io);
    run(cpu);
    expect(written).toEqual([{ port: 0x07, value: 0x42 }]);
    expect(cpu.a).toBe(0x13);
    expect(cpu.halted).toBe(true);
  });
});

describe("Cpu8080 real-world program (NEC TK-80 Application Program manual)", () => {
  it("runs the 'electronic siren' program (ch.2) exactly as coded in the manual", () => {
    // Full object code transcribed from NEC's "TK-80 応用プログラム" (IEM-561A), chapter 2
    // "電子サイレン" (electronic siren), section 2.4 コーディング例. Self-contained - unlike most
    // of the manual's other sample programs, it doesn't call into the monitor ROM (which this
    // emulator doesn't include) - it just sweeps a frequency parameter in B down from 0x50 to
    // 0x40 and back up, OUTing an alternating square wave to port 2, timed by a local WAIT
    // subroutine. That mix of OUT, DCX/INX B, CPI/JNZ, and a nested CALL/PUSH/DCR/JNZ/POP/RET
    // subroutine is exactly the shape of code that hid the OUT/IN port-byte-skip bug, so this
    // is a genuine (not synthetic) regression check against a real published TK-80 program.
    // prettier-ignore
    const program = [
      0x06, 0x50, 0x3e, 0x02, 0xd3, 0x02, 0xcd, 0x33, 0x82, 0x3e, 0x00, 0xd3, 0x02, 0xcd, 0x33, 0x82,
      0x0b, 0x78, 0xfe, 0x40, 0x47, 0xc2, 0x02, 0x82, 0x06, 0x40, 0x3e, 0x02, 0xd3, 0x02, 0xcd, 0x33,
      0x82, 0x3e, 0x00, 0xd3, 0x02, 0xcd, 0x33, 0x82, 0x03, 0x78, 0xfe, 0x50, 0x47, 0xc2, 0x1a, 0x82,
      0xc3, 0x00, 0x82, 0xc5, 0x05, 0xc2, 0x34, 0x82, 0xc1, 0xc9,
    ];
    const mem = new Memory();
    mem.loadBytes(0x8200, program);
    const outputs: { port: number; value: number }[] = [];
    const io: IoBus = { output: (port, value) => outputs.push({ port, value }), input: () => 0 };
    const cpu = new Cpu8080(mem, io);
    cpu.pc = 0x8200;

    // The program free-runs forever (it JMPs back to START), so run it for a generous but
    // bounded number of steps: enough to sweep B all the way down to the 0x40 floor (end of
    // LOOP1) and see it climb back past that floor in LOOP2, then stop.
    let sawFloor = false;
    let climbedBack = false;
    for (let i = 0; i < 200_000 && !climbedBack; i++) {
      cpu.step();
      if (cpu.b === 0x40) sawFloor = true;
      if (sawFloor && cpu.b > 0x40) climbedBack = true;
    }

    expect(sawFloor).toBe(true);
    expect(climbedBack).toBe(true);
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.every((o) => o.port === 2)).toBe(true);
    // each pulse cycle is a "2" (tone on) immediately followed by a "0" (tone off)
    outputs.forEach((o, i) => expect(o.value).toBe(i % 2 === 0 ? 2 : 0));
  });

  it("runs the 'automatic music-play' program (ch.5) with a short custom tune", () => {
    // Full object code transcribed from the same manual, chapter 5 "音楽の自動演奏プログラム"
    // (automatic music-play program), section 5.4. Also self-contained - no monitor ROM calls.
    // It reads (pitch, duration) byte pairs from a data table starting at 8250H, plays each
    // pitch through the same OUT-driven square-wave envelope as chapter 2's SOUND subroutine,
    // treats a pitch byte with its top bit set as a rest (silence - the WAIT path, no OUT calls
    // at all), and a pitch byte of 0x00 as "end of song", which loops execution back to START to
    // replay it. The manual (5.5) leaves the actual tune's bytes up to the user, so the data
    // below is a short hand-picked tune in its documented format, not itself from the manual.
    // prettier-ignore
    const program = [
      0x21, 0x50, 0x82, 0x7e, 0xa7, 0xca, 0x00, 0x82, 0x23, 0x4e, 0x47, 0x07, 0xda, 0x3c, 0x82, 0xe5,
      0xcd, 0x1c, 0x82, 0xe1, 0x0d, 0xc2, 0x0f, 0x82, 0x23, 0xc3, 0x03, 0x82, 0x21, 0xff, 0x35, 0x50,
      0x3e, 0x02, 0xd3, 0x02, 0x2b, 0x7c, 0xa7, 0xc8, 0x15, 0xc2, 0x24, 0x82, 0x50, 0x3e, 0x00, 0xd3,
      0x02, 0x2b, 0x7c, 0xa7, 0xc8, 0x15, 0xc2, 0x31, 0x82, 0xc3, 0x1f, 0x82, 0xe5, 0x21, 0xff, 0x50,
      0x2b, 0x7c, 0xa7, 0xc2, 0x40, 0x82, 0x0d, 0xc2, 0x3d, 0x82, 0xe1, 0x23, 0xc3, 0x03, 0x82,
    ];
    const mem = new Memory();
    mem.loadBytes(0x8200, program);
    // ド (0x33) for 1 unit, a rest (top bit set) for 1 unit, レ (0x2D) for 1 unit, then the
    // 0x00 end-of-song sentinel - per the manual's pitch-parameter table (5.5) and format.
    mem.loadBytes(0x8250, [0x33, 0x01, 0x80, 0x01, 0x2d, 0x01, 0x00]);

    // Each CALL to SOUND restarts its own on/off cycle independent of where the *previous* call
    // happened to end (SOUND can RZ out mid-cycle, on either polarity), so two "on" pulses can
    // legitimately land back to back right at a note boundary. Segment the recorded pulses by
    // SOUND call (entered at 0x821C) instead of asserting alternation across the whole stream.
    const runs: number[][] = [];
    let currentRun: number[] = [];
    const pitchesUsed = new Set<number>();
    const io: IoBus = {
      output: (port, value) => {
        expect(port).toBe(2);
        currentRun.push(value);
        pitchesUsed.add(cpu.b);
      },
      input: () => 0,
    };
    const cpu = new Cpu8080(mem, io);
    cpu.pc = 0x8200;

    // The song loops forever, so run for a generous but bounded step budget and count how many
    // times execution enters START (0x8200): the first is the initial run, a second means the
    // 0x00 sentinel was read and correctly looped the song back to the beginning.
    let starts = 0;
    for (let i = 0; i < 1_000_000 && starts < 2; i++) {
      if (cpu.pc === 0x8200) {
        starts++;
        if (starts === 2) break;
      }
      if (cpu.pc === 0x821c && currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
      cpu.step();
    }
    if (currentRun.length > 0) runs.push(currentRun);

    expect(starts).toBe(2);
    // one CALL SOUND per real note (duration 1 each) - the rest never calls SOUND at all
    expect(runs.length).toBe(2);
    for (const run of runs) {
      run.forEach((v, i) => expect(v).toBe(i % 2 === 0 ? 2 : 0));
    }
    // only the two real notes (0x33 = ド, 0x2D = レ) ever reach the audio port - the rest
    // (0x80, top bit set) never triggers OUT at all
    expect(pitchesUsed).toEqual(new Set([0x33, 0x2d]));
  });
});

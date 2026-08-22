import { describe, expect, it } from "vitest";
import { Cpu8080 } from "../src/cpu8080";
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

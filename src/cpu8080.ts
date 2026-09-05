import type { Bus } from "./memory";

export interface IoBus {
  input(port: number): number;
  output(port: number, value: number): void;
}

/**
 * A stand-in for one monitor ROM subroutine, keyed by its documented entry address (see
 * src/monitor.ts). Called once per step() while PC sits at that address, in place of decoding
 * whatever's actually in memory there (there is no real ROM there - see monitor.ts's own doc
 * comment for why). Returns true once the call has completed - i.e. it already popped the
 * return address off the stack into pc, the same way a RET would - or false to leave pc
 * untouched and be called again next step(), for a subroutine documented as blocking (KEYIN).
 */
export type MonitorHook = (cpu: Cpu8080) => boolean;

const REG_B = 0;
const REG_C = 1;
const REG_D = 2;
const REG_E = 3;
const REG_H = 4;
const REG_L = 5;
const REG_M = 6;
const REG_A = 7;

export class Cpu8080 {
  a = 0;
  b = 0;
  c = 0;
  d = 0;
  e = 0;
  h = 0;
  l = 0;
  sp = 0;
  pc = 0;

  s = false;
  z = false;
  ac = false;
  p = false;
  cy = false;

  interruptsEnabled = false;
  halted = false;

  /**
   * Real 8080 hardware: EI doesn't take effect until the instruction right after it has
   * retired (so e.g. EI/RET pairs used to re-enable interrupts on the way out of an ISR
   * can't be interrupted again immediately). Counts down 2->1->0 across the two step()
   * calls following EI (its own and the next instruction's); interruptsEnabled flips to
   * true the moment it hits 0, i.e. right as that next instruction retires.
   */
  private eiDelayCountdown = 0;

  /**
   * Running total of clock cycles executed, for anything that needs to relate CPU time to
   * real time (e.g. src/organAudio.ts scheduling OUT-driven speaker toggles). Doesn't reset
   * on reset() - the real crystal oscillator wouldn't either.
   */
  cycleCount = 0;

  /** Monitor-subroutine stand-ins, keyed by entry address. See MonitorHook's doc comment. */
  monitorHooks?: Map<number, MonitorHook>;

  constructor(
    private bus: Bus,
    private io?: IoBus,
  ) {}

  /** Pops a return address off the stack into pc, the same way RET does. For MonitorHook use. */
  returnFromHook(): void {
    this.pc = this.pop16();
  }

  reset(): void {
    this.a = this.b = this.c = this.d = this.e = this.h = this.l = 0;
    this.sp = 0;
    this.pc = 0;
    this.s = this.z = this.ac = this.p = this.cy = false;
    this.interruptsEnabled = false;
    this.halted = false;
    this.eiDelayCountdown = 0;
  }

  /** Runs one instruction and returns the number of clock cycles it took. */
  step(): number {
    if (this.halted) {
      this.tickEiDelay();
      return 4;
    }
    const hook = this.monitorHooks?.get(this.pc);
    if (hook) {
      hook(this);
      this.cycleCount += 17; // roughly a CALL's worth; monitor hooks aren't cycle-timed
      this.tickEiDelay();
      return 17;
    }
    const opcode = this.fetch8();
    const cycles = this.execute(opcode);
    this.cycleCount += cycles;
    this.tickEiDelay();
    return cycles;
  }

  private tickEiDelay(): void {
    if (this.eiDelayCountdown > 0 && --this.eiDelayCountdown === 0) {
      this.interruptsEnabled = true;
    }
  }

  /** Direct memory access for MonitorHook implementations (the monitor's own RAM-mapped state). */
  readMem(addr: number): number {
    return this.bus.read8(addr);
  }
  writeMem(addr: number, value: number): void {
    this.bus.write8(addr, value);
  }

  /** Vectors a maskable interrupt (RST n) if interrupts are enabled. Returns whether it was accepted. */
  requestInterrupt(vector: number): boolean {
    if (!this.interruptsEnabled) return false;
    this.interruptsEnabled = false;
    this.halted = false;
    this.push16(this.pc);
    this.pc = (vector & 7) * 8;
    return true;
  }

  /** The 8080 flags register (S Z 0 AC 0 P 1 CY), packed the way PUSH PSW writes it. */
  getFlags(): number {
    return this.getF();
  }

  private fetch8(): number {
    const v = this.bus.read8(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    return v;
  }

  private fetch16(): number {
    const lo = this.fetch8();
    const hi = this.fetch8();
    return (hi << 8) | lo;
  }

  private getBC(): number {
    return (this.b << 8) | this.c;
  }
  private setBC(v: number): void {
    this.b = (v >> 8) & 0xff;
    this.c = v & 0xff;
  }
  private getDE(): number {
    return (this.d << 8) | this.e;
  }
  private setDE(v: number): void {
    this.d = (v >> 8) & 0xff;
    this.e = v & 0xff;
  }
  private getHL(): number {
    return (this.h << 8) | this.l;
  }
  private setHL(v: number): void {
    this.h = (v >> 8) & 0xff;
    this.l = v & 0xff;
  }

  private getReg(code: number): number {
    switch (code) {
      case REG_B:
        return this.b;
      case REG_C:
        return this.c;
      case REG_D:
        return this.d;
      case REG_E:
        return this.e;
      case REG_H:
        return this.h;
      case REG_L:
        return this.l;
      case REG_M:
        return this.bus.read8(this.getHL());
      case REG_A:
        return this.a;
      default:
        throw new Error(`invalid register code ${code}`);
    }
  }

  private setReg(code: number, value: number): void {
    const v = value & 0xff;
    switch (code) {
      case REG_B:
        this.b = v;
        break;
      case REG_C:
        this.c = v;
        break;
      case REG_D:
        this.d = v;
        break;
      case REG_E:
        this.e = v;
        break;
      case REG_H:
        this.h = v;
        break;
      case REG_L:
        this.l = v;
        break;
      case REG_M:
        this.bus.write8(this.getHL(), v);
        break;
      case REG_A:
        this.a = v;
        break;
    }
  }

  private getF(): number {
    return (
      (this.s ? 0x80 : 0) |
      (this.z ? 0x40 : 0) |
      (this.ac ? 0x10 : 0) |
      (this.p ? 0x04 : 0) |
      0x02 |
      (this.cy ? 0x01 : 0)
    );
  }

  private setF(value: number): void {
    this.s = (value & 0x80) !== 0;
    this.z = (value & 0x40) !== 0;
    this.ac = (value & 0x10) !== 0;
    this.p = (value & 0x04) !== 0;
    this.cy = (value & 0x01) !== 0;
  }

  private push16(value: number): void {
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write8(this.sp, (value >> 8) & 0xff);
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write8(this.sp, value & 0xff);
  }

  private pop16(): number {
    const lo = this.bus.read8(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    const hi = this.bus.read8(this.sp);
    this.sp = (this.sp + 1) & 0xffff;
    return (hi << 8) | lo;
  }

  private parity(value: number): boolean {
    let v = value & 0xff;
    let bits = 0;
    while (v) {
      bits += v & 1;
      v >>= 1;
    }
    return bits % 2 === 0;
  }

  private updateZSP(value: number): void {
    const v = value & 0xff;
    this.z = v === 0;
    this.s = (v & 0x80) !== 0;
    this.p = this.parity(v);
  }

  private add(value: number, carryIn: number): void {
    const a = this.a;
    const sum = a + value + carryIn;
    this.ac = (a & 0xf) + (value & 0xf) + carryIn > 0xf;
    this.cy = sum > 0xff;
    this.a = sum & 0xff;
    this.updateZSP(this.a);
  }

  private sub(value: number, borrowIn: number): void {
    const a = this.a;
    const result = a - value - borrowIn;
    // The 8080 computes subtraction internally as an addition of the two's complement, so AC
    // (carry out of bit 3 of THAT addition) ends up set when there's NO half-borrow - the
    // opposite sense from add()'s AC. (8080 software never reads AC after a subtract anyway -
    // DAA only follows ADD - so this doesn't affect any real program's behavior.)
    this.ac = (a & 0xf) - (value & 0xf) - borrowIn >= 0;
    this.cy = result < 0;
    this.a = result & 0xff;
    this.updateZSP(this.a);
  }

  private cmp(value: number): void {
    const a = this.a;
    const result = a - value;
    this.ac = (a & 0xf) - (value & 0xf) >= 0;
    this.cy = result < 0;
    this.updateZSP(result & 0xff);
  }

  private ana(value: number): void {
    // Real 8080 hardware quirk: AC is set from the OR of bit 3 of both operands, not a real half-carry.
    this.ac = ((this.a | value) & 0x08) !== 0;
    this.a = this.a & value & 0xff;
    this.cy = false;
    this.updateZSP(this.a);
  }

  private xra(value: number): void {
    this.a = (this.a ^ value) & 0xff;
    this.cy = false;
    this.ac = false;
    this.updateZSP(this.a);
  }

  private ora(value: number): void {
    this.a = (this.a | value) & 0xff;
    this.cy = false;
    this.ac = false;
    this.updateZSP(this.a);
  }

  private inr(value: number): number {
    const result = (value + 1) & 0xff;
    this.ac = (value & 0xf) === 0xf;
    this.updateZSP(result);
    return result;
  }

  private dcr(value: number): number {
    const result = (value - 1) & 0xff;
    this.ac = (value & 0xf) !== 0x0;
    this.updateZSP(result);
    return result;
  }

  private dad(value: number): void {
    const hl = this.getHL();
    const sum = hl + value;
    this.cy = sum > 0xffff;
    this.setHL(sum & 0xffff);
  }

  private rlc(): void {
    const carry = (this.a & 0x80) !== 0;
    this.a = ((this.a << 1) | (carry ? 1 : 0)) & 0xff;
    this.cy = carry;
  }

  private rrc(): void {
    const carry = (this.a & 0x01) !== 0;
    this.a = ((this.a >> 1) | (carry ? 0x80 : 0)) & 0xff;
    this.cy = carry;
  }

  private ral(): void {
    const carryIn = this.cy ? 1 : 0;
    const carryOut = (this.a & 0x80) !== 0;
    this.a = ((this.a << 1) | carryIn) & 0xff;
    this.cy = carryOut;
  }

  private rar(): void {
    const carryIn = this.cy ? 0x80 : 0;
    const carryOut = (this.a & 0x01) !== 0;
    this.a = ((this.a >> 1) | carryIn) & 0xff;
    this.cy = carryOut;
  }

  private daa(): void {
    const a = this.a;
    let correction = 0;
    let carry = this.cy;
    if (this.ac || (a & 0x0f) > 9) {
      correction += 0x06;
    }
    if (this.cy || (a >> 4) > 9 || ((a >> 4) === 9 && (a & 0x0f) > 9)) {
      correction += 0x60;
      carry = true;
    }
    const result = a + correction;
    this.ac = (a & 0x0f) + (correction & 0x0f) > 0x0f;
    this.a = result & 0xff;
    this.cy = carry;
    this.updateZSP(this.a);
  }

  private xthl(): void {
    const lo = this.bus.read8(this.sp);
    const hi = this.bus.read8((this.sp + 1) & 0xffff);
    this.bus.write8(this.sp, this.l);
    this.bus.write8((this.sp + 1) & 0xffff, this.h);
    this.l = lo;
    this.h = hi;
  }

  private aluOp(op: number, value: number): void {
    switch (op) {
      case 0:
        this.add(value, 0);
        break;
      case 1:
        this.add(value, this.cy ? 1 : 0);
        break;
      case 2:
        this.sub(value, 0);
        break;
      case 3:
        this.sub(value, this.cy ? 1 : 0);
        break;
      case 4:
        this.ana(value);
        break;
      case 5:
        this.xra(value);
        break;
      case 6:
        this.ora(value);
        break;
      case 7:
        this.cmp(value);
        break;
    }
  }

  private jmpIf(cond: boolean): number {
    const addr = this.fetch16();
    if (cond) this.pc = addr;
    return 10;
  }

  private callIf(cond: boolean): number {
    const addr = this.fetch16();
    if (cond) {
      this.push16(this.pc);
      this.pc = addr;
      return 17;
    }
    return 11;
  }

  private call(): number {
    const addr = this.fetch16();
    this.push16(this.pc);
    this.pc = addr;
    return 17;
  }

  private retIf(cond: boolean): number {
    if (cond) {
      this.pc = this.pop16();
      return 11;
    }
    return 5;
  }

  private rst(n: number): void {
    this.push16(this.pc);
    this.pc = n * 8;
  }

  private execute(op: number): number {
    if (op === 0x76) {
      this.halted = true;
      return 7;
    }
    if (op >= 0x40 && op <= 0x7f) {
      const dst = (op >> 3) & 7;
      const src = op & 7;
      this.setReg(dst, this.getReg(src));
      return dst === REG_M || src === REG_M ? 7 : 5;
    }
    if (op >= 0x80 && op <= 0xbf) {
      const alu = (op >> 3) & 7;
      const src = op & 7;
      this.aluOp(alu, this.getReg(src));
      return src === REG_M ? 7 : 4;
    }

    switch (op) {
      case 0x00:
        return 4; // NOP
      case 0x01:
        this.setBC(this.fetch16());
        return 10; // LXI B,d16
      case 0x02:
        this.bus.write8(this.getBC(), this.a);
        return 7; // STAX B
      case 0x03:
        this.setBC((this.getBC() + 1) & 0xffff);
        return 5; // INX B
      case 0x04:
        this.b = this.inr(this.b);
        return 5;
      case 0x05:
        this.b = this.dcr(this.b);
        return 5;
      case 0x06:
        this.b = this.fetch8();
        return 7;
      case 0x07:
        this.rlc();
        return 4;
      case 0x08:
        return 4; // undocumented NOP
      case 0x09:
        this.dad(this.getBC());
        return 10;
      case 0x0a:
        this.a = this.bus.read8(this.getBC());
        return 7; // LDAX B
      case 0x0b:
        this.setBC((this.getBC() - 1) & 0xffff);
        return 5; // DCX B
      case 0x0c:
        this.c = this.inr(this.c);
        return 5;
      case 0x0d:
        this.c = this.dcr(this.c);
        return 5;
      case 0x0e:
        this.c = this.fetch8();
        return 7;
      case 0x0f:
        this.rrc();
        return 4;

      case 0x10:
        return 4; // undocumented NOP
      case 0x11:
        this.setDE(this.fetch16());
        return 10;
      case 0x12:
        this.bus.write8(this.getDE(), this.a);
        return 7;
      case 0x13:
        this.setDE((this.getDE() + 1) & 0xffff);
        return 5;
      case 0x14:
        this.d = this.inr(this.d);
        return 5;
      case 0x15:
        this.d = this.dcr(this.d);
        return 5;
      case 0x16:
        this.d = this.fetch8();
        return 7;
      case 0x17:
        this.ral();
        return 4;
      case 0x18:
        return 4; // undocumented NOP
      case 0x19:
        this.dad(this.getDE());
        return 10;
      case 0x1a:
        this.a = this.bus.read8(this.getDE());
        return 7;
      case 0x1b:
        this.setDE((this.getDE() - 1) & 0xffff);
        return 5;
      case 0x1c:
        this.e = this.inr(this.e);
        return 5;
      case 0x1d:
        this.e = this.dcr(this.e);
        return 5;
      case 0x1e:
        this.e = this.fetch8();
        return 7;
      case 0x1f:
        this.rar();
        return 4;

      case 0x20:
        return 4; // undocumented NOP
      case 0x21:
        this.setHL(this.fetch16());
        return 10;
      case 0x22: {
        const addr = this.fetch16();
        this.bus.write8(addr, this.l);
        this.bus.write8((addr + 1) & 0xffff, this.h);
        return 16; // SHLD
      }
      case 0x23:
        this.setHL((this.getHL() + 1) & 0xffff);
        return 5;
      case 0x24:
        this.h = this.inr(this.h);
        return 5;
      case 0x25:
        this.h = this.dcr(this.h);
        return 5;
      case 0x26:
        this.h = this.fetch8();
        return 7;
      case 0x27:
        this.daa();
        return 4;
      case 0x28:
        return 4; // undocumented NOP
      case 0x29:
        this.dad(this.getHL());
        return 10;
      case 0x2a: {
        const addr = this.fetch16();
        this.l = this.bus.read8(addr);
        this.h = this.bus.read8((addr + 1) & 0xffff);
        return 16; // LHLD
      }
      case 0x2b:
        this.setHL((this.getHL() - 1) & 0xffff);
        return 5;
      case 0x2c:
        this.l = this.inr(this.l);
        return 5;
      case 0x2d:
        this.l = this.dcr(this.l);
        return 5;
      case 0x2e:
        this.l = this.fetch8();
        return 7;
      case 0x2f:
        this.a = ~this.a & 0xff;
        return 4; // CMA

      case 0x30:
        return 4; // undocumented NOP
      case 0x31:
        this.sp = this.fetch16();
        return 10;
      case 0x32:
        this.bus.write8(this.fetch16(), this.a);
        return 13; // STA
      case 0x33:
        this.sp = (this.sp + 1) & 0xffff;
        return 5;
      case 0x34: {
        const addr = this.getHL();
        this.bus.write8(addr, this.inr(this.bus.read8(addr)));
        return 10;
      }
      case 0x35: {
        const addr = this.getHL();
        this.bus.write8(addr, this.dcr(this.bus.read8(addr)));
        return 10;
      }
      case 0x36:
        this.bus.write8(this.getHL(), this.fetch8());
        return 10;
      case 0x37:
        this.cy = true;
        return 4; // STC
      case 0x38:
        return 4; // undocumented NOP
      case 0x39:
        this.dad(this.sp);
        return 10;
      case 0x3a:
        this.a = this.bus.read8(this.fetch16());
        return 13; // LDA
      case 0x3b:
        this.sp = (this.sp - 1) & 0xffff;
        return 5;
      case 0x3c:
        this.a = this.inr(this.a);
        return 5;
      case 0x3d:
        this.a = this.dcr(this.a);
        return 5;
      case 0x3e:
        this.a = this.fetch8();
        return 7;
      case 0x3f:
        this.cy = !this.cy;
        return 4; // CMC

      case 0xc0:
        return this.retIf(!this.z); // RNZ
      case 0xc1:
        this.setBC(this.pop16());
        return 10;
      case 0xc2:
        return this.jmpIf(!this.z);
      case 0xc3:
        this.pc = this.fetch16();
        return 10;
      case 0xc4:
        return this.callIf(!this.z);
      case 0xc5:
        this.push16(this.getBC());
        return 11;
      case 0xc6:
        this.add(this.fetch8(), 0);
        return 7; // ADI
      case 0xc7:
        this.rst(0);
        return 11;
      case 0xc8:
        return this.retIf(this.z); // RZ
      case 0xc9:
        this.pc = this.pop16();
        return 10; // RET
      case 0xca:
        return this.jmpIf(this.z);
      case 0xcb:
        this.pc = this.fetch16();
        return 10; // undocumented JMP dup
      case 0xcc:
        return this.callIf(this.z);
      case 0xcd:
        return this.call();
      case 0xce:
        this.add(this.fetch8(), this.cy ? 1 : 0);
        return 7; // ACI
      case 0xcf:
        this.rst(1);
        return 11;

      case 0xd0:
        return this.retIf(!this.cy); // RNC
      case 0xd1:
        this.setDE(this.pop16());
        return 10;
      case 0xd2:
        return this.jmpIf(!this.cy);
      case 0xd3: {
        const port = this.fetch8();
        this.io?.output(port, this.a);
        return 10; // OUT
      }
      case 0xd4:
        return this.callIf(!this.cy);
      case 0xd5:
        this.push16(this.getDE());
        return 11;
      case 0xd6:
        this.sub(this.fetch8(), 0);
        return 7; // SUI
      case 0xd7:
        this.rst(2);
        return 11;
      case 0xd8:
        return this.retIf(this.cy); // RC
      case 0xd9:
        this.pc = this.pop16();
        return 10; // undocumented RET dup
      case 0xda:
        return this.jmpIf(this.cy);
      case 0xdb: {
        const port = this.fetch8();
        this.a = this.io?.input(port) ?? 0xff;
        return 10; // IN
      }
      case 0xdc:
        return this.callIf(this.cy);
      case 0xdd:
        return this.call(); // undocumented CALL dup
      case 0xde:
        this.sub(this.fetch8(), this.cy ? 1 : 0);
        return 7; // SBI
      case 0xdf:
        this.rst(3);
        return 11;

      case 0xe0:
        return this.retIf(!this.p); // RPO
      case 0xe1:
        this.setHL(this.pop16());
        return 10;
      case 0xe2:
        return this.jmpIf(!this.p);
      case 0xe3:
        this.xthl();
        return 18;
      case 0xe4:
        return this.callIf(!this.p);
      case 0xe5:
        this.push16(this.getHL());
        return 11;
      case 0xe6:
        this.ana(this.fetch8());
        return 7; // ANI
      case 0xe7:
        this.rst(4);
        return 11;
      case 0xe8:
        return this.retIf(this.p); // RPE
      case 0xe9:
        this.pc = this.getHL();
        return 5; // PCHL
      case 0xea:
        return this.jmpIf(this.p);
      case 0xeb: {
        const hl = this.getHL();
        this.setHL(this.getDE());
        this.setDE(hl);
        return 5; // XCHG
      }
      case 0xec:
        return this.callIf(this.p);
      case 0xed:
        return this.call(); // undocumented CALL dup
      case 0xee:
        this.xra(this.fetch8());
        return 7; // XRI
      case 0xef:
        this.rst(5);
        return 11;

      case 0xf0:
        return this.retIf(!this.s); // RP
      case 0xf1: {
        const psw = this.pop16();
        this.a = (psw >> 8) & 0xff;
        this.setF(psw & 0xff);
        return 10;
      }
      case 0xf2:
        return this.jmpIf(!this.s);
      case 0xf3:
        this.interruptsEnabled = false;
        return 4; // DI
      case 0xf4:
        return this.callIf(!this.s);
      case 0xf5:
        this.push16((this.a << 8) | this.getF());
        return 11;
      case 0xf6:
        this.ora(this.fetch8());
        return 7; // ORI
      case 0xf7:
        this.rst(6);
        return 11;
      case 0xf8:
        return this.retIf(this.s); // RM
      case 0xf9:
        this.sp = this.getHL();
        return 5; // SPHL
      case 0xfa:
        return this.jmpIf(this.s);
      case 0xfb:
        // Doesn't flip interruptsEnabled here - see eiDelayCountdown's doc comment.
        this.eiDelayCountdown = 2;
        return 4; // EI
      case 0xfc:
        return this.callIf(this.s);
      case 0xfd:
        return this.call(); // undocumented CALL dup
      case 0xfe:
        this.cmp(this.fetch8());
        return 7; // CPI
      case 0xff:
        this.rst(7);
        return 11;

      default:
        // Unreachable: every value 0x00-0xFF is handled above or by the MOV/ALU blocks.
        throw new Error(`unimplemented opcode 0x${op.toString(16)}`);
    }
  }
}

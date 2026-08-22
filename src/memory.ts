export interface Bus {
  read8(addr: number): number;
  write8(addr: number, value: number): void;
}

export class Memory implements Bus {
  private data: Uint8Array;

  constructor(size = 0x10000) {
    this.data = new Uint8Array(size);
  }

  read8(addr: number): number {
    return this.data[addr & 0xffff];
  }

  write8(addr: number, value: number): void {
    this.data[addr & 0xffff] = value & 0xff;
  }

  reset(): void {
    this.data.fill(0);
  }

  loadBytes(addr: number, bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) {
      this.data[(addr + i) & 0xffff] = bytes[i] & 0xff;
    }
  }
}

import { Cpu8080 } from "./cpu8080";
import { Memory } from "./memory";
import { TK80Panel } from "./panel";

const SEGMENT_MAP: Record<string, string[]> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "d", "c"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  A: ["a", "b", "c", "e", "f", "g"],
  B: ["c", "d", "e", "f", "g"],
  C: ["a", "d", "e", "f"],
  D: ["b", "c", "d", "e", "g"],
  E: ["a", "d", "e", "f", "g"],
  F: ["a", "e", "f", "g"],
  "-": ["g"],
  "": [],
};

const SEG_NAMES = ["a", "b", "c", "d", "e", "f", "g"] as const;

class SevenSegDigit {
  el: HTMLDivElement;
  private segEls: Record<string, HTMLDivElement> = {};

  constructor() {
    this.el = document.createElement("div");
    this.el.className = "digit";
    for (const seg of SEG_NAMES) {
      const s = document.createElement("div");
      s.className = `seg seg-${seg}`;
      this.el.appendChild(s);
      this.segEls[seg] = s;
    }
  }

  set(ch: string): void {
    const active = new Set(SEGMENT_MAP[ch.toUpperCase()] ?? []);
    for (const seg of SEG_NAMES) {
      this.segEls[seg].classList.toggle("on", active.has(seg));
    }
  }
}

function hexDigits(value: number, count: number): string[] {
  const s = value.toString(16).toUpperCase().padStart(count, "0").slice(-count);
  return s.split("");
}

const app = document.getElementById("app")!;

const memory = new Memory();
const cpu = new Cpu8080(memory);
const panel = new TK80Panel(cpu, memory);

app.innerHTML = "";

const heading = document.createElement("h1");
heading.textContent = "TK-80 emulator";
app.appendChild(heading);

const caseEl = document.createElement("div");
caseEl.className = "case";
app.appendChild(caseEl);

const displayEl = document.createElement("div");
displayEl.className = "display";
caseEl.appendChild(displayEl);

const addressGroup = document.createElement("div");
addressGroup.className = "digits group-gap";
const addressDigits = [0, 1, 2, 3].map(() => new SevenSegDigit());
addressDigits.forEach((d) => addressGroup.appendChild(d.el));
displayEl.appendChild(addressGroup);

const dataGroup = document.createElement("div");
dataGroup.className = "digits";
const dataDigits = [0, 1].map(() => new SevenSegDigit());
dataDigits.forEach((d) => dataGroup.appendChild(d.el));
displayEl.appendChild(dataGroup);

const statusEl = document.createElement("div");
statusEl.className = "status";
displayEl.appendChild(statusEl);

const fnKeysEl = document.createElement("div");
fnKeysEl.className = "fnkeys";
caseEl.appendChild(fnKeysEl);

function makeFnButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "fn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  fnKeysEl.appendChild(btn);
  return btn;
}

makeFnButton("RESET", () => panel.pressReset());
makeFnButton("ADRS SET", () => panel.pressAdrsSet());
makeFnButton("↑ INCR", () => panel.pressIncr());
makeFnButton("↓ DECR", () => panel.pressDecr());
makeFnButton("WRITE", () => panel.pressWrite());
makeFnButton("RUN", () => panel.pressRun());

const keysEl = document.createElement("div");
keysEl.className = "keys";
caseEl.appendChild(keysEl);

const KEY_ORDER = ["C", "D", "E", "F", "8", "9", "A", "B", "4", "5", "6", "7", "0", "1", "2", "3"];
for (const key of KEY_ORDER) {
  const btn = document.createElement("button");
  btn.textContent = key;
  btn.addEventListener("click", () => panel.pressHex(parseInt(key, 16)));
  keysEl.appendChild(btn);
}

const loaderEl = document.createElement("div");
loaderEl.className = "loader";
caseEl.appendChild(loaderEl);

const loaderLabel = document.createElement("label");
loaderLabel.textContent = "load @";
loaderEl.appendChild(loaderLabel);

const loadAddrInput = document.createElement("input");
loadAddrInput.type = "text";
loadAddrInput.value = "8000";
loadAddrInput.style.maxWidth = "70px";
loaderEl.appendChild(loadAddrInput);

const loadBytesInput = document.createElement("input");
loadBytesInput.type = "text";
loadBytesInput.placeholder = "hex bytes, e.g. 3E 05 06 03 80 76";
loaderEl.appendChild(loadBytesInput);

const loadBtn = document.createElement("button");
loadBtn.className = "fn";
loadBtn.textContent = "Load";
loadBtn.addEventListener("click", () => {
  const addr = parseInt(loadAddrInput.value, 16) & 0xffff;
  const bytes = loadBytesInput.value
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map((s) => parseInt(s, 16) & 0xff);
  if (bytes.length === 0 || bytes.some((b) => Number.isNaN(b))) return;
  memory.loadBytes(addr, bytes);
  panel.address = addr;
  panel.entryTarget = "data";
  panel.pendingData = memory.read8(addr);
});
loaderEl.appendChild(loadBtn);

const hintEl = document.createElement("div");
hintEl.className = "hint";
hintEl.textContent =
  "実機のモニターROMは著作物のため同梱していません。ADRS SET→番地入力→16進キーでデータ入力→WRITEで書き込み、" +
  "RUNでその番地から実行できます。動作確認用に「load @」欄からアドレス指定でプログラムを直接ロードすることも可能です。";
caseEl.appendChild(hintEl);

function render(): void {
  const s = panel.state;
  hexDigits(s.address, 4).forEach((ch, i) => addressDigits[i].set(ch));
  hexDigits(s.data, 2).forEach((ch, i) => dataDigits[i].set(ch));

  const parts: string[] = [s.entryTarget === "address" ? "ADDR" : "DATA"];
  if (s.running) parts.push('<span class="running">RUN</span>');
  else if (s.halted) parts.push('<span class="halted">HALT</span>');
  statusEl.innerHTML = parts.join(" &middot; ");
}

const CYCLES_PER_SECOND = 500_000;
let lastTime = performance.now();

function frame(now: number): void {
  const elapsed = (now - lastTime) / 1000;
  lastTime = now;
  if (panel.running) {
    const budget = Math.max(1, Math.floor(elapsed * CYCLES_PER_SECOND));
    panel.runCycles(budget);
  }
  render();
  requestAnimationFrame(frame);
}

render();
requestAnimationFrame(frame);

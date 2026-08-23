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
const wordmark = document.createElement("span");
wordmark.className = "wordmark";
wordmark.textContent = "TK-80";
const tag = document.createElement("span");
tag.className = "tag";
tag.textContent = "emulator";
heading.append(wordmark, tag);
app.appendChild(heading);

const caseEl = document.createElement("div");
caseEl.className = "case";
app.appendChild(caseEl);

const displayEl = document.createElement("div");
displayEl.className = "display";
caseEl.appendChild(displayEl);

const statusEl = document.createElement("div");
statusEl.className = "status";
displayEl.appendChild(statusEl);

const addressGroup = document.createElement("div");
addressGroup.className = "digits group-gap";
const addressDigits = [0, 1, 2, 3].map(() => new SevenSegDigit());
addressDigits.forEach((d) => addressGroup.appendChild(d.el));
displayEl.appendChild(addressGroup);

const dataGroup = document.createElement("div");
dataGroup.className = "digits";
const dataDigits = [0, 1, 2, 3].map(() => new SevenSegDigit());
dataDigits.forEach((d) => dataGroup.appendChild(d.el));
displayEl.appendChild(dataGroup);

function makeFnButton(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "fn";
  // the real key caps print two-word labels on two lines (e.g. "ADRS" / "SET")
  btn.innerHTML = label.includes(" ") ? label.replace(" ", "<br>") : label;
  btn.addEventListener("click", onClick);
  parent.appendChild(btn);
  return btn;
}

// One grid holds every key - top row, hex keypad, right-hand function column, and MODE -
// so all 5 columns share the same tracks and line up across every row, like the real board.
const keygridEl = document.createElement("div");
keygridEl.className = "keygrid";
caseEl.appendChild(keygridEl);

// top row, matches the real board's 5-key row: RET RUN STORE DATA LOAD DATA RESET
makeFnButton(keygridEl, "RET", () => panel.pressRet());
makeFnButton(keygridEl, "RUN", () => panel.pressRun());
makeFnButton(keygridEl, "STORE DATA", () => panel.pressStoreData());
makeFnButton(keygridEl, "LOAD DATA", () => panel.pressLoadData());
makeFnButton(keygridEl, "RESET", () => panel.pressReset());

// 4 rows of hex keys, each followed by the real board's matching right-column function key
const HEX_ROWS = [
  ["C", "D", "E", "F"],
  ["8", "9", "A", "B"],
  ["4", "5", "6", "7"],
  ["0", "1", "2", "3"],
];
const ROW_FN_KEYS: [string, () => void][] = [
  ["ADRS SET", () => panel.pressAdrsSet()],
  ["READ INCR", () => panel.pressIncr()],
  ["READ DECR", () => panel.pressDecr()],
  ["WRITE INCR", () => panel.pressWrite()],
];
HEX_ROWS.forEach((row, i) => {
  for (const key of row) {
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.addEventListener("click", () => panel.pressHex(parseInt(key, 16)));
    keygridEl.appendChild(btn);
  }
  const [label, onClick] = ROW_FN_KEYS[i];
  makeFnButton(keygridEl, label, onClick);
});

// MODE switch: AUTO free-runs to HLT, STEP executes one instruction per RUN/RET press.
// Not one of the real board's 25 keys - it's a separate toggle switch - so it's placed
// in its own row below the grid (CSS pins it under the right-hand function-key column).
const modeBtn = makeFnButton(keygridEl, `MODE ${panel.mode.toUpperCase()}`, () => {
  panel.toggleMode();
  modeBtn.innerHTML = `MODE<br>${panel.mode.toUpperCase()}`;
});
modeBtn.className = "fn mode";

// "load @" sits on its own row above the address field, and the hex-byte field plus
// Load button share the row below - splitting what used to be one cramped row (which
// overflowed on narrow/mobile screens) into two that each fit comfortably.
const loaderEl = document.createElement("div");
loaderEl.className = "loader";
caseEl.appendChild(loaderEl);

const addrRowEl = document.createElement("div");
addrRowEl.className = "loader-row";
loaderEl.appendChild(addrRowEl);

const loaderLabel = document.createElement("label");
loaderLabel.textContent = "load @";
addrRowEl.appendChild(loaderLabel);

const loadAddrInput = document.createElement("input");
loadAddrInput.type = "text";
loadAddrInput.value = "8000";
addrRowEl.appendChild(loadAddrInput);

const bytesRowEl = document.createElement("div");
bytesRowEl.className = "loader-row";
loaderEl.appendChild(bytesRowEl);

const loadBytesInput = document.createElement("input");
loadBytesInput.type = "text";
loadBytesInput.placeholder = "hex bytes, e.g. 3E 05 06 03 80 76";
bytesRowEl.appendChild(loadBytesInput);

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
  panel.dataRegister = memory.read8(addr);
});
bytesRowEl.appendChild(loadBtn);

// operating-instructions card has an English and a Japanese version; the button just
// swaps which one is visible, since this content lives in index.html, not #app.
const langToggleBtn = document.getElementById("lang-toggle");
const manualEnEl = document.querySelector(".manual-lang-en");
const manualJaEl = document.querySelector(".manual-lang-ja");
langToggleBtn?.addEventListener("click", () => {
  manualEnEl?.toggleAttribute("hidden");
  manualJaEl?.toggleAttribute("hidden");
});

function render(): void {
  const s = panel.state;
  if (s.loadError) {
    ["E", "-", "-", "-"].forEach((ch, i) => addressDigits[i].set(ch));
    ["-", "-", "-", "-"].forEach((ch, i) => dataDigits[i].set(ch));
  } else {
    hexDigits(s.address, 4).forEach((ch, i) => addressDigits[i].set(ch));
    hexDigits(s.data, 4).forEach((ch, i) => dataDigits[i].set(ch));
  }

  if (s.running) statusEl.innerHTML = '<span class="running">RUN</span>';
  else if (s.halted) statusEl.innerHTML = '<span class="halted">HALT</span>';
  else statusEl.innerHTML = "";
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

import { Cpu8080, type IoBus } from "./cpu8080";
import { Memory } from "./memory";
import { TK80Panel } from "./panel";
import { playCmtBlock } from "./cmtAudio";
import { SpeakerIoBus, CPU_CLOCK_HZ } from "./organAudio";
import { InfiniteScaleIoBus } from "./infiniteScaleAudio";
import { SAMPLE_PROGRAMS } from "./samplePrograms";
import { initTutorial } from "./tutorial";
import { FN_KEY_CODE } from "./monitor";

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
const speaker = new SpeakerIoBus();
const infiniteScale = new InfiniteScaleIoBus();
// port 2 (electronic organ/siren/metronome/auto-play) and port 1 (infinite scale) are disjoint,
// so both buses can just see every OUT and no-op on the ports they don't own.
const io: IoBus = {
  output: (port, value) => {
    speaker.output(port, value);
    infiniteScale.output(port, value);
  },
  input: () => 0xff,
};
const cpu = new Cpu8080(memory, io);
speaker.setCycleSource(() => cpu.cycleCount);
infiniteScale.setCycleSource(() => cpu.cycleCount);
const panel = new TK80Panel(cpu, memory);
panel.onStoreData = playCmtBlock;
panel.onLoadData = playCmtBlock;

app.innerHTML = "";

const heading = document.createElement("h1");
// the wordmark/tag split is purely visual (two flex items styled differently); give the
// heading an explicit accessible name so screen readers and search engines see one coherent
// phrase, "TK-80 emulator", rather than two abrupt fragments with no space between them.
heading.setAttribute("aria-label", "TK-80 emulator");
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

// Tracks which of the 24 scanned keys (see monitor.ts's FN_KEY_CODE) is currently physically
// held down, independent of the click handlers below - this is what the reimplemented KEYIN/
// INPUT monitor subroutines poll, matching a running program's own live view of the keyboard.
function wireHeldKey(btn: HTMLButtonElement, keyCode: number): void {
  btn.addEventListener("pointerdown", () => panel.heldKey.press(keyCode));
  const release = () => panel.heldKey.release(keyCode);
  btn.addEventListener("pointerup", release);
  btn.addEventListener("pointercancel", release);
  btn.addEventListener("pointerleave", release);
}

function makeFnButton(
  parent: HTMLElement,
  label: string,
  onClick: () => void,
  heldKeyCode?: number,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "fn";
  // the real key caps print two-word labels on two lines (e.g. "ADRS" / "SET")
  btn.innerHTML = label.includes(" ") ? label.replace(" ", "<br>") : label;
  btn.addEventListener("click", onClick);
  if (heldKeyCode !== undefined) wireHeldKey(btn, heldKeyCode);
  parent.appendChild(btn);
  return btn;
}

// One grid holds every key - top row, hex keypad, right-hand function column, and MODE -
// so all 5 columns share the same tracks and line up across every row, like the real board.
const keygridEl = document.createElement("div");
keygridEl.className = "keygrid";
caseEl.appendChild(keygridEl);

// top row, matches the real board's 5-key row: RET RUN STORE DATA LOAD DATA RESET
// (RESET has no held-key code - it isn't one of the monitor's 24 scanned keys, see FN_KEY_CODE)
makeFnButton(keygridEl, "RET", () => panel.pressRet(), FN_KEY_CODE.RET);
makeFnButton(keygridEl, "RUN", () => panel.pressRun(), FN_KEY_CODE.RUN);
makeFnButton(keygridEl, "STORE DATA", () => panel.pressStoreData(), FN_KEY_CODE.STORE_DATA);
makeFnButton(keygridEl, "LOAD DATA", () => panel.pressLoadData(), FN_KEY_CODE.LOAD_DATA);
const resetBtn = makeFnButton(keygridEl, "RESET", () => panel.pressReset());
// Not on the real keycap - RESET is also the only way to stop a running sample, and someone
// hearing it loop has no reason to go read the operating instructions to find that out. The
// "(STOP)" line is styled as a red marker scrawl rather than part of the button's own label,
// like a note someone added afterward, so it reads as an addition, not a claim about the
// real hardware's silkscreen.
resetBtn.innerHTML = 'RESET<br><span class="stop-note">(STOP)</span>';

// 4 rows of hex keys, each followed by the real board's matching right-column function key
const HEX_ROWS = [
  ["C", "D", "E", "F"],
  ["8", "9", "A", "B"],
  ["4", "5", "6", "7"],
  ["0", "1", "2", "3"],
];
const ROW_FN_KEYS: [string, () => void, number][] = [
  ["ADRS SET", () => panel.pressAdrsSet(), FN_KEY_CODE.ADRS_SET],
  ["READ INCR", () => panel.pressIncr(), FN_KEY_CODE.READ_INCR],
  ["READ DECR", () => panel.pressDecr(), FN_KEY_CODE.READ_DECR],
  ["WRITE INCR", () => panel.pressWrite(), FN_KEY_CODE.WRITE_INCR],
];
HEX_ROWS.forEach((row, i) => {
  for (const key of row) {
    const digit = parseInt(key, 16);
    const btn = document.createElement("button");
    btn.textContent = key;
    btn.addEventListener("click", () => panel.pressHex(digit));
    wireHeldKey(btn, digit);
    keygridEl.appendChild(btn);
  }
  const [label, onClick, heldKeyCode] = ROW_FN_KEYS[i];
  makeFnButton(keygridEl, label, onClick, heldKeyCode);
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

// same field doubles as free-text entry and a preset picker: typing/pasting bytes directly
// loads them as-is, while the ▾ button opens a small custom menu of the sample programs below,
// by name. A native <datalist> was tried first, but its dropdown arrow only shows on hover/
// focus (not discoverable at a glance) and it silently filters out every other option once the
// field's text exactly matches one candidate (i.e. right after picking one) - a fully custom
// menu avoids both, at the cost of not being a native input affordance.
const bytesToHex = (bytes: number[]): string => bytes.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");

const bytesFieldWrapEl = document.createElement("div");
bytesFieldWrapEl.className = "sample-picker";
bytesRowEl.appendChild(bytesFieldWrapEl);

const loadBytesInput = document.createElement("input");
loadBytesInput.type = "text";
loadBytesInput.placeholder = "hex bytes, e.g. 3E 05 06 03 80 76";
bytesFieldWrapEl.appendChild(loadBytesInput);

const samplePickerBtn = document.createElement("button");
samplePickerBtn.type = "button";
samplePickerBtn.className = "sample-picker-btn";
samplePickerBtn.textContent = "▾"; // ▾
samplePickerBtn.setAttribute("aria-label", "Choose a sample program / サンプルプログラムを選択");
bytesFieldWrapEl.appendChild(samplePickerBtn);

const sampleMenuEl = document.createElement("div");
sampleMenuEl.className = "sample-picker-menu";
sampleMenuEl.hidden = true;
for (const sample of SAMPLE_PROGRAMS) {
  const item = document.createElement("button");
  item.type = "button";
  item.textContent = `${sample.name} (${sample.address.toString(16).toUpperCase()}H)`;
  item.addEventListener("click", () => {
    loadBytesInput.value = bytesToHex(sample.bytes);
    loadAddrInput.value = sample.address.toString(16).toUpperCase();
    sampleMenuEl.hidden = true;
  });
  sampleMenuEl.appendChild(item);
}
bytesFieldWrapEl.appendChild(sampleMenuEl);

samplePickerBtn.addEventListener("click", () => {
  sampleMenuEl.hidden = !sampleMenuEl.hidden;
});
document.addEventListener("click", (e) => {
  if (!bytesFieldWrapEl.contains(e.target as Node)) sampleMenuEl.hidden = true;
});

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

// operating-instructions card has English and Japanese versions of its heading and body; the
// button just swaps which one is visible, since this content lives in index.html, not #app.
// querySelectorAll (not querySelector) since the heading and body are separate EN/JA pairs.
const langToggleBtn = document.getElementById("lang-toggle");
const manualLangEls = document.querySelectorAll(".manual-lang-en, .manual-lang-ja");
langToggleBtn?.addEventListener("click", () => {
  manualLangEls.forEach((el) => el.toggleAttribute("hidden"));
});

initTutorial();

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

// NEC TK-80 User's Manual (IEM-560A) 1.2: "クロック周波数 2.048MHz". Also required (not just
// authentic) for organAudio.ts's speaker scheduling - see its own comment on CPU_CLOCK_HZ.
const CYCLES_PER_SECOND = CPU_CLOCK_HZ;
let lastTime = performance.now();

function frame(now: number): void {
  // clamp so a backgrounded-tab catch-up (or any other long gap) doesn't try to run millions
  // of cycles synchronously in one frame
  const elapsed = Math.min((now - lastTime) / 1000, 0.05);
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

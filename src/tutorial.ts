/**
 * A click-through walkthrough shown inside the manual card, in place of the normal
 * operating instructions, entered via a button next to ENG/JP. It only ever displays
 * instructions - it never touches the panel - so entering, jumping between sections, or
 * exiting never disturbs whatever the visitor has done on the real controls.
 *
 * Content is organized as 3 sections, each made of several atomic steps. Navigation:
 *  - "menu" (section list) -> "step" (one step's content, with back/forward/exit nav)
 *  - forward advances one step; at a section's last step it becomes "next section" and
 *    jumps to the next section's first step; at the very last step of the last section
 *    it becomes "finish" and returns to the menu.
 *  - back steps back one; at a section's first step it returns to the menu.
 *  - the header's exit button returns to the menu from a step, or fully exits from the menu.
 *
 * Available in both Japanese and English, following whichever language the operating
 * instructions card is currently showing (kept in sync with the ENG/JP toggle).
 */

interface Step {
  title: string;
  body: string;
}

interface Section {
  title: string;
  steps: Step[];
}

const SECTIONS_JA: Section[] = [
  {
    title: "① 画面の見方を知る",
    steps: [
      {
        title: "表示を見てみよう",
        body: `
          <p>
            実機のTK-80には画面もキーボードもありません。あるのは<strong>8桁の7セグメントLED</strong>と
            <strong>25個のキー</strong>だけです。
          </p>
          <p>
            左の4桁は「今どこを見ているか」を示す<strong>アドレスレジスタ</strong>、右の4桁はそこにある値を示す
            <strong>データレジスタ</strong>です。この2つの数字だけを頼りに、メモリの中身を1バイトずつ読み書きしていきます。
          </p>
        `,
      },
      {
        title: "RESET を押してみよう",
        body: `
          <p>まずは初期状態にしてみましょう。</p>
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RESET</span>
              <span class="tutorial-fn">機能: CPUとメモリの状態を初期化</span>
              <span class="tutorial-result">→ 表示が全て <code>0</code> になります</span>
            </li>
          </ul>
        `,
      },
    ],
  },
  {
    title: "② プログラムを手で打ち込む",
    steps: [
      {
        title: "手入力について",
        body: `
          <p>
            1976年当時、プログラムはテキストエディタではなく16進キーで1バイトずつ手入力していました。ここでは
            「5+3を計算する」6バイトのプログラムを、アドレス <code>8000</code> から書き込みます。
          </p>
          <p class="tutorial-subhead">簡単な方法（コピペ）</p>
          <div class="tutorial-copy-row">
            <span>load @ のアドレス欄に</span>
            <code class="tutorial-copy-text">8000</code>
            <button type="button" class="tutorial-copy-btn" data-copy="8000">コピー</button>
          </div>
          <div class="tutorial-copy-row">
            <span>hex bytes 欄に</span>
            <code class="tutorial-copy-text">3E 05 06 03 80 76</code>
            <button type="button" class="tutorial-copy-btn" data-copy="3E 05 06 03 80 76">コピー</button>
          </div>
          <p class="tutorial-note">
            貼り付けて <strong>Load</strong> を押せば書き込み完了です。これで済ませる場合は「次のセクション」に進んでください。
          </p>
          <p class="tutorial-subhead">本物の操作を体験したい方は、次のステップから1バイトずつ手入力してみましょう。</p>
        `,
      },
      {
        title: "アドレスを指定する",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>8000</code> → ADRS SET</span>
              <span class="tutorial-fn">機能: アドレスを指定</span>
              <span class="tutorial-result">→ 8000番地へ移動</span>
            </li>
          </ul>
        `,
      },
      {
        title: "1バイト目を書き込む",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>3E</code> → WRITE INCR</span>
              <span class="tutorial-fn">機能: 1バイト書き込み、次のアドレスへ自動移動</span>
              <span class="tutorial-result">→ Aに5を入れる命令（1バイト目）</span>
            </li>
          </ul>
        `,
      },
      {
        title: "2バイト目を書き込む",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>05</code> → WRITE INCR</span>
              <span class="tutorial-result">→ 同・2バイト目 = 5</span>
            </li>
          </ul>
        `,
      },
      {
        title: "3バイト目を書き込む",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>06</code> → WRITE INCR</span>
              <span class="tutorial-result">→ Bに3を入れる命令・1バイト目</span>
            </li>
          </ul>
        `,
      },
      {
        title: "4バイト目を書き込む",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>03</code> → WRITE INCR</span>
              <span class="tutorial-result">→ 同・2バイト目 = 3</span>
            </li>
          </ul>
        `,
      },
      {
        title: "5バイト目を書き込む",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>80</code> → WRITE INCR</span>
              <span class="tutorial-result">→ AにBを足す命令</span>
            </li>
          </ul>
        `,
      },
      {
        title: "6バイト目を書き込む",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>76</code> → WRITE INCR</span>
              <span class="tutorial-result">→ 停止命令。これでプログラム入力は完了です</span>
            </li>
          </ul>
        `,
      },
    ],
  },
  {
    title: "③ 実行して、5+3=8になる瞬間を見る",
    steps: [
      {
        title: "STEPモードにする",
        body: `
          <p>1命令ずつ実行しながら、CPU内のAレジスタが変化する様子を見てみましょう。</p>
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">MODE</span>
              <span class="tutorial-fn">機能: 実行モードの切り替え</span>
              <span class="tutorial-result">→ <code>MODE STEP</code>（1命令ずつ実行）にする</span>
            </li>
          </ul>
        `,
      },
      {
        title: "実行開始アドレスに戻す",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>8000</code> → ADRS SET</span>
              <span class="tutorial-fn">機能: 実行開始アドレスを指定</span>
              <span class="tutorial-result">→ 8000番地に戻す</span>
            </li>
          </ul>
        `,
      },
      {
        title: "1命令実行する",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RUN</span>
              <span class="tutorial-fn">機能: 1命令実行</span>
              <span class="tutorial-result">→ データ側左2桁が <code>05</code> に（Aレジスタが5になった）</span>
            </li>
          </ul>
        `,
      },
      {
        title: "次の命令へ",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RET</span>
              <span class="tutorial-fn">機能: 次の1命令実行</span>
              <span class="tutorial-result">→ まだ <code>05</code>（Bに3を入れただけ、Aは変化なし）</span>
            </li>
          </ul>
        `,
      },
      {
        title: "5+3=8になる瞬間",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RET（もう一度）</span>
              <span class="tutorial-fn">機能: 次の1命令実行（ADD B）</span>
              <span class="tutorial-result">→ <code>08</code> に変化！ 5+3=8 が計算された瞬間です</span>
            </li>
          </ul>
        `,
      },
      {
        title: "プログラム終了",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RET（もう一度）</span>
              <span class="tutorial-fn">機能: 次の1命令実行（HLT）</span>
              <span class="tutorial-result">→ <code>HALT</code> 表示、プログラム終了</span>
            </li>
          </ul>
        `,
      },
      {
        title: "お疲れさまでした",
        body: `
          <p>
            お疲れさまでした。45年前のコンピュータそのままのやり方で、プログラムを打ち込んで実行しました。よければ
            <strong>STORE DATA</strong> を押すと、実機のカセットテープと同じ音も聞けます（音量にご注意）。
          </p>
        `,
      },
    ],
  },
];

const SECTIONS_EN: Section[] = [
  {
    title: "① Get to know the display",
    steps: [
      {
        title: "What you're looking at",
        body: `
          <p>
            The real TK-80 has no screen and no keyboard. All it has is an
            <strong>8-digit 7-segment LED display</strong> and <strong>25 keys</strong>.
          </p>
          <p>
            The left 4 digits are the <strong>address register</strong> — where you're currently looking —
            and the right 4 digits are the <strong>data register</strong> — the value stored there. Those two
            numbers are all you have to read and write memory, one byte at a time.
          </p>
        `,
      },
      {
        title: "Try RESET",
        body: `
          <p>Let's start from a clean state.</p>
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RESET</span>
              <span class="tutorial-fn">Function: clears the CPU and memory state</span>
              <span class="tutorial-result">&rarr; every digit becomes <code>0</code></span>
            </li>
          </ul>
        `,
      },
    ],
  },
  {
    title: "② Type in a program by hand",
    steps: [
      {
        title: "About typing it in",
        body: `
          <p>
            Back in 1976 there was no text editor — programs were entered one byte at a time on the hex
            keypad. Here we'll write a 6-byte program that computes 5+3, starting at address <code>8000</code>.
          </p>
          <p class="tutorial-subhead">The easy way (copy &amp; paste)</p>
          <div class="tutorial-copy-row">
            <span>Into the load @ address field:</span>
            <code class="tutorial-copy-text">8000</code>
            <button type="button" class="tutorial-copy-btn" data-copy="8000">Copy</button>
          </div>
          <div class="tutorial-copy-row">
            <span>Into the hex bytes field:</span>
            <code class="tutorial-copy-text">3E 05 06 03 80 76</code>
            <button type="button" class="tutorial-copy-btn" data-copy="3E 05 06 03 80 76">Copy</button>
          </div>
          <p class="tutorial-note">
            Paste them in and press <strong>Load</strong> and you're done. If that's enough for you, move on
            with "Next section".
          </p>
          <p class="tutorial-subhead">Want the real thing? Keep going and enter it byte by byte from the next step.</p>
        `,
      },
      {
        title: "Point at the address",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>8000</code> &rarr; ADRS SET</span>
              <span class="tutorial-fn">Function: point at an address</span>
              <span class="tutorial-result">&rarr; moves to address 8000</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Write byte 1",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>3E</code> &rarr; WRITE INCR</span>
              <span class="tutorial-fn">Function: store a byte, then advance to the next address</span>
              <span class="tutorial-result">&rarr; "load 5 into A" (byte 1 of 2)</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Write byte 2",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>05</code> &rarr; WRITE INCR</span>
              <span class="tutorial-result">&rarr; same instruction, byte 2 of 2 = 5</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Write byte 3",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>06</code> &rarr; WRITE INCR</span>
              <span class="tutorial-result">&rarr; "load 3 into B" (byte 1 of 2)</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Write byte 4",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>03</code> &rarr; WRITE INCR</span>
              <span class="tutorial-result">&rarr; same instruction, byte 2 of 2 = 3</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Write byte 5",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>80</code> &rarr; WRITE INCR</span>
              <span class="tutorial-result">&rarr; "add B into A"</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Write byte 6",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>76</code> &rarr; WRITE INCR</span>
              <span class="tutorial-result">&rarr; "halt" — the program is now fully entered</span>
            </li>
          </ul>
        `,
      },
    ],
  },
  {
    title: "③ Run it and watch 5+3=8 happen",
    steps: [
      {
        title: "Switch to STEP mode",
        body: `
          <p>Let's execute one instruction at a time and watch the A register change inside the CPU.</p>
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">MODE</span>
              <span class="tutorial-fn">Function: switch the execution mode</span>
              <span class="tutorial-result">&rarr; set it to <code>MODE STEP</code> (one instruction at a time)</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Reset to the start address",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key"><code>8000</code> &rarr; ADRS SET</span>
              <span class="tutorial-fn">Function: point at the start of the program</span>
              <span class="tutorial-result">&rarr; back to address 8000</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Execute one instruction",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RUN</span>
              <span class="tutorial-fn">Function: execute one instruction</span>
              <span class="tutorial-result">&rarr; the left 2 data digits become <code>05</code> (A is now 5)</span>
            </li>
          </ul>
        `,
      },
      {
        title: "On to the next instruction",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RET</span>
              <span class="tutorial-fn">Function: execute the next instruction</span>
              <span class="tutorial-result">&rarr; still <code>05</code> (that just loaded 3 into B; A hasn't changed)</span>
            </li>
          </ul>
        `,
      },
      {
        title: "The moment 5+3=8 happens",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RET (again)</span>
              <span class="tutorial-fn">Function: execute the next instruction (ADD B)</span>
              <span class="tutorial-result">&rarr; changes to <code>08</code> — 5+3=8 was just computed</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Program ends",
        body: `
          <ul class="tutorial-actions">
            <li>
              <span class="tutorial-key">RET (again)</span>
              <span class="tutorial-fn">Function: execute the next instruction (HLT)</span>
              <span class="tutorial-result">&rarr; the display shows <code>HALT</code> — the program has finished</span>
            </li>
          </ul>
        `,
      },
      {
        title: "Nicely done",
        body: `
          <p>
            You just entered and ran a program the exact way people did on this 45-year-old computer. If
            you'd like, press <strong>STORE DATA</strong> to hear the same tone the real machine's cassette
            interface would make (watch your volume).
          </p>
        `,
      },
    ],
  },
];

type Lang = "ja" | "en";

const UI: Record<
  Lang,
  {
    entry: string;
    headTitle: string;
    exit: string;
    menu: string;
    back: string;
    next: string;
    nextSection: string;
    menuIntro: string;
    sep: string;
    copied: string;
  }
> = {
  ja: {
    entry: "チュートリアル",
    headTitle: "チュートリアル",
    exit: "終了",
    menu: "メニュー",
    back: "← 戻る",
    next: "進む →",
    nextSection: "次のセクション →",
    menuIntro: "好きなセクションから始められます。",
    sep: "・",
    copied: "コピーしました",
  },
  en: {
    entry: "TUTORIAL",
    headTitle: "TUTORIAL",
    exit: "Exit",
    menu: "Menu",
    back: "← Back",
    next: "Next →",
    nextSection: "Next section →",
    menuIntro: "Start from any section.",
    sep: "·",
    copied: "Copied",
  },
};

type TutorialState = { kind: "menu" } | { kind: "step"; section: number; step: number };

export function initTutorial(): void {
  const bodyEl = document.getElementById("tutorial-body");
  const headNormal = document.getElementById("manual-head-normal");
  const headTutorial = document.getElementById("manual-head-tutorial");
  const headTutorialTitle = document.getElementById("tutorial-head-title");
  const normalBody = document.getElementById("manual-normal-body");
  const entryBtn = document.getElementById("tutorial-entry");
  const exitHeadBtn = document.getElementById("tutorial-exit-head");
  const manualEnEl = document.querySelector<HTMLElement>(".manual-lang-en");
  if (
    !bodyEl ||
    !headNormal ||
    !headTutorial ||
    !headTutorialTitle ||
    !normalBody ||
    !entryBtn ||
    !exitHeadBtn
  )
    return;

  function currentLang(): Lang {
    return manualEnEl?.hidden ? "ja" : "en";
  }

  let state: TutorialState = { kind: "menu" };
  let lang: Lang = currentLang();

  function sections(): Section[] {
    return lang === "ja" ? SECTIONS_JA : SECTIONS_EN;
  }

  function syncEntryLabel(): void {
    entryBtn!.textContent = UI[currentLang()].entry;
  }
  syncEntryLabel();

  document.getElementById("lang-toggle")?.addEventListener("click", () => {
    syncEntryLabel();
    if (!bodyEl!.hidden) {
      lang = currentLang();
      headTutorialTitle!.textContent = UI[lang].headTitle;
      render();
    }
  });

  // The header button reads "menu" while on a step (it backs out to the section list)
  // and "exit" while already on the menu (it leaves the tutorial entirely).
  function headExitLabel(): string {
    return state.kind === "menu" ? UI[lang].exit : UI[lang].menu;
  }

  function stepCountLabel(n: number): string {
    return lang === "ja" ? `（${n}ステップ）` : `(${n} step${n === 1 ? "" : "s"})`;
  }

  function renderMenu(): string {
    const links = sections()
      .map(
        (section, i) =>
          `<li><button type="button" class="fn" data-action="goto-section" data-section="${i}">${section.title} ${stepCountLabel(section.steps.length)}</button></li>`,
      )
      .join("");
    return `
      <p class="tutorial-intro">${UI[lang].menuIntro}</p>
      <ol class="tutorial-toc">${links}</ol>
    `;
  }

  function renderStep(sectionIndex: number, stepIndex: number): string {
    const secs = sections();
    const section = secs[sectionIndex];
    const step = section.steps[stepIndex];
    const isFirstInSection = stepIndex === 0;
    const isLastInSection = stepIndex === section.steps.length - 1;
    const isLastSection = sectionIndex === secs.length - 1;

    const backAction = isFirstInSection ? "menu" : "prev";
    let forwardLabel: string;
    let forwardAction: string;
    if (!isLastInSection) {
      forwardLabel = UI[lang].next;
      forwardAction = "next";
    } else if (!isLastSection) {
      forwardLabel = UI[lang].nextSection;
      forwardAction = "next-section";
    } else {
      forwardLabel = UI[lang].menu;
      forwardAction = "menu";
    }

    return `
      <div class="tutorial-progress">
        ${section.title} ${UI[lang].sep} ${stepIndex + 1}/${section.steps.length}
      </div>
      <h3>${step.title}</h3>
      ${step.body}
      <div class="tutorial-nav">
        <button type="button" class="fn" data-action="${backAction}">${UI[lang].back}</button>
        <button type="button" class="fn" data-action="${forwardAction}">${forwardLabel}</button>
      </div>
    `;
  }

  function render(): void {
    bodyEl!.innerHTML = state.kind === "menu" ? renderMenu() : renderStep(state.section, state.step);
    exitHeadBtn!.textContent = headExitLabel();
  }

  function enterTutorial(): void {
    lang = currentLang();
    headNormal!.hidden = true;
    headTutorial!.hidden = false;
    headTutorialTitle!.textContent = UI[lang].headTitle;
    normalBody!.hidden = true;
    bodyEl!.hidden = false;
    state = { kind: "menu" };
    render();
  }

  function exitTutorial(): void {
    headNormal!.hidden = false;
    headTutorial!.hidden = true;
    normalBody!.hidden = false;
    bodyEl!.hidden = true;
  }

  entryBtn.addEventListener("click", enterTutorial);
  exitHeadBtn.addEventListener("click", () => {
    if (state.kind === "menu") {
      exitTutorial();
      return;
    }
    state = { kind: "menu" };
    render();
  });

  bodyEl.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action], [data-copy]");
    if (!target) return;

    const copyText = target.dataset.copy;
    if (copyText !== undefined) {
      navigator.clipboard?.writeText(copyText).then(
        () => {
          const original = target.textContent;
          target.textContent = UI[lang].copied;
          setTimeout(() => {
            target.textContent = original;
          }, 1200);
        },
        () => {
          // clipboard permission denied or unavailable - the text is still visible
          // to select and copy by hand, so this is a silent no-op.
        },
      );
      return;
    }

    const action = target.dataset.action;
    if (action === "goto-section") {
      state = { kind: "step", section: Number(target.dataset.section), step: 0 };
    } else if (action === "prev" && state.kind === "step") {
      state = { kind: "step", section: state.section, step: state.step - 1 };
    } else if (action === "next" && state.kind === "step") {
      state = { kind: "step", section: state.section, step: state.step + 1 };
    } else if (action === "next-section" && state.kind === "step") {
      state = { kind: "step", section: state.section + 1, step: 0 };
    } else if (action === "menu") {
      state = { kind: "menu" };
    } else return;

    render();
  });
}

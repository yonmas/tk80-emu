/**
 * A click-through walkthrough shown inside the manual card, in place of the normal
 * operating instructions, entered via a button next to ENG/JP. It only ever displays
 * instructions - it never touches the panel - so entering, jumping between steps, or
 * exiting never disturbs whatever the visitor has done on the real controls.
 *
 * States while active: "toc" (links to each step) -> "step" (one step's content,
 * with prev/next-or-exit navigation).
 */

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "① 画面の見方を知る",
    body: `
      <p>
        実機のTK-80には画面もキーボードもありません。あるのは<strong>8桁の7セグメントLED</strong>と
        <strong>25個のキー</strong>だけです。左の4桁が「今どこを見ているか」を示す<strong>アドレスレジスタ</strong>、
        右の4桁がそこにある値を示す<strong>データレジスタ</strong>です。
      </p>
      <ul class="tutorial-actions">
        <li>
          <span class="tutorial-key">RESET</span>
          <span class="tutorial-fn">機能: CPUとメモリの状態を初期化</span>
          <span class="tutorial-result">→ 表示が全て <code>0</code> になります</span>
        </li>
      </ul>
    `,
  },
  {
    title: "② プログラムを手で打ち込む",
    body: `
      <p>
        1976年当時、プログラムはテキストエディタではなく16進キーで1バイトずつ手入力していました。ここでは
        「5+3を計算する」6バイトのプログラムを、アドレス <code>8000</code> から書き込みます。
      </p>

      <p class="tutorial-subhead">簡単な方法（コピペ）</p>
      <div class="tutorial-copy-row">
        <span>load @ のアドレス欄に</span>
        <code class="tutorial-copy-text" id="tutorial-copy-addr">8000</code>
        <button type="button" class="tutorial-copy-btn" data-copy="8000">コピー</button>
      </div>
      <div class="tutorial-copy-row">
        <span>hex bytes 欄に</span>
        <code class="tutorial-copy-text" id="tutorial-copy-bytes">3E 05 06 03 80 76</code>
        <button type="button" class="tutorial-copy-btn" data-copy="3E 05 06 03 80 76">コピー</button>
      </div>
      <p class="tutorial-note">貼り付けたら <strong>Load</strong> を押せば書き込み完了です。</p>

      <p class="tutorial-subhead">本物の操作（1バイトずつ手入力）</p>
      <ul class="tutorial-actions">
        <li>
          <span class="tutorial-key"><code>8000</code> → ADRS SET</span>
          <span class="tutorial-fn">機能: アドレスを指定</span>
          <span class="tutorial-result">→ 8000番地へ移動</span>
        </li>
        <li>
          <span class="tutorial-key"><code>3E</code> → WRITE INCR</span>
          <span class="tutorial-fn">機能: 1バイト書き込み、次のアドレスへ自動移動</span>
          <span class="tutorial-result">→ Aに5を入れる命令(1バイト目)</span>
        </li>
        <li>
          <span class="tutorial-key"><code>05</code> → WRITE INCR</span>
          <span class="tutorial-result">→ 同・2バイト目 = 5</span>
        </li>
        <li>
          <span class="tutorial-key"><code>06</code> → WRITE INCR</span>
          <span class="tutorial-result">→ Bに3を入れる命令・1バイト目</span>
        </li>
        <li>
          <span class="tutorial-key"><code>03</code> → WRITE INCR</span>
          <span class="tutorial-result">→ 同・2バイト目 = 3</span>
        </li>
        <li>
          <span class="tutorial-key"><code>80</code> → WRITE INCR</span>
          <span class="tutorial-result">→ AにBを足す命令</span>
        </li>
        <li>
          <span class="tutorial-key"><code>76</code> → WRITE INCR</span>
          <span class="tutorial-result">→ 停止命令</span>
        </li>
      </ul>
    `,
  },
  {
    title: "③ 実行して、5+3=8になる瞬間を見る",
    body: `
      <p>1命令ずつ実行しながら、CPU内のAレジスタが変化する様子を見てみましょう。</p>
      <ul class="tutorial-actions">
        <li>
          <span class="tutorial-key">MODE</span>
          <span class="tutorial-fn">機能: 実行モードの切り替え</span>
          <span class="tutorial-result">→ <code>MODE STEP</code>（1命令ずつ実行）にする</span>
        </li>
        <li>
          <span class="tutorial-key"><code>8000</code> → ADRS SET</span>
          <span class="tutorial-fn">機能: 実行開始アドレスを指定</span>
          <span class="tutorial-result">→ 8000番地に戻す</span>
        </li>
        <li>
          <span class="tutorial-key">RUN</span>
          <span class="tutorial-fn">機能: 1命令実行</span>
          <span class="tutorial-result">→ データ側左2桁が <code>05</code> に（Aレジスタが5になった）</span>
        </li>
        <li>
          <span class="tutorial-key">RET</span>
          <span class="tutorial-fn">機能: 次の1命令実行</span>
          <span class="tutorial-result">→ まだ <code>05</code>（Bに3を入れただけ、Aは変化なし）</span>
        </li>
        <li>
          <span class="tutorial-key">RET（もう一度）</span>
          <span class="tutorial-result">→ <code>08</code> に変化！ 5+3=8 が計算された瞬間です</span>
        </li>
        <li>
          <span class="tutorial-key">RET（もう一度）</span>
          <span class="tutorial-result">→ <code>HALT</code> 表示、プログラム終了</span>
        </li>
      </ul>
      <p class="tutorial-note">
        お疲れさまでした。45年前のコンピュータそのままのやり方で、プログラムを打ち込んで実行しました。よければ
        <strong>STORE DATA</strong> を押すと、実機のカセットテープと同じ音も聞けます（音量にご注意）。
      </p>
    `,
  },
];

type TutorialState = { kind: "toc" } | { kind: "step"; index: number };

export function initTutorial(): void {
  const bodyEl = document.getElementById("tutorial-body");
  const headNormal = document.getElementById("manual-head-normal");
  const headTutorial = document.getElementById("manual-head-tutorial");
  const normalBody = document.getElementById("manual-normal-body");
  const entryBtn = document.getElementById("tutorial-entry");
  const exitHeadBtn = document.getElementById("tutorial-exit-head");
  if (!bodyEl || !headNormal || !headTutorial || !normalBody || !entryBtn || !exitHeadBtn) return;

  let state: TutorialState = { kind: "toc" };

  function renderToc(): string {
    const links = STEPS.map(
      (step, i) => `<li><button type="button" class="fn" data-action="goto" data-step="${i}">${step.title}</button></li>`
    ).join("");
    return `
      <p class="tutorial-intro">好きなステップから始められます。</p>
      <ol class="tutorial-toc">${links}</ol>
    `;
  }

  function renderStep(index: number): string {
    const step = STEPS[index];
    const isLast = index === STEPS.length - 1;
    return `
      <div class="tutorial-progress">ステップ ${index + 1} / ${STEPS.length}</div>
      <h3>${step.title}</h3>
      ${step.body}
      <div class="tutorial-nav">
        <button type="button" class="fn" data-action="prev">&larr; 戻る</button>
        <button type="button" class="fn" data-action="${isLast ? "exit" : "next"}">
          ${isLast ? "終了" : "次のセクション &rarr;"}
        </button>
      </div>
    `;
  }

  function render(): void {
    bodyEl!.innerHTML = state.kind === "toc" ? renderToc() : renderStep(state.index);
  }

  function enterTutorial(): void {
    headNormal!.hidden = true;
    headTutorial!.hidden = false;
    normalBody!.hidden = true;
    bodyEl!.hidden = false;
    state = { kind: "toc" };
    render();
  }

  function exitTutorial(): void {
    headNormal!.hidden = false;
    headTutorial!.hidden = true;
    normalBody!.hidden = false;
    bodyEl!.hidden = true;
  }

  entryBtn.addEventListener("click", enterTutorial);
  exitHeadBtn.addEventListener("click", exitTutorial);

  bodyEl.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action], [data-copy]");
    if (!target) return;

    const copyText = target.dataset.copy;
    if (copyText !== undefined) {
      navigator.clipboard?.writeText(copyText).then(
        () => {
          const original = target.textContent;
          target.textContent = "コピーしました";
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
    if (action === "goto") state = { kind: "step", index: Number(target.dataset.step) };
    else if (action === "prev" && state.kind === "step") {
      state = state.index === 0 ? { kind: "toc" } : { kind: "step", index: state.index - 1 };
    } else if (action === "next" && state.kind === "step" && state.index < STEPS.length - 1) {
      state = { kind: "step", index: state.index + 1 };
    } else if (action === "exit") {
      exitTutorial();
      return;
    } else return;

    render();
  });
}

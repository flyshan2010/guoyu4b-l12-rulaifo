/* =========================================================
   學生自學網 — 通用引擎（純 vanilla JS，無外部相依）
   內容資料來自 content.js 的 window.UNIT；本檔不含任何單元文字。
   換單元 / 改題目 = 只改 content.js，不用動這個檔。
   功能：學習地圖、各節（重點/迷思/探究/小測驗）、課後評量、學習證明、
        徽章、localStorage 進度、語音朗讀、注音標示、回傳成績。
   ========================================================= */

const UNIT = window.UNIT;
const META = UNIT.meta;
const SECTIONS = UNIT.sections;

/* ---------- 進度狀態（localStorage） ---------- */
const STORE_KEY = META.storeKey || ("selflearn_" + (META.id || "unit") + "_v1");
const state = loadState();
function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

/* ---------- 共用工具 ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function toast(msg) {
  let t = $("#toast"); if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- 徽章（由 UNIT 自動推導） ---------- */
const BADGES = SECTIONS.map(s => ({ key: s.id, emoji: s.emoji, label: s.badgeLabel || `${s.code} ${s.title}` }))
  .concat([{ key: "exam", emoji: META.examBadge?.emoji || "🏆", label: META.examBadge?.label || "課後評量達標" }]);

/* =========================================================
   語音朗讀（speechSynthesis，zh-TW）
   ========================================================= */
const Speak = {
  on: ('speechSynthesis' in window),
  // 取出元素的可朗讀文字：去掉注音 <rt>、朗讀鈕、emoji 與條列符號
  textOf(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('rt, .speak-btn').forEach(n => n.remove());
    let t = clone.textContent || "";
    // 去除 emoji / 圖形符號 / 條列符號（避免朗讀唸出）
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{27BF}\u{2B00}-\u{2BFF}️‍]/gu, " ");
    t = t.replace(/[•·▶►◆■□●○✓✗×＊*\-—–_|]/g, " ");
    return t.replace(/\s+/g, " ").trim();
  },
  speak(text) {
    if (!this.on) { toast("這個瀏覽器不支援語音朗讀"); return; }
    if (!text) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-TW"; u.rate = 0.9; u.pitch = 1;
    const zh = synth.getVoices().find(v => /zh[-_]?TW/i.test(v.lang)) || synth.getVoices().find(v => /^zh/i.test(v.lang));
    if (zh) u.voice = zh;
    u.onend = u.onerror = () => this.toggleStopBtn(false);
    synth.speak(u);
    this.toggleStopBtn(true);
  },
  stop() { if (this.on) window.speechSynthesis.cancel(); this.toggleStopBtn(false); },
  toggleStopBtn(show) { const b = $("#stopReadBtn"); if (b) b.style.display = show ? "" : "none"; }
};
function speakBtn() { return `<button class="speak-btn" title="朗讀這段" aria-label="朗讀">🔊</button>`; }

/* =========================================================
   注音標示（呼叫 zhuyin.js）
   ========================================================= */
const Zhu = {
  active: false,
  apply(root) {
    if (!window.Zhuyin) return;
    if (this.active) window.Zhuyin.annotate(root || $("#app"), UNIT.vocab || {});
  },
  toggle() {
    if (!window.Zhuyin) { toast("注音模組未載入"); return; }
    this.active = !this.active;
    const btn = $("#zhuyinBtn");
    if (btn) { btn.classList.toggle("on", this.active); btn.setAttribute("aria-pressed", String(this.active)); }
    document.body.classList.toggle("zhuyin-on", this.active);
    const app = $("#app");
    if (this.active) window.Zhuyin.annotate(app, UNIT.vocab || {});
    else window.Zhuyin.remove(app);
    toast(this.active ? "已開啟注音（自動標示，多音字以課本為準）" : "已關閉注音");
  }
};

/* ---------- 渲染：首頁 / 學習地圖 ---------- */
function renderHome() {
  const cards = SECTIONS.map(s => `
    <a class="map-card" href="#${s.id}" data-goto="${s.id}" style="border-top-color:${s.color}">
      <div class="big">${s.emoji}</div>
      <h3 style="color:${s.color}">${s.code} ${s.title}</h3>
      <p>${esc(s.intro.replace(/<[^>]+>/g, "")).slice(0, 28)}…</p>
      <div class="cases">📍 ${s.cases.map(c => esc(c.name)).join("、")}</div>
    </a>`).join("");

  const heroLines = (META.home?.heroLines || []).map(l => `<p>${l}</p>`).join("");
  $("#view-home").innerHTML = `
    <div class="hero">
      <h2>${META.home?.heroTitle || META.title}</h2>
      ${heroLines}
    </div>
    <div class="map-grid">${cards}</div>
    <div class="block" style="margin-top:22px">
      <div class="block-head"><span class="ico">🏅</span><h3>我的徽章牆</h3></div>
      <div class="badge-wall" id="badgeWall"></div>
    </div>`;

  $$("#view-home [data-goto]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); switchTab(a.dataset.goto); }));
  renderBadgeWall();
}

function renderBadgeWall() {
  const wall = $("#badgeWall"); if (!wall) return;
  wall.innerHTML = BADGES.map(b => {
    const earned = !!state[b.key];
    return `<div class="badge ${earned ? "earned" : ""}">
      <div class="coin">${earned ? b.emoji : "🔒"}</div>
      <div class="label">${esc(b.label)}</div>
      <div class="state">${earned ? "已完成 ✓" : "尚未完成"}</div>
    </div>`;
  }).join("");
}

/* ---------- 渲染：學習節 ---------- */
function renderSection(s) {
  const caseHtml = s.cases.map(c => `
    <div class="case" data-readable style="border-left-color:${s.color}">
      <h4 class="accent">📍 ${c.name} ${speakBtn()}</h4>
      <span class="place">${c.place}</span>
      <ul>${c.points.map(p => `<li>${p}</li>`).join("")}</ul>
      ${c.tip ? `<div class="tip">💡 ${c.tip}</div>` : ""}
    </div>`).join("");

  const sum = s.summary;
  const summaryHtml = `
    <div class="table-wrap"><table class="summary">
      <thead><tr>${sum.cols.map((c, i) => `<th${i===0?' style="width:96px"':''}>${c}</th>`).join("")}</tr></thead>
      <tbody>${sum.rows.map(r => `<tr><th>${r[0]}</th>${r.slice(1).map(td => `<td>${td}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>`;

  const mythHtml = s.myths.map(my => `
    <div class="myth" data-readable>
      <div class="m"><span class="tag">✗ 常見迷思</span>${my.m}</div>
      <div class="t"><span class="tag">✓ 正解</span>${my.t} ${speakBtn()}</div>
    </div>`).join("");

  const inq = s.inquiry;
  const inqHtml = inq.steps.map((st, i) => `
    <div class="inquiry-step" data-readable>
      <div class="q"><span class="num">${i + 1}</span>
        <span><span class="label">${st.label}</span><span class="qt">${st.q}</span></span>
        ${speakBtn()}
      </div>
      <button class="reveal-btn" data-rev>👀 點我看參考答案</button>
      <div class="answer">${st.a}${st.open ? `<span class="open-note">＊這題是開放題，沒有標準答案，說出自己的想法就很棒！</span>` : ""}</div>
    </div>`).join("");

  $(`#view-${s.id}`).innerHTML = `
    <div class="${s.cls}">
      <div class="hero" style="background:linear-gradient(135deg,${s.color}22,#ffffff)">
        <h2>${s.emoji} ${s.code} ${s.title}</h2>
        <p class="intro-text" data-readable>${s.intro} ${speakBtn()}</p>
      </div>

      <div class="block">
        <div class="block-head"><span class="ico">📖</span><h3 class="accent">本節重點</h3><span class="sub">依案例整理</span></div>
        ${caseHtml}
        <div class="block-head" style="margin-top:14px"><span class="ico">📊</span><h3 class="accent">統整對照表</h3></div>
        ${summaryHtml}
      </div>

      <div class="block">
        <div class="block-head"><span class="ico">🤔</span><h3 class="accent">概念迷思 ─ 別搞錯了！</h3></div>
        ${mythHtml}
      </div>

      <div class="block">
        <div class="block-head"><span class="ico">🔍</span><h3 class="accent">${inq.heading || "探究提問"}</h3><span class="sub">${inq.topic}</span></div>
        ${inqHtml}
      </div>

      <div class="block">
        <div class="block-head"><span class="ico">✏️</span><h3 class="accent">節末小測驗</h3><span class="sub">答對全部就能蓋徽章！</span></div>
        <div id="quiz-${s.id}"></div>
      </div>
    </div>`;

  // 探究答案展開
  $$(`#view-${s.id} [data-rev]`).forEach(btn => btn.addEventListener("click", () => {
    const ans = btn.nextElementSibling; const open = ans.classList.toggle("show");
    btn.textContent = open ? "🙈 收起參考答案" : "👀 點我看參考答案";
  }));

  // 小測驗
  new Quiz({ mount: $(`#quiz-${s.id}`), questions: s.quiz, badgeKey: s.id, passRatio: 1.0,
    onPass: () => { unlockBadge(s.id, `太棒了！你完成了 ${s.code} ${s.title} 🎉`); } });
}

/* ---------- 測驗引擎（選擇 / 是非 / 配對 / 簡答） ---------- */
class Quiz {
  constructor({ mount, questions, badgeKey, passRatio, onPass, isExam }) {
    this.mount = mount; this.qs = questions; this.badgeKey = badgeKey;
    this.passRatio = passRatio; this.onPass = onPass; this.isExam = !!isExam;
    this.sel = {}; this.match = {}; this.selfGrade = {};
    this.render();
  }
  render() {
    const html = this.qs.map((q, i) => this.qHtml(q, i)).join("");
    this.mount.innerHTML = html + `
      <div class="submit-bar">
        <button class="btn" data-submit>✅ 我要交卷</button>
        <button class="btn ghost" data-retry style="display:none">🔄 再做一次</button>
        <span class="score-pill" data-score style="display:none"></span>
      </div>`;
    this.bind();
    if (Zhu.active && window.Zhuyin) window.Zhuyin.annotate(this.mount, UNIT.vocab || {});
  }
  qHtml(q, i) {
    const no = i + 1;
    let body = "";
    if (q.type === "choice" || q.type === "tf") {
      const opts = q.type === "tf" ? ["⭕ 對", "❌ 錯"] : q.options;
      body = `<div class="opts">${opts.map((o, oi) =>
        `<button class="opt" data-q="${i}" data-opt="${oi}"><span>${esc(o)}</span><span class="mk"></span></button>`).join("")}</div>`;
    } else if (q.type === "match") {
      const rights = q.pairs.map(p => p.right);
      body = q.pairs.map((p, li) => `
        <div class="match-row" data-q="${i}" data-left="${li}">
          <span class="left">${esc(p.left)}</span>
          <select data-q="${i}" data-left="${li}">
            <option value="">— 請選擇 —</option>
            ${rights.map((r, ri) => `<option value="${ri}">${esc(r)}</option>`).join("")}
          </select>
        </div>`).join("");
    } else if (q.type === "short") {
      body = `<div class="short">
        <textarea data-q="${i}" placeholder="把你的答案寫在這裡…"></textarea>
        <button class="reveal-btn" data-ref="${i}">👀 看參考答案</button>
        <div class="ref">📒 參考答案：${esc(q.ref)}</div>
        <div class="self-grade" data-sg="${i}">
          <span style="align-self:center;font-size:13px;color:#666">對照後自評：</span>
          <button class="pick-ok" data-sg-ok="${i}">✓ 我答對了</button>
          <button class="pick-no" data-sg-no="${i}">✗ 我要再想想</button>
        </div>
      </div>`;
    }
    const typeLabel = { choice: "選擇題", tf: "是非題", match: "配對題", short: "簡答題" }[q.type];
    return `<div class="quiz-q" data-qi="${i}">
      <div class="stem" data-readable><span class="type">${typeLabel}</span><span class="tno">${no}</span>${esc(q.stem)} ${speakBtn()}</div>
      ${body}
      <div class="explain"></div>
    </div>`;
  }
  bind() {
    $$(".opt", this.mount).forEach(b => b.addEventListener("click", () => {
      if (this.locked) return;
      const qi = +b.dataset.q, oi = +b.dataset.opt;
      this.sel[qi] = oi;
      $$(`.opt[data-q="${qi}"]`, this.mount).forEach(x => x.classList.toggle("sel", x === b));
    }));
    $$("select[data-q]", this.mount).forEach(sel => sel.addEventListener("change", () => {
      if (this.locked) return;
      const qi = +sel.dataset.q, li = +sel.dataset.left;
      this.match[qi] = this.match[qi] || {}; this.match[qi][li] = sel.value === "" ? null : +sel.value;
    }));
    $$("[data-ref]", this.mount).forEach(btn => btn.addEventListener("click", () => {
      const i = +btn.dataset.ref;
      const box = $(`.quiz-q[data-qi="${i}"] .ref`, this.mount);
      const sg = $(`.self-grade[data-sg="${i}"]`, this.mount);
      const open = box.classList.toggle("show"); sg.classList.toggle("show", open);
      btn.textContent = open ? "🙈 收起參考答案" : "👀 看參考答案";
    }));
    $$("[data-sg-ok]", this.mount).forEach(btn => btn.addEventListener("click", () => {
      const i = +btn.dataset.sgOk; this.selfGrade[i] = true;
      $(`[data-sg-ok="${i}"]`, this.mount).classList.add("on");
      $(`[data-sg-no="${i}"]`, this.mount).classList.remove("on");
    }));
    $$("[data-sg-no]", this.mount).forEach(btn => btn.addEventListener("click", () => {
      const i = +btn.dataset.sgNo; this.selfGrade[i] = false;
      $(`[data-sg-no="${i}"]`, this.mount).classList.add("on");
      $(`[data-sg-ok="${i}"]`, this.mount).classList.remove("on");
    }));
    $("[data-submit]", this.mount).addEventListener("click", () => this.grade());
    $("[data-retry]", this.mount).addEventListener("click", () => { this.reset(); });
  }
  reset() { this.sel = {}; this.match = {}; this.selfGrade = {}; this.locked = false; this.render(); }
  grade() {
    let unanswered = [];
    this.qs.forEach((q, i) => {
      if (q.type === "choice" || q.type === "tf") { if (this.sel[i] == null) unanswered.push(i + 1); }
      else if (q.type === "match") { const m = this.match[i] || {}; if (q.pairs.some((_, li) => m[li] == null)) unanswered.push(i + 1); }
      else if (q.type === "short") { if (this.selfGrade[i] == null) unanswered.push(i + 1); }
    });
    if (unanswered.length) { toast(`還有第 ${unanswered.join("、")} 題沒完成喔！`); return; }

    let correct = 0;
    this.qs.forEach((q, i) => {
      const card = $(`.quiz-q[data-qi="${i}"]`, this.mount);
      const exp = $(".explain", card);
      let ok = false;
      if (q.type === "choice" || q.type === "tf") {
        const ansIdx = q.type === "tf" ? (q.answer ? 0 : 1) : q.answer;
        ok = this.sel[i] === ansIdx;
        $$(`.opt[data-q="${i}"]`, this.mount).forEach((b, oi) => {
          b.classList.remove("sel");
          if (oi === ansIdx) b.classList.add("correct");
          if (oi === this.sel[i] && oi !== ansIdx) b.classList.add("wrong");
          $(".mk", b).textContent = oi === ansIdx ? "✓" : (oi === this.sel[i] ? "✗" : "");
        });
      } else if (q.type === "match") {
        const m = this.match[i] || {};
        ok = q.pairs.every((_, li) => m[li] === li);
        q.pairs.forEach((_, li) => {
          const row = $(`.match-row[data-q="${i}"][data-left="${li}"]`, this.mount);
          row.classList.add(m[li] === li ? "correct" : "wrong");
        });
      } else if (q.type === "short") {
        ok = this.selfGrade[i] === true;
        $(`.quiz-q[data-qi="${i}"] .ref`, this.mount).classList.add("show");
      }
      if (ok) correct++;
      exp.className = "explain show " + (ok ? "ok" : "ng");
      exp.innerHTML = (ok ? "✅ 答對了！" : "❌ 再看一次：") + (q.explain ? " " + esc(q.explain) : (q.type === "short" ? "（請參考上方參考答案）" : ""));
    });

    this.locked = true;
    const total = this.qs.length, ratio = correct / total, pass = ratio >= this.passRatio;
    const pill = $("[data-score]", this.mount);
    pill.style.display = ""; pill.className = "score-pill " + (pass ? "pass" : "fail");
    pill.textContent = `得分：${correct} / ${total}　${pass ? "通過 ✓" : "再加油！"}`;
    $("[data-retry]", this.mount).style.display = "";
    $("[data-submit]", this.mount).style.display = "none";

    if (this.isExam) { this.onResult && this.onResult(correct, total, pass); }
    else if (pass) { this.onPass && this.onPass(); }
    card_scroll(pill);
  }
}
function card_scroll(el){ try{ el.scrollIntoView({behavior:"smooth",block:"center"}); }catch(e){} }

/* ---------- 徽章解鎖 ---------- */
function unlockBadge(key, msg) {
  if (!state[key]) { state[key] = true; saveState(); toast(msg); }
  renderBadgeWall(); refreshTabDone();
}

/* ---------- 渲染：課後評量 ---------- */
function renderExam() {
  const passPct = Math.round((META.exam?.passRatio ?? 0.8) * 100);
  const lines = (META.exam?.heroLines || [`這份評量共 {n} 題，答對 ${passPct}% 以上即達標。`])
    .map(l => `<p class="intro-text">${l.replace(/\{n\}/g, UNIT.exam.length)}</p>`).join("");
  $("#view-exam").innerHTML = `
    <div class="hero" style="background:linear-gradient(135deg,#e7f0ff,#ffffff)">
      <h2>📝 課後評量</h2>
      ${lines}
    </div>
    <div class="block"><div id="quiz-exam"></div></div>`;

  const q = new Quiz({
    mount: $("#quiz-exam"), questions: UNIT.exam, badgeKey: "exam", passRatio: META.exam?.passRatio ?? 0.8, isExam: true
  });
  q.onResult = (correct, total, pass) => {
    if (pass) {
      state.exam = true; state.examScore = correct; state.examTotal = total; saveState();
      renderBadgeWall(); refreshTabDone();
      toast("🏆 恭喜達標！快去「學習證明」領取證明書！");
      renderCert();
    } else {
      toast("差一點點，再複習一下、按「再做一次」挑戰看看！");
    }
  };
}

/* ---------- 渲染：學習證明 ---------- */
function renderCert() {
  const examPassed = !!state.exam;
  const today = new Date();
  const dateStr = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日`;
  const savedName = state.certName || "";

  const wall = `<div class="badge-wall" style="margin-bottom:20px">${BADGES.map(b => {
    const e = !!state[b.key];
    return `<div class="badge ${e ? "earned" : ""}"><div class="coin">${e ? b.emoji : "🔒"}</div>
      <div class="label">${esc(b.label)}</div><div class="state">${e ? "已完成 ✓" : "尚未完成"}</div></div>`;
  }).join("")}</div>`;

  const gf = META.gradeForm;
  let main = "";
  if (!examPassed) {
    main = `<div class="locked-note">🔒 <b>學習證明書尚未解鎖。</b><br>
      請先到「📝 課後評量」完成測驗並達標（${Math.round((META.exam?.passRatio ?? 0.8)*100)}% 以上），就能在這裡產生你的專屬學習證明書囉！</div>${wall}`;
  } else {
    main = `
      ${wall}
      <div class="cert-controls" id="print-hide">
        <input id="certName" type="text" maxlength="12" placeholder="請輸入你的姓名" value="${esc(savedName)}">
        ${gf && gf.entries && gf.entries.classNo ? `<input id="certClassNo" type="text" maxlength="10" placeholder="班級座號" value="${esc(state.classNo||"")}">` : ""}
        <button class="btn green" id="makeCert">🏅 產生我的證明書</button>
        <button class="btn ghost" id="printCert">🖨️ 列印 / 存成 PDF</button>
        ${gf && gf.baseUrl ? `<button class="btn blue" id="sendGrade">📤 回傳成績給老師</button>` : ""}
      </div>
      <div id="certArea"></div>`;
  }

  $("#view-cert").innerHTML = `
    <div class="hero" style="background:linear-gradient(135deg,#fff6db,#ffffff)">
      <h2>🏅 學習證明</h2>
      <p class="intro-text">${META.cert?.heroLine || "通過課後評量，就能領取學習證明書。"}</p>
    </div>
    <div class="block">${main}</div>`;

  if (examPassed) {
    const make = () => {
      const name = $("#certName").value.trim();
      if (!name) { toast("請先輸入你的姓名！"); $("#certName").focus(); return; }
      state.certName = name;
      const cn = $("#certClassNo"); if (cn) state.classNo = cn.value.trim();
      saveState();
      drawCertificate(name, dateStr);
    };
    $("#makeCert").addEventListener("click", make);
    $("#certName").addEventListener("keydown", e => { if (e.key === "Enter") make(); });
    $("#printCert").addEventListener("click", () => {
      if (!$("#certArea").innerHTML.trim()) { toast("請先產生證明書再列印！"); return; }
      window.print();
    });
    const sg = $("#sendGrade");
    if (sg) sg.addEventListener("click", () => sendGrade(dateStr));
    if (savedName) drawCertificate(savedName, dateStr);
  }
}

function drawCertificate(name, dateStr) {
  const score = state.examScore != null ? `${state.examScore} / ${state.examTotal}` : "—";
  const tags = BADGES.filter(b => state[b.key]).map(b => `<span>${b.emoji} ${esc(b.label)}</span>`).join("");
  $("#certArea").innerHTML = `
    <div class="certificate">
      <div class="cert-emoji">🏅📜</div>
      <div class="cert-title">學 習 證 明 書</div>
      <div class="cert-sub">${META.cert?.certSub || META.title}</div>
      <div class="cert-name">${esc(name)}</div>
      <p class="cert-body">${META.cert?.certBody || ""}</p>
      <div class="cert-badges">${tags}</div>
      <div class="cert-meta">
        <div>評量成績<br><b>${score}</b></div>
        <div>完成日期<br><b>${dateStr}</b></div>
      </div>
      <div class="cert-stamp">${META.cert?.stamp || "認證"}</div>
    </div>`;
  toast("🎉 證明書已產生！可以列印或存成 PDF 囉！");
}

/* ---------- 回傳成績：開啟預填的 Google 表單 ---------- */
function sendGrade(dateStr) {
  const gf = META.gradeForm;
  if (!gf || !gf.baseUrl) return;
  const name = (state.certName || "").trim();
  if (!name) { toast("請先輸入姓名並產生證明書！"); $("#certName") && $("#certName").focus(); return; }
  const e = gf.entries || {};
  const p = new URLSearchParams(); p.set("usp", "pp_url");
  if (e.name) p.set(e.name, name);
  if (e.classNo) p.set(e.classNo, (state.classNo || "").trim());
  if (e.unit) p.set(e.unit, META.title);
  if (e.score) p.set(e.score, state.examScore != null ? `${state.examScore}/${state.examTotal}` : "");
  if (e.date) p.set(e.date, dateStr);
  const url = gf.baseUrl + (gf.baseUrl.includes("?") ? "&" : "?") + p.toString();
  window.open(url, "_blank", "noopener");
  toast("已開啟成績表單，請按下『提交』回傳給老師。");
}

/* ---------- 分頁切換 ---------- */
function switchTab(id) {
  Speak.stop();
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === id));
  $$(".view").forEach(v => v.classList.toggle("active", v.id === `view-${id}`));
  if (id === "home") { renderBadgeWall(); }
  if (id === "cert") { renderCert(); if (Zhu.active) Zhu.apply($("#view-cert")); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function refreshTabDone() {
  const doneKeys = SECTIONS.map(s => s.id).concat("exam");
  $$(".tab").forEach(t => {
    const id = t.dataset.tab;
    if (doneKeys.includes(id)) t.classList.toggle("done", !!state[id]);
  });
}

/* ---------- 建立外殼（標題列、分頁、各分頁容器） ---------- */
function buildShell() {
  document.title = META.docTitle || META.title || "學生自學網";
  const md = document.querySelector('meta[name="description"]');
  if (md && META.metaDescription) md.setAttribute("content", META.metaDescription);
  $("#brandEmoji").textContent = META.brandEmoji || "📘";
  $("#brandTitle").textContent = META.title || "學生自學網";
  $("#brandSub").textContent = META.headerSub || "";
  $("#siteFooter").innerHTML = META.footer || "";
  if (!Speak.on) { const sb = $("#stopReadBtn"); if (sb) sb.remove(); }

  // 分頁
  const tabs = [{ id: "home", label: "🗺️ 學習地圖" }]
    .concat(SECTIONS.map(s => ({ id: s.id, label: s.tabLabel || `${s.emoji} ${s.code} ${s.title}` })))
    .concat([{ id: "exam", label: "📝 課後評量" }, { id: "cert", label: "🏅 學習證明" }]);
  $("#tabs").innerHTML = tabs.map((t, i) =>
    `<button class="tab${i === 0 ? " active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("");

  // 各分頁容器
  $("#app").innerHTML = tabs.map((t, i) =>
    `<section id="view-${t.id}" class="view${i === 0 ? " active" : ""}"></section>`).join("");
}

/* ---------- 初始化 ---------- */
function init() {
  renderHome();
  SECTIONS.forEach(renderSection);
  renderExam();
  renderCert();
  if (Zhu.active) Zhu.apply($("#app"));
  $$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  refreshTabDone();
}

function bootstrap() {
  if (!window.UNIT) { document.body.innerHTML = "<p style='padding:40px'>⚠️ 找不到 content.js 的 UNIT 資料。</p>"; return; }
  buildShell();
  init();

  // 全域工具列
  $("#resetBtn").addEventListener("click", () => {
    if (confirm("確定要清除所有學習紀錄、重新開始嗎？")) {
      localStorage.removeItem(STORE_KEY);
      for (const k in state) delete state[k];
      Zhu.active = false; document.body.classList.remove("zhuyin-on");
      const zb = $("#zhuyinBtn"); if (zb) { zb.classList.remove("on"); zb.setAttribute("aria-pressed", "false"); }
      init(); switchTab("home"); toast("已清除紀錄，重新開始！");
    }
  });
  $("#zhuyinBtn").addEventListener("click", () => Zhu.toggle());
  const sb = $("#stopReadBtn"); if (sb) sb.addEventListener("click", () => Speak.stop());

  // 朗讀鈕（事件委派）
  $("#app").addEventListener("click", e => {
    const btn = e.target.closest(".speak-btn");
    if (!btn) return;
    const host = btn.closest("[data-readable]") || btn.parentElement;
    Speak.speak(Speak.textOf(host));
  });

  // 預載語音清單（部分瀏覽器需觸發）
  if (Speak.on && window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {};
  }
}
document.addEventListener("DOMContentLoaded", bootstrap);

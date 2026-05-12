import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

const fileInput = document.getElementById("pdfFile");
const queryInput = document.getElementById("query");
const searchBtn = document.getElementById("searchBtn");
const result = document.getElementById("result");
const loadState = document.getElementById("loadState");

let pages = [];

fileInput.addEventListener("change", handleFileUpload);
searchBtn.addEventListener("click", handleSearch);

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setResult("正在解析 PDF，請稍候...");
  loadState.textContent = `載入中：${file.name}`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it) => it.str).join(" ");

    pages.push({
      page: pageNum,
      text,
      lowerText: text.toLowerCase(),
    });
  }

  loadState.textContent = `完成：${file.name}（共 ${pdf.numPages} 頁）`;
  setResult("PDF 已載入，請輸入問題。\n\n建議格式：\n- 機型\n- 錯誤碼\n- 現象\n- 最近異動");
}

function handleSearch() {
  const rawQuery = queryInput.value.trim();
  if (!rawQuery) {
    setResult("請先輸入問題描述。");
    return;
  }

  if (pages.length === 0) {
    setResult("請先上傳並完成解析 PDF。");
    return;
  }

  const keywords = tokenize(rawQuery);
  const ranked = pages
    .map((p) => ({ ...p, score: scoreText(p.lowerText, keywords) }))
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    setResult("找不到明顯匹配段落。建議補充：錯誤碼、機型、發生時機。\n\n例如：E102 + Model-X3 + 上電後 30 秒重啟");
    return;
  }

  const steps = [
    "1) 確認安全條件：斷電 / ESD / 治具狀態。",
    `2) 優先查看第 ${ranked[0].page} 頁對應段落。`,
    "3) 先做非侵入式檢查（線材、連接器、電源輸入）。",
    "4) 若未排除，再依手冊進行模組替換或測點量測。",
    "5) 保留測試結果，若需升級支援請附上頁碼與量測值。",
  ];

  const refs = ranked
    .map((p, i) => `候選 ${i + 1}：第 ${p.page} 頁（匹配分數 ${p.score}）\n${excerpt(p.text, keywords)}`)
    .join("\n\n");

  setResult(`查詢關鍵字：${keywords.join(", ")}\n\n建議排查流程：\n${steps.join("\n")}\n\n相關手冊內容：\n${refs}`);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

function scoreText(text, keywords) {
  let score = 0;
  for (const k of keywords) {
    if (!text.includes(k)) continue;
    score += 1;
    if (/^[a-z]\d{2,4}$/i.test(k) || /^e\d+/i.test(k)) score += 2;
  }
  return score;
}

function excerpt(text, keywords) {
  const lower = text.toLowerCase();
  const hit = keywords.find((k) => lower.includes(k));
  if (!hit) return text.slice(0, 220) + "...";
  const index = lower.indexOf(hit);
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + 140);
  return text.slice(start, end).replace(/\s+/g, " ") + "...";
}

function setResult(msg) {
  result.classList.remove("empty");
  result.textContent = msg;
}

# DESIGN.md — 拾聲「紙上手帳」設計系統

> **本檔是 V14 起所有視覺與互動的唯一事實源。** 改風格＝先改本檔，再改程式。
> 由來：2026-07-10 四方向試衣間，Vivian 選定「A｜紙上手帳」，
> 拨盘＝視覺冒險度 8／動效強度 7／信息密度 3（版面敢有個性、動效活但輕、內容保持鬆）。
> 樣機參考：`../design-previews/2026-07-10-vocilege-ui-redesign/index.html` 方向 A（`.da-` 前綴段落）。
> 設計 DNA 借自 Notion 設計系統（暖中性色、耳語級邊框、多層極淡陰影、四字重層級）
> 與 Apple Journal 的紙面日誌氣質；準則衝突時以本檔為準。

---

## 1. 視覺主題與氛圍

「和紙手帳」：打開 App 像翻開今天那一頁。內容是手寫留下的痕跡，介面本身退後。

- **內容優先**：功能以內容呈現（「栞留了一封信」），不是圖示與按鈕的陳列。
- **紙，不是玻璃**：質感來自紙色、細分隔線與襯線數字，不靠毛玻璃、漸層、發光。
- **安靜但有膽**：留白大、密度低；但版面允許不對稱、主角區塊可以很大，拒絕等分排列。
- **有生命感**：動效清楚可感（強度 7）但全部 ≤300ms、只動 transform/opacity。

## 2. 色板與角色

### 2a. 「和紙」主題（washi-light，V14 新增，暫僅亮版）

| Token | 值 | 角色 |
|---|---|---|
| `--bg` | `#f7f3ea` | 紙面（頁面底） |
| `--surface` | `#fffdf7` | 信箋（主角卡、浮層底） |
| `--ink`（文字主色） | `#2a2620` | 正文、標題（**禁純黑**） |
| `--ink-muted` | `#6b6355` | 次要文字（暗底/紙底皆 ≥ 4.5:1 對比） |
| `--eyebrow` | `#8d8574` | 小標籤（eyebrow）、微弱說明 |
| `--accent` 茜紅 | `#a84b2f` | **唯一飽和重音**：未讀點、文字動作、focus 環 |
| `--accent-strong` | `#96432a` | 茜紅 hover/active |
| `--hairline` | `#e4dcc9` | 標準分隔線（1px，耳語級） |
| `--hairline-strong` | `#d6cbb2` | 次要按鈕邊框、需要更清楚的分界 |
| `--shadow-1` | `0 1px 2px rgba(42,38,32,.04)` | 幾乎不可見的貼紙感 |
| `--shadow-2` | `0 2px 6px rgba(42,38,32,.04), 0 10px 28px rgba(42,38,32,.06)` | 浮層（選單/對話框） |

- `::selection`：底 `color-mix(in srgb, var(--accent) 14%, transparent)`、字 `var(--ink)`（選字像劃線）。
- 功能色沿用既有語意（綠=成功、橙=警告、紅=錯誤），飽和度 <80%。
- 深度靠 hairline 與紙色層差，**不靠陰影**；陰影累計不透明度 ≤ 0.10（Notion 式）。

### 2b. 版式 token（**全部主題共用**，含既有 藍/粉/綠/紫/極光）

字階、間距、圓角、hairline 規則、motion token 對所有主題生效；
其他主題的 hairline 用 `color-mix(in srgb, var(--border) 70%, transparent)` 由既有變數導出，元件不寫死色碼。

## 3. 排版規則

- **中文一律系統字栈**（沿用專案既有 stack），字重只用 400／500／600；**全域禁斜體**（含 Latin）。
- **襯線只給西文與數字**：`Georgia, "Times New Roman", serif`，用於日期、大數字、時間戳等展示位。
- 正文數字 `font-variant-numeric: tabular-nums`。

| 層級 | 規格 | 用途 |
|---|---|---|
| Display 日期 | serif 數字 32–34px／中文 24px·600，行高 1.15 | 今日頁眉、日常月曆標題 |
| 頁標題 | 20px·600 | 各分頁標題 |
| Eyebrow 小標 | 11px·500，`letter-spacing: .24em`，色 `--eyebrow` | 條目類別標（「約定 · 今晚 21:30」） |
| 正文 | 15px·400，行高 1.65 | 條目主文、聊天訊息 |
| 次要 | 13px·400，色 `--ink-muted` | 摘錄、副行 |
| 微標 | 11.5px·400，`tabular-nums` | 時間戳、計數 |

- 層級靠**字重與字距**建立，不靠無腦放大字號；中西文之間留一個空白（盤古之白）；全形標點。
- 正文行長 ≤ 34em；標題不超過 2 行。

## 4. 組件樣式

- **卡片紀律（核心規則）**：一頁至多**一張**主角卡（`--surface` 底＋1px `--hairline`＋radius 12px）。
  其餘內容一律 **list row＋hairline 分隔**（`border-top`），**禁止卡片牆、禁止等大卡片格**。
- **List row**：eyebrow（11px 字距標）＋ 主文（15px），`padding-block: 12–14px`；整行可點，hover 底色
  `color-mix(in srgb, var(--ink) 4%, transparent)`（包在 `(hover: hover)` 內）。
- **未讀/新內容記號**：茜紅圓點 8px。**禁止任何左側竖線裝飾**（含 border-left、inset 陰影竖條）。
- **蠟封點（簽名元素）**：信箋主角卡標題前 9px 茜紅圓點；開信讀畢後轉 `--eyebrow` 色。
- **按鈕**：主要＝`--ink` 底、紙色字、radius 10、min-height 44px；次要＝1px `--hairline-strong` 邊、透明底、`--ink` 字；
  文字動作＝茜紅 600（如「留一句話給今天」）。按壓 `:active { transform: scale(.97) }`。
- **focus-visible**：`outline: 2px solid var(--accent); outline-offset: 2px`（全站一致）。
- toggle、dialog、toast 沿用既有元件結構，只換 token；dialog 用 `--shadow-2` ＋ hairline。

## 5. 布局原則

- **首頁＝今日 feed**：日期頁眉（不對稱：左側大 serif 日期，右側細節小字）→ 主角卡（今天最重要的一件事）
  → hairline 清單（約定／聊天／拾日／迴聲）→ 角色列。**由上而下按情感重要度排，不平均分配**。
- 主角區塊可佔第一屏 40% 以上視覺重量；沒有主角內容時**不硬湊**，直接從清單開始。
- 功能頁（聊天雙欄、設定）冒險度自動收斂：清楚 > 個性；表單、對話框走既有慣例。
- 間距 4px 基準：組內 8–12、組間 28–40、頁邊 20px（手機）／32px（桌面）。
- 相關資訊物理靠近；組內間距 < 組間間距。

## 6. 深度層級

0. 紙面 `--bg`（頁底，無裝飾粒子層——和紙主題不加星光/粒子）
1. 信箋 `--surface` ＋ hairline（主角卡、分組面）
2. 浮層：溢出選單、對話框＝`--surface` ＋ `--shadow-2`
3. Toast／確認層
- 毛玻璃（backdrop-filter）只保留既有 thinking-card 與 modal 遮罩，**不再擴散到新元件**。

## 7. Do's / Don'ts

**Do**：hairline 分組、留白呼吸、serif 數字、茜紅作唯一重音、eyebrow 字距標籤、
未讀紅點、內容句子當入口（「他留了一封信」）。

**Don't**：紫藍漸層／漸層文字、純黑 `#000`、外發光、卡片牆、三等分卡片橫排、
左側竖線強調、斜體、裝飾性中文 webfont、滿版星星、
「已載入…」類系統自言自語常駐佔版面、SECTION 01 式編號標籤。

## 8. 響應式

- 手機單欄優先設計（PWA 主場景）；桌面聊天維持雙欄 master-detail。
- 禁 `h-screen`，用 `100dvh`；safe-area 沿用既有處理；flex 文字子項 `min-width: 0` 防溢出。
- 觸控目標 ≥ 44px；hover 效果一律包 `@media (hover: hover) and (pointer: fine)`。

## 9. Motion 哲學（強度 7：清楚可感，但輕）

- Token：`--ease-out: cubic-bezier(.23,1,.32,1)`；`--ease-drawer: cubic-bezier(.32,.72,0,1)`。
- **頁面切換**：內容區 fade＋上移 8px，220ms `--ease-out`。
- **Feed 條目入場**：首次進頁 stagger 40ms 逐條浮現（`opacity`＋`translateY(6px)`）；
  同 session 切回不重播（別讓每天看一百次的東西一直動）。
- **開信儀式（簽名動效）**：點信箋卡 → 開啟層 260ms 展開（`scale(.98)→1`＋opacity）；讀畢蠟封點淡出轉灰。
- 按鈕/列 hover 120ms；按壓回饋 ≤100ms 內可見；退出動畫比進入快（約 0.6 倍時長）。
- 高頻操作（送出訊息、打字、鍵盤觸發）**不加動畫**；全部動效 ≤300ms；只動 `transform`／`opacity`；
  快速觸發的用 transition（可中斷）不用 keyframes。
- `prefers-reduced-motion: reduce` → 全部動畫停用（含開信儀式，直接顯示結果）。

## 10. Agent Prompt Guide（給實作模型的一句話）

> 「暖紙底、墨色字、茜紅唯一重音；一頁最多一張信箋卡，其餘 hairline 清單；
> serif 只給數字與日期；動效 ≤300ms 只動 transform/opacity；禁斜體、禁左竖線、禁卡片牆。」

**工藝密度自查（每頁至少落地 5 項）**：蠟封點／開信儀式／serif 日期頁眉／`::selection` 茜紅／
品牌 focus 環／eyebrow 字距系統／feed stagger 入場／未讀紅點語彙。

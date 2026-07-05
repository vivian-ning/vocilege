# 拾聲 Vocilège — V1（本機優先、多角色 AI 互動工具 純前端）

個人用、本機優先的多角色 AI 互動工具。原生 HTML / CSS / JavaScript（ES Modules）+ IndexedDB，**無後端、無框架、無打包工具、無 CDN、無第三方套件**。

V5.6 起外觀提供藍噪、粉噪、綠噪、紫噪四組配色與明暗模式。新用戶預設為藍噪亮版；若想要更接近深夜陪伴感，可在「設定 → 外觀」切換為紫噪暗版。

**V1 相較 V0 的變化**：把 mock 換成可接真 AI API（Anthropic、OpenAI 相容服務、Google Gemini），並記錄 token 用量。未設定 API 時仍會 fallback 到內建 mock，因此不填金鑰也能完整體驗介面。

---

## 目錄結構

```
project/
├─ index.html
├─ style.css
├─ README.md
├─ data/
│  └─ config.json
└─ src/
   ├─ app.js                     # 進入點：載入 config → 初始化 DB / store → 掛載 UI
   ├─ state/
   │  ├─ schema.js               # createDefaultState / normalizeState（欄位補齊）
   │  ├─ store.js                # 全域 state + actions + 訂閱制
   │  └─ migrations.js           # migrateState（版本升級）
   ├─ db/
   │  └─ indexeddb.js            # 兩個 object store：state / messages
   ├─ services/
   │  ├─ promptBuilder.js        # buildPrompt（只組 prompt，回傳 { system, messages }）
   │  ├─ mockAIService.js        # 假回覆，簽名同 aiService
   │  ├─ aiService.js            # 唯一 AI 入口：真 API + parseReplyToParts + testConnection
   │  └─ backupService.js        # 匯出 / 匯入 / 清空
   ├─ ui/
   │  ├─ render.js               # 三欄骨架 + 主渲染（store 唯一訂閱者）
   │  ├─ tabs.js                 # 右欄分頁（角色 / 玩家 / API / 資料）
   │  └─ components/
   │     ├─ conversationList.js  # 左欄（以 conversation 為單位渲染）
   │     ├─ chatView.js          # 中欄聊天室（含錯誤條 + 重試 + mock 提示）
   │     ├─ characterEditor.js   # 新增 / 編輯角色
   │     ├─ playerEditor.js      # 玩家設定
   │     ├─ apiSettingsEditor.js # API 設定分頁（V1）
   │     ├─ messageRenderer.js   # message / narration / systemNote + token 用量
   │     └─ backupPanel.js       # 資料分頁
   └─ utils/
      ├─ id.js                   # generateId
      ├─ time.js                 # now / dateStamp / formatTime
      ├─ sanitize.js             # escapeHTML（防禦縱深）
      └─ validation.js           # 匯入結構驗證
```

---

## 1. 本機啟動

**不要用 `file://` 直接雙擊 `index.html`**——ES Modules 的 `import` 與 `fetch('./data/config.json')` 在 `file://` 下會被瀏覽器封鎖。請起一個簡易 HTTP 伺服器：

```bash
# 在 project/ 目錄下
python -m http.server 8000
```

然後開啟 <http://localhost:8000>。

其他等效做法（擇一即可）：

```bash
npx serve .            # Node
php -S localhost:8000  # PHP
```

---

## 2. GitHub Pages 部署

1. 把 `project/` 內容推到 GitHub repo。
2. Settings → Pages → Source 選 `Deploy from a branch`，分支選 `main`、資料夾選 `/ (root)`。
3. 幾分鐘後可於 `https://<username>.github.io/<repo>/` 開啟。

**相對路徑注意事項（重要）**：GitHub Pages 部署在 `username.github.io/repo/` 這種**子路徑**下，因此本專案所有資源都用相對路徑：

- `index.html` 內 `./style.css`、`./src/app.js`
- `app.js` 內 `fetch('./data/config.json')`
- 各模組 `import` 一律相對路徑（`../db/indexeddb.js` 等）

**不要**改成 `/style.css`、`/src/app.js` 這種絕對路徑，否則在子路徑下會 404。

---

## 3. 已完成的功能

**V0 基礎**

- 桌面三欄式介面（左：對話列表／中：聊天室／右：設定分頁）
- 建立多個角色，每個角色自動擁有一個一對一 `direct` conversation
- 切換角色 / 對話，各自獨立聊天紀錄
- 編輯角色資料與玩家設定
- 全部資料保存到 IndexedDB，重新整理後仍在
- `firstMessage` 只在建立角色當下插入一次（切換 / 重整不重複）
- 刪除角色的連鎖刪除 + 指標修復
- 匯出 / 匯入（含驗證、版本語意、all-or-nothing、保留本機 API key）/ 清空
- CSS variables 主題（啟用 cream，另預留 night 等骨架）
- 全面以 `textContent` / `createElement` 建構 DOM，禁用 `innerHTML`

**V1 新增**

- **真 AI API 接入**：支援 `anthropic`、`openai-compatible`、`gemini` 三種 provider；未設定時 fallback 回 mock。
- **API 設定分頁**（右欄第三個 tab）：provider / model（下拉＋自行輸入）/ baseUrl / apiKey / 記住金鑰 / temperature / maxTokens，含「測試連線」按鈕與累計 token 用量顯示。
- **回覆解析**：模型回覆會依「對話 / 旁白」自動解析成不同樣式的訊息 part（旁白以全形星號 `＊…＊` 包裹；解析寬容，絕不丟棄文字）。
- **Token 記錄**：真 API 回覆的訊息會在氣泡下方以極小字顯示 `↑輸入 ↓輸出`，並累計於 API 設定分頁。
- **錯誤處理**：API 失敗時保留已送出的訊息，並在聊天區顯示可讀錯誤條與「重試」按鈕（等待期間停用輸入）。
- **未設定 API 提示**：聊天標題列以小字顯示「模擬回覆中（未設定 API）」。
- **名稱**：正式名稱「拾聲 Vocilège」（左欄中文名 + 拉丁小字）。

### 依賴關係（AI 呼叫流程）

```
store.sendPlayerMessage
  → promptBuilder.buildPrompt  → { system, messages }
  → aiService.generateReply    → 依 provider 分派：mock / anthropic / openai-compatible / gemini
       → fetch（AbortController，逾時 60 秒）
       → parseReplyToParts(text) → MessagePart[]（附帶 .usage）
  → store 寫入 message（含選填 usage）
```

### 資料架構重點（為擴充預留）

- **Character / Conversation / Message 三者分離**，不使用 `chats[characterId]`
- IndexedDB 拆成 `state` 與 `messages` 兩個 object store，messages 獨立不塞進 state blob
- `currentCharacterId` 與 `currentConversationId` 兩指標，只由 `selectCharacter` 同時更新，維持一致
- Message 同時保留 `senderType`（+`senderId`）與 `role`，前者供群聊分辨角色，後者對應未來 AI API role

---

## 4. API 設定教學

在右欄「API 設定」分頁填寫。填好後可先按「測試連線」，成功會顯示綠色「連線成功（model 名）」。
未選 provider 或未填金鑰時，聊天一律走內建 mock。

### Anthropic

| 欄位 | 值 |
| --- | --- |
| provider | `anthropic` |
| model | 例如 `claude-sonnet-5` |
| baseUrl | 留空即用預設 `https://api.anthropic.com` |
| apiKey | 你的 Anthropic API 金鑰 |

程式呼叫 `POST {baseUrl}/v1/messages`，`system` 為獨立欄位、`messages` 只放對話往返。

**CORS**：瀏覽器直連 Anthropic API 需要 `anthropic-dangerous-direct-browser-access: true` 這個 header 才能通過 CORS——**本程式已自動帶上**，你不需要做任何事。

### OpenAI 相容服務（openai-compatible）

| 欄位 | 值 |
| --- | --- |
| provider | `openai-compatible` |
| model | 例如 `gpt-4o-mini` |
| baseUrl | 留空即用預設 `https://api.openai.com/v1`；中轉服務填其對應網址 |
| apiKey | 對應服務的金鑰 |

程式呼叫 `POST {baseUrl}/chat/completions`，`system` 併為 `messages[0]`。

**CORS 限制（重要）**：OpenAI 官方 API 與部分中轉服務**未對瀏覽器開放 CORS**，純前端的直連請求可能被瀏覽器擋下（顯示「無法連線，請檢查網路或 baseUrl」）。若遇到此情況，需改用有開放 CORS 的相容中轉服務，或改採（本專案範圍外的）自架代理。這是純前端本機工具的先天限制。

### Google Gemini（gemini）

| 欄位 | 值 |
| --- | --- |
| provider | `gemini` |
| model | 例如 `gemini-2.5-pro`、`gemini-2.5-flash` |
| baseUrl | 留空即用預設 `https://generativelanguage.googleapis.com` |
| apiKey | Google AI Studio 的 API 金鑰（`AIza...`） |

程式呼叫 `POST {baseUrl}/v1beta/models/{model}:generateContent`，`system` 放獨立的 `systemInstruction`，對話 role 對應 `user` / `model`。**金鑰只透過 `x-goog-api-key` header 傳遞，不放進 URL**（避免出現在瀏覽器歷史 / 記錄）。用量取 `usageMetadata.promptTokenCount` / `candidatesTokenCount`。

**CORS**：Google Generative Language API 允許以 API 金鑰從瀏覽器直連，一般可正常使用。

### 模型下拉選單

「模型」欄位是下拉選單，會依所選 provider 帶出常見型號；型號名稱會隨供應商更新，若清單沒有你要的最新型號，選「其他（自行輸入）」即可手動輸入任意模型 ID。填錯模型名通常回 404 / 400「model not found」，會顯示在錯誤條上。

### temperature / maxTokens

- `temperature`：0–2（預設 1）。注意 Anthropic 實際範圍為 0–1，程式會自動夾住，避免 400。
- `maxTokens`：回覆長度上限（預設 1024）。

### Token 用量顯示

真 API 回覆的訊息會在氣泡下方以極小 muted 字顯示 `↑{輸入tokens} ↓{輸出tokens}`（滑鼠移上顯示 model 名）。API 設定分頁另有一行累計用量（所有訊息 `usage` 加總）。mock 回覆與玩家訊息不記 token。

---

## 4-1. 開發者：AI 介面約定

**AI 呼叫只透過 `aiService.generateReply` 進出**，`buildPrompt` 只組 prompt 不呼叫 API。

- `buildPrompt(...)` 回傳 `{ system, messages }`（`messages` 為 `{ role, content }[]`，上限最近 30 則）。
- `generateReply(...)` 回傳 `MessagePart[]`；真 API 回覆時陣列另掛 `.usage`（`{ promptTokens, completionTokens, model }`），mock 回覆掛 `.isMock`。
- `parseReplyToParts(text)` 是獨立、無副作用、可測試的解析函式。
- `saveState` 對 `rememberApiKey` 的落地規則：`false` 時 apiKey 不寫入 IndexedDB（只留記憶體）。

---

## 5. 後續如何加入 PWA

- 新增 `manifest.webmanifest`（相對路徑 icon）與 `sw.js`（Service Worker），在 `app.js` 註冊。
- Service Worker 快取靜態資源以支援離線；IndexedDB 資料本來就在本機。
- 版面已用 CSS Grid，改手機優先只需在 `style.css` 的 `.app-layout` 加 `@media` 把三欄改為單欄堆疊 + 分頁切換，元件邏輯不動。

---

## 6. 後續如何加入群聊

schema 已預留：

- `Conversation.type` 目前為 `"direct"`，未來新增 `"group"`；`title` 欄位（direct 恆為 `null`）
  留給群聊由使用者命名。`conversationList.js` 已用 `type` 分支派生標題，可直接渲染 group。
- `Conversation.memberIds` 已是陣列（`["player", charA, charB, ...]`）；`primaryCharacterId`
  在 group 為 `null`。
- `Message.senderType` + `senderId` 可分辨「群聊中多個角色都是 assistant」是哪一位發言。
- 群聊時 `buildPrompt` 的 `characters` 參數（已接住）用來組多角色 prompt。

`Conversation` 群聊結構範例見 `src/state/store.js` 與 PROMPT 第七節註解。

---

## 7. 後續如何加入日記 / 貼文 / 心聲

`state` record 已預留空陣列：`journals`、`posts`、`heartVoices`、`relationshipData`、
`wishlists`、`notifications`、`memories`、`worldbooks`。

- 這些若會無限成長（如貼文），比照 messages 的做法**另開 object store**（在 `indexeddb.js`
  的 `onupgradeneeded` 提升 `DB_VERSION` 並建 store / 索引），不要塞進 state blob。
- schema 版本升級走 `migrations.js` 的 `migrators` 表逐版套用；欄位補齊走 `schema.normalizeState`。
- 對應的 UI 以新元件加入右欄分頁或新欄位，渲染仍走 `render.js` 訂閱機制。

---

## 8. 後續如何加入語音與 Health Data（Apple Watch）

- **語音**：訊息的 `parts` 已是可擴充陣列，未來可新增 `{ type: "audio", ... }` part，
  由 `messageRenderer.renderMessagePart` 增加分支渲染播放器；輸入端可加語音轉文字。
- **Health / Apple Watch**：新增 `state.relationshipData` 或另開 store 存健康數據，透過未來的
  同步服務（或 Web Bluetooth / 匯入檔）寫入；`buildPrompt` 可把健康資訊納入 prompt 情境。
- 皆屬「新增資料類型 + 新 object store + prompt 擴充」，不影響既有三欄與 AI 介面。

---

## 資安說明（API 金鑰）

- 金鑰**只存在本機瀏覽器**：勾選「記住金鑰」時，金鑰會以**明文**存進本機 IndexedDB；不勾選則只留在記憶體，重新整理後需重新輸入。**共用電腦請勿勾選「記住金鑰」。**
- 瀏覽器直連 API 代表金鑰會出現在**本機的網路請求**中（DevTools Network 可見）——這是個人本機工具的預期行為，並非漏洞。
- 金鑰**不會**出現在：匯出備份（`apiSettings.apiKey` 一律清空）、console、錯誤訊息、URL；測試連線與正式請求都只透過 HTTP headers 傳遞金鑰。
- 匯入他人備份時，會**保留你本機的金鑰與「記住金鑰」設定**（採合併而非覆蓋）。

---

## schema / 版本

- 目前 `schemaVersion = 8`。
- 匯入時：v1–v7 舊備份會依序 migration 後還原；舊 `theme=brown` 會轉為 `violet`，大於 8 的備份會被拒絕。
- Message 的 `usage` 為選填欄位，只有真 API 回覆的 assistant message 會寫入，結構固定為 `{ promptTokens, completionTokens, model }`（未來 token 統計儀表板的資料來源）。

---

## 手動驗收流程

1. 建立角色 → mock 對話 → 編輯角色 → 重新整理（資料仍在、firstMessage 不重複）→ 匯出 → 清空 → 匯入還原。
2. 未設定 API：聊天走 mock，標題列顯示「模擬回覆中（未設定 API）」。
3. 設定 Anthropic 或 openai-compatible：測試連線成功 → 送訊息得到真回覆 → 旁白 / 對話正確分樣式 → 氣泡下方顯示 token 用量。
4. 未勾「記住金鑰」：重新整理後金鑰欄位為空、IndexedDB 中 apiKey 為空字串；勾選後重整金鑰仍在。
5. 錯誤路徑：填錯金鑰 → 顯示 401 錯誤條 → 已送出的訊息仍在 → 修正金鑰後按「重試」成功。

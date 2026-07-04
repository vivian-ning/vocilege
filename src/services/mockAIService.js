// src/services/mockAIService.js
//
// mock AI 服務。必須與 aiService 有「完全相同的函式簽名與回傳型別」：
//   generateReply(args): Promise<MessagePart[]>
//
// V1 note：buildPrompt 的回傳形狀已改為 { system, messages }，但 mock 一律直接
// 取用 args.character（不依賴 prompt 的內部結構），因此新 prompt 格式對 mock 無影響，
// 介面維持不變。
//
// 要求（第十節）：
//   - 模擬 300–800ms 隨機延遲後才 resolve，讓呼叫端從一開始就以非同步方式處理
//   - 不回覆通用佔位文字；根據 character 的 personality / scenario / speechStyle
//     產生看起來符合角色的假回覆（使用簡單模板）
//   - 資料很少時也要有合理 fallback
//   - 回傳格式為 message parts 陣列（不含 usage：mock 回覆不記 token）

function delay() {
  const ms = 300 + Math.floor(Math.random() * 500); // 300–800ms
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function generateReply({
  prompt,
  conversation,
  character,
  player,
  userMessage,
  apiSettings
}) {
  await delay();

  const c = character || {};
  const name = c.name || '對方';
  const personality = (c.personality || '').trim();
  const scenario = (c.scenario || '').trim();
  const speech = (c.speechStyle || '').trim();
  const userText = (userMessage || '').trim();

  // --- 旁白：從 scenario / personality 取材 ---
  const narrationPool = [];
  if (scenario) {
    narrationPool.push(`${name}停頓了一下，周圍的空氣像是${scenario.slice(0, 12)}。`);
  }
  if (personality) {
    narrationPool.push(`${name}以一貫${personality.slice(0, 8)}的神情看著你。`);
  }
  narrationPool.push(`${name}安靜地聽著，像是把你的話放進了心裡。`);
  narrationPool.push(`${name}微微側頭，思考了片刻。`);
  const narration = pick(narrationPool);

  // --- 對白：回應使用者、帶上說話風格與個性 ---
  const openers = userText
    ? [
        `你說「${truncate(userText, 18)}」——`,
        `關於你剛剛提到的，`,
        `我聽見了。`,
        `原來如此，`
      ]
    : [
        `嗯……`,
        `你來了。`,
        `我在。`
      ];

  const bodies = [];
  if (speech) {
    bodies.push(`（我會用${speech.slice(0, 10)}的方式回應你）`);
  }
  if (personality) {
    bodies.push(`以我${personality.slice(0, 8)}的性子，我大概會這樣想。`);
  }
  bodies.push('你剛剛說的，我會記著。');
  bodies.push('說給我聽，我不急著走。');
  bodies.push('那我們就從這裡繼續吧。');

  const messageText = `${pick(openers)}${pick(bodies)}`;

  // fallback：若角色資料極少，至少給出有署名、非佔位的兩段式回覆。
  return [
    { type: 'narration', content: narration },
    { type: 'message', content: messageText }
  ];
}

function truncate(str, n) {
  if (str.length <= n) return str;
  return str.slice(0, n) + '…';
}

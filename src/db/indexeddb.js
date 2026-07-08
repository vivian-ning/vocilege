// src/db/indexeddb.js
//
// IndexedDB 存取層（第六節）。使用三個 object store：
//   - "state"    ：單一 record（固定 key "app"），保存除 messages 以外的全部狀態
//   - "messages" ：keyPath "id"，另建 "conversationId" 索引
//   - "assets"   ：keyPath "id"，保存頭貼等二進位 Blob（V2 新增）
//   - "handles"  ：固定 key 存放不能序列化進 state 的瀏覽器 handle（V10.5 新增）
//
// 拆開的原因：messages 是唯一會無限成長的資料。若塞進單一 state blob，每送一則
// 訊息都要全量序列化重寫整包 state，聊天紀錄一多效能就會劣化。從 V0 就拆開，
// 未來才能做分頁載入。assets 同理：頭貼 Blob 不該塞進 state blob。
//
// 所有函式一律回傳 Promise 並處理錯誤。
//
// V2：DB version 1 → 2，新增 assets store。V10.5：DB version 2 → 3，新增 handles store。
// onupgradeneeded 以「存在才略過」方式建立各 store，因此舊使用者升級時既有資料完好。

const DB_NAME = 'local-character-chat';
const DB_VERSION = 3;
const STATE_STORE = 'state';
const MESSAGES_STORE = 'messages';
const ASSETS_STORE = 'assets';
const HANDLES_STORE = 'handles';
const STATE_KEY = 'app';
const AUTO_BACKUP_HANDLE_KEY = 'autoBackupDirectory';

let dbPromise = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;

      // state store：以固定 key 存單一 record（不使用 keyPath，改用外部 key）。
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE);
      }

      // messages store：keyPath = id，並建立 conversationId 索引。
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const msgStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
        msgStore.createIndex('conversationId', 'conversationId', { unique: false });
      }

      // assets store（V2 新增）：keyPath = id，保存 { id, kind, blob, mime, createdAt }。
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        db.createObjectStore(ASSETS_STORE, { keyPath: 'id' });
      }

      // handles store：不可進 JSON/state 的 File System Access handle 只存在 IDB。
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        db.createObjectStore(HANDLES_STORE);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('開啟 IndexedDB 失敗'));
    req.onblocked = () => reject(new Error('IndexedDB 被其他分頁阻擋，請關閉其他分頁後重試'));
  });
}

export function initDB() {
  if (!dbPromise) {
    dbPromise = openDB();
  }
  return dbPromise;
}

function tx(storeNames, mode) {
  return initDB().then((db) => {
    const transaction = db.transaction(storeNames, mode);
    return transaction;
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('交易中止'));
  });
}

// ---- state ----

export async function loadState() {
  const transaction = await tx(STATE_STORE, 'readonly');
  const store = transaction.objectStore(STATE_STORE);
  const result = await reqToPromise(store.get(STATE_KEY));
  return result == null ? null : result;
}

// 完整保存 state record（不含 messages）。
//
// apiKey 持久化規則（第六節）：
//   - rememberApiKey = false（預設）：寫入 IndexedDB 前把 apiSettings.apiKey 清空
//   - rememberApiKey = true          ：apiKey 以明文存入
// 為避免污染呼叫端記憶體中的 state，先做淺層 clone 再處理。
export async function saveState(state) {
  const toStore = { ...state };
  const api = state.apiSettings ? { ...state.apiSettings } : undefined;
  if (api) {
    if (!api.rememberApiKey) {
      api.apiKey = '';
    }
    toStore.apiSettings = api;
  }

  const transaction = await tx(STATE_STORE, 'readwrite');
  const store = transaction.objectStore(STATE_STORE);
  store.put(toStore, STATE_KEY);
  await txDone(transaction);
}

// ---- messages ----

export async function getMessagesByConversation(conversationId) {
  const transaction = await tx(MESSAGES_STORE, 'readonly');
  const store = transaction.objectStore(MESSAGES_STORE);
  const index = store.index('conversationId');
  const result = await reqToPromise(index.getAll(conversationId));
  const list = Array.isArray(result) ? result : [];
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  return list;
}

export async function addMessage(message) {
  const transaction = await tx(MESSAGES_STORE, 'readwrite');
  const store = transaction.objectStore(MESSAGES_STORE);
  store.add(message);
  await txDone(transaction);
  return message;
}

export async function updateMessage(message) {
  const transaction = await tx(MESSAGES_STORE, 'readwrite');
  const store = transaction.objectStore(MESSAGES_STORE);
  store.put(message);
  await txDone(transaction);
  return message;
}

export async function deleteMessagesByConversation(conversationId) {
  const transaction = await tx(MESSAGES_STORE, 'readwrite');
  const store = transaction.objectStore(MESSAGES_STORE);
  const index = store.index('conversationId');
  const keys = await reqToPromise(index.getAllKeys(conversationId));
  (keys || []).forEach((key) => store.delete(key));
  await txDone(transaction);
}

export async function getAllMessages() {
  const transaction = await tx(MESSAGES_STORE, 'readonly');
  const store = transaction.objectStore(MESSAGES_STORE);
  const result = await reqToPromise(store.getAll());
  return Array.isArray(result) ? result : [];
}

// 批次寫入多則訊息（供匯入還原使用）。
export async function bulkAddMessages(messages) {
  const transaction = await tx(MESSAGES_STORE, 'readwrite');
  const store = transaction.objectStore(MESSAGES_STORE);
  (messages || []).forEach((m) => store.put(m));
  await txDone(transaction);
}

// ---- assets（V2）----
//
// asset record 形狀：{ id, kind: "avatar", blob: Blob, mime: "image/webp", createdAt }
// 二進位 Blob 直接存入 IndexedDB（原生支援 Blob），不做 base64，省空間也省編碼成本。

export async function putAsset(asset) {
  const transaction = await tx(ASSETS_STORE, 'readwrite');
  const store = transaction.objectStore(ASSETS_STORE);
  store.put(asset);
  await txDone(transaction);
  return asset;
}

export async function getAsset(id) {
  if (!id) return null;
  const transaction = await tx(ASSETS_STORE, 'readonly');
  const store = transaction.objectStore(ASSETS_STORE);
  const result = await reqToPromise(store.get(id));
  return result == null ? null : result;
}

export async function deleteAsset(id) {
  if (!id) return;
  const transaction = await tx(ASSETS_STORE, 'readwrite');
  const store = transaction.objectStore(ASSETS_STORE);
  store.delete(id);
  await txDone(transaction);
}

export async function getAllAssets() {
  const transaction = await tx(ASSETS_STORE, 'readonly');
  const store = transaction.objectStore(ASSETS_STORE);
  const result = await reqToPromise(store.getAll());
  return Array.isArray(result) ? result : [];
}

// ---- handles（V10.5）----
//
// FileSystemDirectoryHandle 可被 IndexedDB structured clone，但不可進 state / 備份 JSON。

export async function saveAutoBackupDirectoryHandle(handle) {
  const transaction = await tx(HANDLES_STORE, 'readwrite');
  const store = transaction.objectStore(HANDLES_STORE);
  store.put(handle, AUTO_BACKUP_HANDLE_KEY);
  await txDone(transaction);
  return handle;
}

export async function getAutoBackupDirectoryHandle() {
  const transaction = await tx(HANDLES_STORE, 'readonly');
  const store = transaction.objectStore(HANDLES_STORE);
  const result = await reqToPromise(store.get(AUTO_BACKUP_HANDLE_KEY));
  return result || null;
}

export async function clearAutoBackupDirectoryHandle() {
  const transaction = await tx(HANDLES_STORE, 'readwrite');
  const store = transaction.objectStore(HANDLES_STORE);
  store.delete(AUTO_BACKUP_HANDLE_KEY);
  await txDone(transaction);
}

// ---- 清空 ----

export async function clearAll() {
  const storeNames = [STATE_STORE, MESSAGES_STORE, ASSETS_STORE];
  const transaction = await tx(storeNames, 'readwrite');
  transaction.objectStore(STATE_STORE).clear();
  transaction.objectStore(MESSAGES_STORE).clear();
  transaction.objectStore(ASSETS_STORE).clear();
  await txDone(transaction);
}

export { STATE_KEY };

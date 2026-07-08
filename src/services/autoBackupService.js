// src/services/autoBackupService.js
//
// V10.5 自動備份：File System Access handle 只存在 IndexedDB handles store，
// 不進 state，也不進備份 JSON。

import {
  clearAutoBackupDirectoryHandle,
  getAutoBackupDirectoryHandle,
  saveAutoBackupDirectoryHandle
} from '../db/indexeddb.js';
import { buildFullArchivePayload, exportFullArchive } from './backupService.js';
import { getState, markAutoBackupDone, markBackupDone } from '../state/store.js';

const DAY_MS = 86400000;
const BACKUP_FILE_RE = /^vocilege-backup-\d{8}-\d{4}\.json$/;

let authNeeded = false;
let fallbackNeeded = false;

export function supportsDirectoryBackup() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function bindAutoBackupDirectory() {
  if (!supportsDirectoryBackup()) return { ok: false, reason: 'unsupported' };
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await saveAutoBackupDirectoryHandle(handle);
  authNeeded = false;
  fallbackNeeded = false;
  return { ok: true, name: handle.name || '已綁定資料夾' };
}

export async function unbindAutoBackupDirectory() {
  await clearAutoBackupDirectoryHandle();
  authNeeded = false;
  fallbackNeeded = false;
}

export async function getAutoBackupDirectoryInfo() {
  const handle = await getAutoBackupDirectoryHandle();
  return handle ? { bound: true, name: handle.name || '已綁定資料夾' } : { bound: false, name: '' };
}

export function getAutoBackupNotice(state = getState()) {
  const every = backupEveryDays(state);
  if (every <= 0) return null;
  if (authNeeded && supportsDirectoryBackup()) {
    return {
      type: 'reauthorize',
      text: '自動備份需要重新授權',
      actionText: '重新授權'
    };
  }
  if (shouldShowDownloadReminder(state) || fallbackNeeded) {
    return {
      type: 'download',
      text: '回憶該備份了',
      actionText: '立即下載'
    };
  }
  return null;
}

export async function requestAutoBackupAuthorization() {
  const handle = await getAutoBackupDirectoryHandle();
  if (!handle) {
    return bindAutoBackupDirectory();
  }
  const granted = await ensurePermission(handle, { interactive: true });
  if (granted) {
    authNeeded = false;
    fallbackNeeded = false;
    return { ok: true, name: handle.name || '已綁定資料夾' };
  }
  return { ok: false, reason: 'denied' };
}

export async function runAutoBackupOnBoot() {
  const state = getState();
  if (!state || backupEveryDays(state) <= 0) return { ok: false, reason: 'disabled' };
  if (!isDue(state.lastAutoBackupAt || 0, backupEveryDays(state))) return { ok: false, reason: 'not-due' };
  if (!supportsDirectoryBackup()) {
    fallbackNeeded = shouldShowDownloadReminder(state);
    return { ok: false, reason: 'unsupported' };
  }
  const handle = await getAutoBackupDirectoryHandle();
  if (!handle) {
    fallbackNeeded = shouldShowDownloadReminder(state);
    return { ok: false, reason: 'unbound' };
  }
  const granted = await ensurePermission(handle, { interactive: false });
  if (!granted) {
    authNeeded = true;
    return { ok: false, reason: 'permission' };
  }
  try {
    await writeBackupToDirectory(handle);
    await rotateBackups(handle);
    await markAutoBackupDone();
    authNeeded = false;
    fallbackNeeded = false;
    emitToast('已自動備份');
    return { ok: true };
  } catch (err) {
    fallbackNeeded = true;
    return { ok: false, reason: 'write-failed' };
  }
}

export async function downloadBackupNow() {
  await exportFullArchive();
  fallbackNeeded = false;
  await markBackupDone();
  return { ok: true };
}

async function writeBackupToDirectory(handle) {
  const payload = await buildFullArchivePayload();
  const file = await handle.getFileHandle(autoBackupFilename(), { create: true });
  const writable = await file.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

async function rotateBackups(handle) {
  if (!handle || !handle.entries) return;
  const files = [];
  for await (const [name, child] of handle.entries()) {
    if (!BACKUP_FILE_RE.test(name) || !child || child.kind !== 'file') continue;
    files.push(name);
  }
  files.sort();
  const extra = files.length - 10;
  if (extra <= 0) return;
  for (const name of files.slice(0, extra)) {
    await handle.removeEntry(name).catch(() => {});
  }
}

async function ensurePermission(handle, { interactive }) {
  if (!handle) return false;
  const options = { mode: 'readwrite' };
  if (typeof handle.queryPermission === 'function') {
    const status = await handle.queryPermission(options).catch(() => 'prompt');
    if (status === 'granted') return true;
    if (!interactive) return false;
  }
  if (!interactive || typeof handle.requestPermission !== 'function') return false;
  const next = await handle.requestPermission(options).catch(() => 'denied');
  return next === 'granted';
}

function backupEveryDays(state) {
  const n = Number(state && state.settings && state.settings.backupEveryDays);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 3;
}

function shouldShowDownloadReminder(state) {
  const every = backupEveryDays(state);
  if (every <= 0) return false;
  const last = Math.max(Number(state.lastBackupAt) || 0, Number(state.lastAutoBackupAt) || 0);
  return isDue(last, every);
}

function isDue(last, everyDays) {
  if (everyDays <= 0) return false;
  if (!last) return true;
  return Date.now() - last >= everyDays * DAY_MS;
}

function autoBackupFilename(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `vocilege-backup-${y}${m}${day}-${h}${min}.json`;
}

function emitToast(message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('vocilege:toast', { detail: { message } }));
}

export const __autoBackupTest = {
  autoBackupFilename,
  BACKUP_FILE_RE,
  rotateBackups,
  writeBackupToDirectory
};

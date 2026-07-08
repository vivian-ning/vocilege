// src/ui/components/backupPanel.js
//
// 右欄「資料」分頁（第八、十三、十五節）。匯出 / 匯入 / 清空，並提醒本機資料風險。

import { exportData, exportFullArchive, importData, clearData } from '../../services/backupService.js';
import {
  bindAutoBackupDirectory,
  getAutoBackupDirectoryInfo,
  supportsDirectoryBackup,
  unbindAutoBackupDirectory
} from '../../services/autoBackupService.js';
import { forceRefreshApp } from '../../services/updateService.js';
import { getState, updateSettings } from '../../state/store.js';
import { confirmDialog } from '../dialog.js';

export function renderBackupPanel(container) {
  container.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'backup-panel';

  wrap.appendChild(section('自動備份', '可用時會把封聲備份直接寫進你指定的資料夾；不支援的瀏覽器會改成首頁提醒下載。', () => {
    const state = getState();
    const every = document.createElement('input');
    every.type = 'number';
    every.min = '0';
    every.max = '365';
    every.step = '1';
    every.className = 'form-control';
    every.value = String((state.settings && state.settings.backupEveryDays) ?? 3);
    every.addEventListener('change', () => {
      const n = Math.max(0, Math.min(365, Math.floor(Number(every.value) || 0)));
      updateSettings({ backupEveryDays: n });
    });

    const field = wrapField('每隔幾天提醒 / 自動備份', every);
    const hint = document.createElement('div');
    hint.className = 'form-hint';
    hint.textContent = '預設 3 天；填 0 會關閉自動備份與首頁提醒。';

    const folderBox = document.createElement('div');
    folderBox.className = 'auto-backup-folder';
    renderAutoBackupFolder(folderBox);

    return [field, hint, folderBox];
  }));

  // 匯出
  wrap.appendChild(section('匯出資料', '把全部角色、對話與訊息打包成 JSON 下載。（匯出檔不含 API 金鑰）', () => {
    const btn = button('匯出 JSON', 'btn-primary', async () => {
      await exportData();
    });
    const full = button('封聲', 'btn', async () => {
      await exportFullArchive();
    });
    const hint = document.createElement('div');
    hint.className = 'form-hint';
    hint.textContent = '封聲會包含貼圖、照片與所有 assets，檔案可能很大。';
    return [btn, full, hint];
  }));

  // 匯入
  wrap.appendChild(section('匯入資料', '從先前匯出的 JSON 還原。匯入採全有全無：驗證與升級全部成功才會覆蓋，且會保留本機 API 金鑰設定。', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.className = 'file-input';

    const status = document.createElement('div');
    status.className = 'backup-status';

    const btn = button('選擇檔案並匯入', 'btn', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await importData(String(reader.result));
          status.textContent = '匯入成功 ✓';
          status.className = 'backup-status ok';
        } catch (err) {
          status.textContent = err.message || '匯入失敗';
          status.className = 'backup-status error';
        } finally {
          fileInput.value = '';
        }
      };
      reader.onerror = () => {
        status.textContent = '讀取檔案失敗';
        status.className = 'backup-status error';
      };
      reader.readAsText(file);
    });

    return [btn, fileInput, status];
  }));

  // 清空
  wrap.appendChild(section('清空全部資料', '刪除本機所有資料並重設為初始狀態，此動作無法復原。', () => {
    const status = document.createElement('div');
    status.className = 'backup-status';
    const btn = button('清空資料', 'btn-danger', async () => {
      const ok = await confirmDialog({
        title: '清空全部資料',
        message: '確定要清空全部資料嗎？此動作無法復原。建議先匯出備份。',
        confirmText: '清空資料',
        danger: true
      });
      if (!ok) return;
      await clearData();
      status.textContent = '已清空並重設 ✓';
      status.className = 'backup-status ok';
    });
    return [btn, status];
  }));

  wrap.appendChild(section('強制更新', '畫面怪怪的、更新沒生效時按這個。只會清 service worker 與 HTTP 快取，不會刪除 IndexedDB 裡的資料。', () => {
    const status = document.createElement('div');
    status.className = 'backup-status';
    const btn = button('強制更新', 'btn', async () => {
      const ok = await confirmDialog({
        title: '強制更新',
        message: '確定要強制更新嗎？這只會清除更新快取，不會刪除角色、對話或聲痕。',
        confirmText: '強制更新'
      });
      if (!ok) return;
      status.className = 'form-hint';
      status.textContent = '正在清除更新快取…';
      try {
        await forceRefreshApp();
      } catch (err) {
        status.className = 'backup-status error';
        status.textContent = `強制更新失敗：${(err && err.message) || String(err)}`;
      }
    });
    return [btn, status];
  }));

  // 隱私提醒（第十五節）
  const notice = document.createElement('div');
  notice.className = 'backup-notice';
  notice.textContent = '提醒：本機資料儲存在瀏覽器 IndexedDB。清除瀏覽器資料或更換裝置 / 瀏覽器會使資料消失，請定期匯出備份。';
  wrap.appendChild(notice);

  container.appendChild(wrap);
}

async function renderAutoBackupFolder(container) {
  container.textContent = '';
  const supported = supportsDirectoryBackup();
  const status = document.createElement('div');
  status.className = 'form-hint';
  container.appendChild(status);

  if (!supported) {
    status.textContent = '此瀏覽器不支援直接綁定資料夾；拾聲會在首頁提醒你下載封聲備份。';
    return;
  }

  const actions = document.createElement('div');
  actions.className = 'form-actions';
  const bind = button('綁定備份資料夾', 'btn-primary', async () => {
    bind.disabled = true;
    try {
      const result = await bindAutoBackupDirectory();
      status.className = 'backup-status ok';
      status.textContent = `已綁定：${result.name || '備份資料夾'}`;
      await renderAutoBackupFolder(container);
    } catch (err) {
      status.className = 'backup-status error';
      status.textContent = `綁定失敗：${(err && err.message) || String(err)}`;
    } finally {
      bind.disabled = false;
    }
  });
  actions.appendChild(bind);
  container.appendChild(actions);

  const info = await getAutoBackupDirectoryInfo();
  if (!info.bound) {
    status.textContent = '尚未綁定資料夾。綁定後，資料夾授權只存在這個瀏覽器的 IndexedDB，不會進備份檔。';
    return;
  }

  status.textContent = `已綁定：${info.name}`;
  const unbind = button('解除綁定', 'btn', async () => {
    await unbindAutoBackupDirectory();
    await renderAutoBackupFolder(container);
  });
  actions.appendChild(unbind);
}

function section(title, desc, buildControls) {
  const sec = document.createElement('div');
  sec.className = 'backup-section';

  const h = document.createElement('h3');
  h.className = 'backup-title';
  h.textContent = title;
  sec.appendChild(h);

  const p = document.createElement('p');
  p.className = 'backup-desc';
  p.textContent = desc;
  sec.appendChild(p);

  const controls = buildControls();
  for (const c of controls) sec.appendChild(c);

  return sec;
}

function button(text, variant, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${variant || ''}`.trim();
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

function wrapField(label, control) {
  const el = document.createElement('label');
  el.className = 'form-field';
  const span = document.createElement('span');
  span.className = 'form-label';
  span.textContent = label;
  el.appendChild(span);
  el.appendChild(control);
  return el;
}

// src/ui/components/backupPanel.js
//
// 右欄「資料」分頁（第八、十三、十五節）。匯出 / 匯入 / 清空，並提醒本機資料風險。

import { exportData, exportFullArchive, importData, clearData } from '../../services/backupService.js';

export function renderBackupPanel(container) {
  container.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'backup-panel';

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
      const ok = window.confirm('確定要清空全部資料嗎？此動作無法復原。建議先匯出備份。');
      if (!ok) return;
      await clearData();
      status.textContent = '已清空並重設 ✓';
      status.className = 'backup-status ok';
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

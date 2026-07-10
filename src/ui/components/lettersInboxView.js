import { deleteLetter, markLetterRead } from '../../state/store.js';
import { createAvatarEl } from '../avatar.js';
import { confirmDialog } from '../dialog.js';

export function renderLettersInboxView(container, state) {
  container.textContent = '';

  const page = document.createElement('main');
  page.className = 'letters-page';

  const head = document.createElement('header');
  head.className = 'today-date-head letters-head';
  const left = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'washi-eyebrow';
  eyebrow.textContent = '聲箋收件匣';
  const title = document.createElement('h1');
  title.className = 'today-date-title';
  title.textContent = '所有來信';
  left.appendChild(eyebrow);
  left.appendChild(title);
  const count = document.createElement('div');
  count.className = 'today-date-note';
  const unread = (state.letters || []).filter((letter) => letter && !letter.isRead).length;
  count.textContent = unread ? `${unread} 封未讀` : '已讀完';
  head.appendChild(left);
  head.appendChild(count);
  page.appendChild(head);

  const list = document.createElement('div');
  list.className = 'letters-inbox washi-list';
  const rows = sortedLetters(state);
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'home-inline-empty';
    empty.textContent = '還沒有聲箋。';
    list.appendChild(empty);
  } else {
    rows.forEach((row, index) => list.appendChild(letterInboxRow(row, index)));
  }
  page.appendChild(list);
  container.appendChild(page);
}

function sortedLetters(state) {
  return (state.letters || [])
    .filter((letter) => letter && characterById(state, letter.characterId))
    .map((letter) => ({ letter, character: characterById(state, letter.characterId) }))
    .sort((a, b) => {
      const unreadDiff = (a.letter.isRead ? 1 : 0) - (b.letter.isRead ? 1 : 0);
      if (unreadDiff !== 0) return unreadDiff;
      return (b.letter.createdAt || 0) - (a.letter.createdAt || 0);
    });
}

function letterInboxRow({ letter, character }, index) {
  const row = document.createElement('article');
  row.className = 'letter-inbox-row washi-row' + (letter.isRead ? '' : ' unread');
  row.style.setProperty('--i', String(index));

  row.appendChild(createAvatarEl(character.avatar, 'recent-chat-avatar'));

  const body = document.createElement('button');
  body.type = 'button';
  body.className = 'letter-inbox-main';
  body.addEventListener('click', () => openLetterReader(letter, character));

  const meta = document.createElement('span');
  meta.className = 'washi-eyebrow';
  meta.textContent = `${character.name || '角色'} · ${letterKindLabel(letter)} · ${formatDate(letter.createdAt)}`;
  const title = document.createElement('span');
  title.className = 'washi-row-main';
  title.textContent = compactText(letter.content, 54) || '一封尚未展開的聲箋';
  const sub = document.createElement('span');
  sub.className = 'washi-row-sub';
  sub.textContent = letter.isRead ? '已讀' : '未讀';
  body.appendChild(meta);
  body.appendChild(title);
  body.appendChild(sub);
  row.appendChild(body);

  const dot = document.createElement('span');
  dot.className = 'letter-unread-dot';
  dot.hidden = letter.isRead;
  row.appendChild(dot);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn btn-danger life-delete';
  del.textContent = '刪除';
  del.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: '刪除聲箋',
      message: '刪除這封聲箋？',
      confirmText: '刪除',
      danger: true
    });
    if (ok) await deleteLetter(letter.id);
  });
  row.appendChild(del);
  return row;
}

async function openLetterReader(letter, character) {
  await markLetterRead(letter.id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal dashboard-modal letter-reader-modal';
  const head = document.createElement('div');
  head.className = 'dashboard-modal-head';
  const title = document.createElement('h2');
  title.className = 'modal-title';
  title.textContent = letterKindLabel(letter);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn';
  close.setAttribute('aria-label', '關閉');
  close.title = '關閉';
  close.textContent = '×';
  close.addEventListener('click', () => overlay.remove());
  head.appendChild(title);
  head.appendChild(close);
  modal.appendChild(head);

  const article = document.createElement('article');
  article.className = 'letter-reader';
  const meta = document.createElement('div');
  meta.className = 'life-item-date';
  meta.textContent = `${character.name || '角色'} · ${formatDate(letter.createdAt)}`;
  article.appendChild(meta);
  for (const block of String(letter.content || '').split(/\n\s*\n/)) {
    const p = document.createElement('p');
    p.textContent = block.trim();
    if (p.textContent) article.appendChild(p);
  }
  modal.appendChild(article);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

function characterById(state, id) {
  return (state.characters || []).find((character) => character.id === id) || null;
}

function letterKindLabel(letter) {
  return letter && letter.kind === 'weeklyReview' ? '週回顧' : '聲箋';
}

function compactText(text, limit) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

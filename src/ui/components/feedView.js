import {
  addPost,
  deletePost,
  togglePostLike,
  togglePostCommentLike,
  addPostComment
} from '../../state/store.js';
import { createAvatarEl } from '../avatar.js';
import { confirmDialog } from '../dialog.js';

export function renderFeedView(container, state) {
  container.textContent = '';

  const page = document.createElement('div');
  page.className = 'feed-page';

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = '迴聲';
  page.appendChild(title);

  page.appendChild(buildComposer(state));

  const list = document.createElement('div');
  list.className = 'feed-list';
  const posts = (state.posts || [])
    .slice()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (!posts.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.textContent = '還沒有迴聲。私密的記錄寫在日常的拾日；想聽角色回應，可以在這裡發布，或從拾日一鍵分享過來。';
    list.appendChild(empty);
  } else {
    for (const post of posts) list.appendChild(buildPost(post, state));
  }
  page.appendChild(list);

  container.appendChild(page);
}

function buildComposer(state) {
  const form = document.createElement('form');
  form.className = 'feed-composer';

  const textarea = document.createElement('textarea');
  textarea.className = 'form-control feed-input';
  textarea.rows = 3;
  textarea.placeholder = '今天想留下什麼？';
  form.appendChild(textarea);

  const row = document.createElement('div');
  row.className = 'feed-composer-row';
  const mood = document.createElement('input');
  mood.type = 'text';
  mood.className = 'form-control feed-mood';
  mood.placeholder = '心情';
  mood.maxLength = 8;
  row.appendChild(mood);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn btn-primary';
  submit.textContent = '發布';
  row.appendChild(submit);
  form.appendChild(row);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!textarea.value.trim()) return;
    await addPost({ content: textarea.value, mood: mood.value });
    textarea.value = '';
    mood.value = '';
  });

  return form;
}

function buildPost(post, state) {
  const card = document.createElement('article');
  card.className = 'feed-post';

  const head = document.createElement('div');
  head.className = 'feed-post-head';
  const author = resolveAuthor(post.authorType, post.authorId, state);
  head.appendChild(createAvatarEl(author.avatar, 'feed-avatar'));
  const meta = document.createElement('div');
  meta.className = 'feed-meta';
  const name = document.createElement('div');
  name.className = 'feed-author';
  name.textContent = author.name;
  meta.appendChild(name);
  const time = document.createElement('div');
  time.className = 'feed-time';
  time.textContent = formatRelative(post.createdAt) + (post.mood ? ` · ${post.mood}` : '');
  meta.appendChild(time);
  head.appendChild(meta);

  if (post.authorType === 'player') {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'gp-icon-btn feed-delete';
    del.textContent = '刪';
    del.title = '刪除貼文';
    del.addEventListener('click', async () => {
      if (await confirmDialog({
        title: '刪除迴聲',
        message: '要刪除這則迴聲嗎？',
        confirmText: '刪除',
        danger: true
      })) deletePost(post.id);
    });
    head.appendChild(del);
  }
  card.appendChild(head);

  const content = document.createElement('div');
  content.className = 'feed-content';
  content.textContent = post.content || '';
  card.appendChild(content);

  const actions = document.createElement('div');
  actions.className = 'feed-actions';
  const liked = (post.likes || []).some((l) => l.userType === 'player' && l.userId === 'player');
  const like = document.createElement('button');
  like.type = 'button';
  like.className = 'btn' + (liked ? ' active' : '');
  like.textContent = `${liked ? '♥' : '♡'} ${(post.likes || []).length}`;
  like.addEventListener('click', () => togglePostLike(post.id));
  actions.appendChild(like);
  card.appendChild(actions);

  const comments = document.createElement('div');
  comments.className = 'feed-comments';
  for (const comment of (post.comments || [])) {
    comments.appendChild(buildComment(post.id, comment, state));
  }
  comments.appendChild(buildCommentForm(post.id));
  card.appendChild(comments);

  return card;
}

function buildComment(postId, comment, state) {
  const row = document.createElement('div');
  row.className = 'feed-comment';
  const author = resolveAuthor(comment.authorType, comment.authorId, state);
  row.appendChild(createAvatarEl(author.avatar, 'feed-comment-avatar'));
  const body = document.createElement('div');
  body.className = 'feed-comment-body';
  const name = document.createElement('span');
  name.className = 'feed-comment-author';
  name.textContent = author.name;
  body.appendChild(name);
  const text = document.createElement('span');
  text.className = 'feed-comment-text';
  text.textContent = comment.content || '';
  body.appendChild(text);
  const likes = Array.isArray(comment.likes) ? comment.likes : [];
  const liked = likes.some((l) => l && l.userType === 'player' && l.userId === 'player');
  const like = document.createElement('button');
  like.type = 'button';
  like.className = 'feed-comment-like' + (liked ? ' active' : '');
  like.textContent = `${liked ? '♥' : '♡'} ${likes.length}`;
  like.title = '愛心';
  like.addEventListener('click', () => togglePostCommentLike(postId, comment.id));
  body.appendChild(like);
  row.appendChild(body);
  return row;
}

function buildCommentForm(postId) {
  const form = document.createElement('form');
  form.className = 'feed-comment-form';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'form-control';
  input.placeholder = '回應這則動態';
  form.appendChild(input);
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = '送出';
  form.appendChild(submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    await addPostComment(postId, { content: input.value });
    input.value = '';
  });
  return form;
}

function resolveAuthor(type, id, state) {
  if (type === 'character') {
    const c = (state.characters || []).find((x) => x.id === id);
    return {
      name: (c && c.name) || '角色',
      avatar: c && c.avatar
    };
  }
  return {
    name: (state.player && state.player.playerName) || '你',
    avatar: state.player && state.player.avatar
  };
}

function pad(n) { return String(n).padStart(2, '0'); }

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatRelative(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return '剛剛';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  const days = Math.floor(diff / 86400000);
  if (days < 30) return `${days} 天前`;
  return formatDateTime(ts);
}

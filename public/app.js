// Yorisoi アプリの画面。外部ライブラリは使わない。
const LABEL = { instagram: 'Instagram', gmail: 'Gmail', slack: 'Slack', mock: 'テスト' };
const STATUS = { new: '未返信', notified: '未返信', replied: '返信済み', ignored: '対応不要' };

const $ = (id) => document.getElementById(id);
const state = { view: 'open', platform: null, mentions: [], platforms: [] };

const storage = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
};

async function api(path, options = {}) {
  const token = storage.get('yorisoi-token');
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showGate();
    throw new Error(body.error || '合言葉が必要です');
  }
  if (!res.ok) throw new Error(body.error || `エラー (${res.status})`);
  return body;
}

function showGate() {
  $('token-gate').hidden = false;
  $('inbox').hidden = true;
}

function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3000);
}

const timeFmt = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
function relativeTime(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'たった今';
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
  return timeFmt.format(new Date(iso));
}

function renderFilters() {
  const box = $('filters');
  box.replaceChildren();
  const platforms = [...new Set([...state.platforms, ...state.mentions.map((m) => m.platform)])];
  if (platforms.length < 2) return;
  for (const p of [null, ...platforms]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = p ? LABEL[p] ?? p : 'すべてのサービス';
    b.setAttribute('aria-pressed', String(state.platform === p));
    b.onclick = () => { state.platform = p; render(); };
    box.append(b);
  }
}

function renderItem(m) {
  const li = $('item-tpl').content.firstElementChild.cloneNode(true);
  const badge = li.querySelector('.badge');
  badge.textContent = LABEL[m.platform] ?? m.platform;
  badge.dataset.platform = m.platform;
  li.querySelector('.author').textContent = m.authorName ? `${m.authorName}` : m.author;
  li.querySelector('.author').title = m.author;
  const time = li.querySelector('.time');
  time.textContent = relativeTime(m.createdAt);
  time.dateTime = m.createdAt;
  time.title = new Date(m.createdAt).toLocaleString('ja-JP');
  li.querySelector('.text').textContent = m.text;

  const st = li.querySelector('.state');
  st.textContent = STATUS[m.status] ?? m.status;
  st.dataset.status = m.status;
  const link = li.querySelector('.open-link');
  if (m.url && /^https:\/\//.test(m.url)) link.href = m.url; else link.remove();

  const open = m.status === 'new' || m.status === 'notified';
  const form = li.querySelector('.reply');
  if (m.reply) {
    const sent = li.querySelector('.sent-reply');
    sent.textContent = `${m.reply.by === 'rule' ? '自動返信' : 'あなたの返信'}：${m.reply.text}`;
    sent.hidden = false;
  }
  if (!open) {
    form.remove();
    if (m.status === 'ignored') {
      const reopen = li.querySelector('.reopen');
      reopen.hidden = false;
      reopen.onclick = () => act(m, 'reopen');
    }
    return li;
  }

  const textarea = form.querySelector('textarea');
  const sendBtn = form.querySelector('.send');
  const draftKey = `yorisoi-draft:${m.id}`;
  textarea.value = storage.get(draftKey) ?? '';
  textarea.oninput = () => storage.set(draftKey, textarea.value);
  textarea.onkeydown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return textarea.focus();
    sendBtn.disabled = true;
    sendBtn.textContent = '送信中…';
    try {
      await act(m, 'reply', { text });
      storage.set(draftKey, '');
      toast(`${m.authorName || m.author} に返信しました`);
    } catch (err) {
      toast(err.message, true);
      sendBtn.disabled = false;
      sendBtn.textContent = '返信する';
    }
  };
  form.querySelector('.ignore').onclick = () => act(m, 'ignore').catch((err) => toast(err.message, true));
  return li;
}

async function act(m, action, body) {
  const { mention } = await api(`/api/mentions/${encodeURIComponent(m.id)}/${action}`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });
  state.mentions = state.mentions.map((x) => (x.id === mention.id ? mention : x));
  render();
}

function render() {
  const isOpen = (m) => m.status === 'new' || m.status === 'notified';
  const openCount = state.mentions.filter(isOpen).length;
  $('open-count').textContent = openCount ? String(openCount) : '';
  document.title = openCount ? `(${openCount}) Yorisoi` : 'Yorisoi';
  if ('setAppBadge' in navigator) (openCount ? navigator.setAppBadge(openCount) : navigator.clearAppBadge()).catch(() => {});

  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === state.view)));
  renderFilters();

  const items = state.mentions
    .filter((m) => state.view === 'all' || isOpen(m))
    .filter((m) => !state.platform || m.platform === state.platform);
  $('list').replaceChildren(...items.map(renderItem));
  $('empty').hidden = items.length > 0;
  $('empty').querySelector('.empty-title').textContent =
    state.view === 'all' ? 'まだメッセージはありません' : '未返信のメッセージはありません';
}

async function load() {
  const [{ mentions }, status] = await Promise.all([api('/api/mentions?status=all'), api('/api/status')]);
  state.mentions = mentions;
  state.platforms = status.platforms;
  const notice = $('notice');
  notice.hidden = status.platforms.length > 0;
  notice.textContent = 'まだサービスがつながっていません。.env にキーを設定すると、ここにメッセージが集まります。';
  render();
}

async function sync() {
  const btn = $('sync-btn');
  btn.disabled = true;
  btn.classList.add('syncing');
  try {
    const r = await api('/api/sync', { method: 'POST' });
    await load();
    if (r.errors.length) toast(`一部のサービスで確認できませんでした: ${r.errors.map((e) => e.platform).join('、')}`, true);
    else toast(r.added ? `${r.added} 件の新着があります` : '新着はありません');
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.classList.remove('syncing');
  }
}

function listenForNew() {
  const token = storage.get('yorisoi-token');
  const es = new EventSource(`/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`);
  es.addEventListener('mentions', (e) => {
    const mentions = JSON.parse(e.data);
    load().catch(() => {});
    toast(`${mentions.length} 件の新着があります`);
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      const first = mentions[0];
      const body = mentions.length === 1
        ? `${first.authorName || first.author}: ${first.text.slice(0, 80)}`
        : `${LABEL[first.platform] ?? first.platform} ほか、${mentions.length} 件`;
      navigator.serviceWorker?.ready
        .then((reg) => reg.showNotification('Yorisoi に新着があります', { body, tag: 'yorisoi-new', icon: 'icon-192.png' }))
        .catch(() => new Notification('Yorisoi に新着があります', { body }));
    }
  });
}

function setupNotifyButton() {
  const btn = $('notify-btn');
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  btn.hidden = false;
  btn.onclick = async () => {
    const result = await Notification.requestPermission();
    btn.hidden = true;
    toast(result === 'granted' ? '新着を通知でお知らせします' : '通知はオフのままです');
  };
}

document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { state.view = b.dataset.view; render(); }));
$('sync-btn').onclick = sync;
$('token-form').onsubmit = (e) => {
  e.preventDefault();
  storage.set('yorisoi-token', $('token-input').value);
  location.reload();
};
setInterval(render, 60_000); // 「○分前」を更新

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
setupNotifyButton();
load()
  .then(listenForNew)
  .catch((err) => { if (!$('token-gate').hidden) return; toast(err.message, true); });

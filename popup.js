const DEFAULTS = {
  enabled: true,
  skipAt: 60,
  playlists: '',
};

const CACHE_TTL = 12 * 60 * 60 * 1000; // 받아 둔 재생목록은 12시간 동안 다시 받지 않는다
const MAX_RESULTS = 50;

const $ = (id) => document.getElementById(id);

const splitIds = (text) => text.split(/[\s,]+/).filter(Boolean);

// 팝업을 연 탭: { tab, youtube, alive, list, v }
// alive 는 이 탭에 지금 버전의 콘텐츠 스크립트가 살아 있는지. (확장 프로그램보다 먼저 열린 탭은 false)
let tabInfo = null;

async function inspectTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const info = { tab, youtube: false, alive: false, list: null, v: null };
  if (!tab?.url) return info;

  const url = new URL(tab.url);
  info.youtube = url.hostname === 'www.youtube.com';
  if (!info.youtube) return info;

  info.list = url.searchParams.get('list');
  info.v = url.searchParams.get('v');
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ping' });
    info.alive = true;
  } catch { /* 콘텐츠 스크립트가 없다 → 새로고침이 필요한 탭 */ }
  return info;
}

// ── 탭 ─────────────────────────────────────────

function showTab(name) {
  for (const tab of ['settings', 'search']) {
    $(`tab-${tab}`).setAttribute('aria-selected', String(tab === name));
    $(`panel-${tab}`).hidden = tab !== name;
  }
  if (name === 'search') $('query').focus();
}

$('tab-settings').addEventListener('click', () => showTab('settings'));
$('tab-search').addEventListener('click', () => showTab('search'));
$('close').addEventListener('click', () => window.close());

// ── 상태 표시 ──────────────────────────────────

const STATES = {
  loading: { title: '확인 중...', desc: '' },
  active: { title: '적용 중', desc: () => `이 재생목록에서 ${$('skipAt').value}초가 지나면 다음 화로 넘어가요.` },
  'not-added': { title: '적용 안 됨', desc: '이 재생목록은 아직 추가하지 않았어요.', action: '+ 이 재생목록 추가' },
  off: { title: '꺼져 있음', desc: '추가된 재생목록이에요. YES 를 누르면 다시 건너뛰어요.' },
  stale: { title: '새로고침이 필요해요', desc: '확장 프로그램보다 먼저 열린 탭이라 아직 동작하지 않아요.', action: '↻ 탭 새로고침' },
  'no-playlist': { title: '재생목록이 아니에요', desc: '재생목록으로 영상을 틀면 여기서 바로 추가할 수 있어요.' },
  'not-youtube': { title: '유튜브가 아니에요', desc: '유튜브 재생목록 영상에서 열어 주세요.' },
};

function currentState() {
  if (!tabInfo) return 'loading';
  if (!tabInfo.youtube) return 'not-youtube';
  if (!tabInfo.alive) return 'stale';
  if (!tabInfo.list) return 'no-playlist';
  if (!splitIds($('playlists').value).includes(tabInfo.list)) return 'not-added';
  return enabled ? 'active' : 'off';
}

let idleStatus = '♡ 대기 중';

function renderState() {
  const state = currentState();
  const view = STATES[state];
  $('state').dataset.state = state;
  $('state-title').textContent = view.title;
  $('state-desc').textContent = typeof view.desc === 'function' ? view.desc() : view.desc;
  $('state-action').hidden = !view.action;
  $('state-action').textContent = view.action ?? '';

  idleStatus = state === 'active' ? '♥ 적용 중' : '♡ 대기 중';
  if (!$('status').classList.contains('saved')) $('status').textContent = idleStatus;
}

$('state-action').addEventListener('click', () => {
  const state = currentState();
  if (state === 'not-added') {
    $('playlists').value = [...splitIds($('playlists').value), tabInfo.list].join('\n');
    save();
  } else if (state === 'stale') {
    chrome.tabs.reload(tabInfo.tab.id);
    window.close();
  }
});

// ── 설정 ───────────────────────────────────────

let enabled = DEFAULTS.enabled;

// 재생목록 주소를 붙여 넣어도 list= 값만 뽑아 쓴다.
function toListId(token) {
  try { return new URL(token).searchParams.get('list') || ''; } catch { return token; }
}

function renderEnabled() {
  $('yes').setAttribute('aria-pressed', String(enabled));
  $('no').setAttribute('aria-pressed', String(!enabled));
}

let statusTimer;
function flashStatus(text) {
  const status = $('status');
  status.textContent = text;
  status.className = '';
  void status.offsetWidth; // 깜빡임 애니메이션을 다시 시작
  status.className = 'saved';
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    status.textContent = idleStatus;
    status.className = '';
  }, 1400);
}

async function save() {
  const skipAt = Math.max(1, Math.round(Number($('skipAt').value) || DEFAULTS.skipAt));
  const playlists = splitIds($('playlists').value).map(toListId).filter(Boolean);
  $('skipAt').value = skipAt;
  $('playlists').value = playlists.join('\n');

  await chrome.storage.sync.set({ enabled, skipAt, playlists: playlists.join('\n') });
  flashStatus('♥ 저장 완료!');
  renderState();
}

function nudge(delta) {
  $('skipAt').value = Math.max(1, (Number($('skipAt').value) || DEFAULTS.skipAt) + delta);
  save();
}

$('yes').addEventListener('click', () => { enabled = true; renderEnabled(); save(); });
$('no').addEventListener('click', () => { enabled = false; renderEnabled(); save(); });
$('minus').addEventListener('click', () => nudge(-1));
$('plus').addEventListener('click', () => nudge(1));
$('skipAt').addEventListener('change', save);
$('playlists').addEventListener('change', save);

// ── 찾기 ───────────────────────────────────────

let listId = null;    // 검색할 재생목록
let entries = [];     // 재생목록 영상 + 검색용 정보

const normalize = (s) => s.toLowerCase().replace(/\s+/g, '');

// "[시리즈 제목] 15화_젤리, 카눌레" → { no: 15, label: '15화', name: '젤리, 카눌레' }
function episodeOf(title) {
  const m = title.match(/(\d+)화[_\s]*(.*)$/);
  return m ? { no: Number(m[1]), label: `${m[1]}화`, name: m[2] || title } : null;
}

async function loadPlaylist(force) {
  const key = `playlist:${listId}`;
  const cached = (await chrome.storage.local.get(key))[key];
  const fresh = cached && Date.now() - cached.savedAt < CACHE_TTL;
  if (cached && !force && (fresh || !tabInfo.alive)) return cached;

  if (!tabInfo.alive) {
    throw new Error(tabInfo.youtube ? '유튜브 탭을 새로고침하면 목록을 받아 올게요.' : '유튜브 탭에서 열면 목록을 받아 올게요.');
  }
  const res = await chrome.tabs.sendMessage(tabInfo.tab.id, { type: 'playlist', list: listId });
  if (!res?.ok || !res.items.length) throw new Error('목록을 받아 오지 못했어요. ↻ 로 다시 해 보세요.');

  const playlist = { title: res.title, items: res.items, savedAt: Date.now() };
  await chrome.storage.local.set({ [key]: playlist });
  return playlist;
}

async function refresh(force) {
  $('loading').hidden = false;
  $('note').textContent = '';
  $('results').replaceChildren();
  try {
    const playlist = await loadPlaylist(force);
    entries = playlist.items.map((item) => ({ ...item, ep: episodeOf(item.title), norm: normalize(item.title) }));
    $('source').textContent = `♪ ${playlist.title || listId} · ${entries.length}개`;
    $('source').title = playlist.title;
    renderResults();
  } catch (err) {
    entries = [];
    $('note').textContent = err.message;
  } finally {
    $('loading').hidden = true;
  }
}

// 숫자만 넣으면(15, 15화) 그 화를 맨 앞에, 나머지는 제목에 단어가 들어간 순서대로.
function search(query) {
  const q = normalize(query);
  const no = q.match(/^(\d+)화?$/)?.[1];
  const exact = no ? entries.filter((e) => e.ep?.no === Number(no)) : [];
  return [...exact, ...entries.filter((e) => !exact.includes(e) && e.norm.includes(q))];
}

function renderResults() {
  const list = $('results');
  list.replaceChildren();
  if (!entries.length) return;

  const query = $('query').value;
  if (!normalize(query)) {
    $('note').textContent = '제목에 들어간 단어로 찾아요. 엔터를 누르면 첫 번째 결과로 가요.';
    return;
  }

  const found = search(query);
  $('note').textContent = !found.length ? '앗, 그런 제목은 없어요...'
    : found.length > MAX_RESULTS ? `${found.length}개 중 ${MAX_RESULTS}개만 보여요` : '';

  for (const entry of found.slice(0, MAX_RESULTS)) {
    const button = document.createElement('button');
    button.className = 'result';
    button.title = entry.title;

    const ep = document.createElement('span');
    ep.className = 'ep';
    ep.textContent = entry.ep?.label ?? `#${entry.index + 1}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.ep?.name ?? entry.title;

    button.append(ep, name);
    if (entry.id === tabInfo.v) {
      const now = document.createElement('span');
      now.className = 'now';
      now.textContent = '◀ 지금';
      button.append(now);
    }
    button.addEventListener('click', () => openEntry(entry));

    const li = document.createElement('li');
    li.append(button);
    list.append(li);
  }
}

async function openEntry(entry) {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', entry.id);
  url.searchParams.set('list', listId);
  url.searchParams.set('index', String(entry.index + 1));

  if (tabInfo.youtube) await chrome.tabs.update(tabInfo.tab.id, { url: url.href });
  else await chrome.tabs.create({ url: url.href });
  window.close();
}

$('query').addEventListener('input', renderResults);
$('query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('results').querySelector('.result')?.click();
});
$('refresh').addEventListener('click', () => { if (listId) refresh(true); });

// ── 시작 ───────────────────────────────────────

(async () => {
  const [settings, info] = await Promise.all([chrome.storage.sync.get(DEFAULTS), inspectTab()]);

  enabled = settings.enabled;
  renderEnabled();
  $('skipAt').value = settings.skipAt;
  $('playlists').value = splitIds(settings.playlists).join('\n');

  tabInfo = info;
  renderState();

  // 지금 보고 있는 재생목록이 먼저, 없으면 설정에 적어 둔 첫 재생목록.
  listId = info.list || splitIds(settings.playlists)[0] || null;
  if (!listId) {
    $('source').textContent = '♪ 재생목록 없음';
    $('note').textContent = '재생목록 영상에서 열거나, 설정에 재생목록을 적어 주세요.';
    return;
  }
  refresh(false);
})();

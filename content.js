// 재생 시간이 기준(기본 60초)을 넘으면 영상 끝으로 이동한다.
// 영상이 끝나면 유튜브 재생목록이 알아서 다음 화를 틀어 준다.

const DEFAULTS = {
  enabled: true,
  skipAt: 60,
  playlists: 'PLsmaUhkCwW3q5q46uc9So2b4D-pZqVZOV',
};

// 이보다 긴 영상(재생목록 맨 앞의 1시간짜리 노래 등)은 건드리지 않는다.
const MAX_DURATION = 180;

let settings = { ...DEFAULTS };

chrome.storage.sync.get(DEFAULTS, (s) => { settings = s; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
});

// timeupdate 는 버블링되지 않지만 캡처 단계에서는 document 까지 잡힌다.
// 유튜브가 <video> 를 갈아끼워도 다시 붙일 필요가 없다.
document.addEventListener('timeupdate', (e) => {
  const video = e.target;
  if (!settings.enabled || !(video instanceof HTMLVideoElement)) return;
  if (location.pathname !== '/watch') return;

  const player = video.closest('#movie_player');
  if (!player || player.classList.contains('ad-showing')) return;

  const playlists = settings.playlists.split(/[\s,]+/).filter(Boolean);
  const listId = new URLSearchParams(location.search).get('list');
  if (playlists.length && !playlists.includes(listId)) return;

  const skipAt = Number(settings.skipAt);
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration > MAX_DURATION || duration <= skipAt + 3) return;

  // 끝 1초 전까지만 반응한다. 끝으로 옮긴 뒤 다시 걸리지 않고,
  // 다음 화로 넘어가는 순간 이전 영상의 마지막 이벤트도 무시된다.
  if (video.currentTime < skipAt || video.currentTime >= duration - 1) return;

  video.currentTime = duration;
}, true);

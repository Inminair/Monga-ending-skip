// 팝업의 "찾기"가 쓸 재생목록 전체 목록을 받아 온다.
// youtube.com 안에서 요청해야 유튜브가 자기 페이지의 요청처럼 받아 준다.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'ping') { // 팝업이 이 탭에서 확장 프로그램이 동작 중인지 확인한다
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'playlist') {
    fetchPlaylist(msg.list).then(
      (playlist) => sendResponse({ ok: true, ...playlist }),
      (err) => sendResponse({ ok: false, error: String(err) }),
    );
    return true; // 비동기로 응답한다
  }
});

// 재생목록 페이지에 처음 100개가 들어 있고, 나머지는 100개씩 이어받는다.
async function fetchPlaylist(listId) {
  const html = await (await fetch(`/playlist?list=${encodeURIComponent(listId)}`)).text();
  const initial = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!initial) throw new Error('재생목록 데이터를 찾지 못함');

  const data = JSON.parse(initial[1]);
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1];
  const items = [];

  let token = collectItems(data.contents, items);
  for (let page = 0; token && page < 50; page++) {
    const res = await fetch('/youtubei/v1/browse?prettyPrint=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion } }, continuation: token }),
    });
    token = collectItems((await res.json()).onResponseReceivedActions, items);
  }

  return { title: data.metadata?.playlistMetadataRenderer?.title ?? '', items };
}

// 영상 항목을 items 에 모으고, 다음 묶음을 받을 토큰을 돌려준다.
// 유튜브가 새 형식(lockupViewModel)과 옛 형식(playlistVideoRenderer)을 섞어 쓰므로 둘 다 읽는다.
function collectItems(node, items) {
  let token = null;
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }

    const lockup = o.lockupViewModel;
    if (lockup) {
      if (lockup.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const watch = lockup.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint;
        items.push({
          id: lockup.contentId,
          title: lockup.metadata?.lockupMetadataViewModel?.title?.content ?? '',
          index: watch?.index ?? items.length,
        });
      }
      return;
    }

    const video = o.playlistVideoRenderer;
    if (video) {
      const shown = Number(video.index?.simpleText); // 1부터 센다
      items.push({
        id: video.videoId,
        title: video.title?.runs?.[0]?.text ?? '',
        index: Number.isFinite(shown) ? shown - 1 : items.length,
      });
      return;
    }

    const more = o.continuationItemViewModel ?? o.continuationItemRenderer;
    if (more) { token ??= findToken(more); return; }

    Object.values(o).forEach(walk);
  })(node);
  return token;
}

function findToken(o) {
  if (!o || typeof o !== 'object') return null;
  if (typeof o.continuationCommand?.token === 'string') return o.continuationCommand.token;
  for (const v of Object.values(o)) {
    const token = findToken(v);
    if (token) return token;
  }
  return null;
}

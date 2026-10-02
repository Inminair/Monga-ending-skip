// 문서 이미지 전용. 확장 프로그램 밖에서 팝업을 띄우려고 가짜 chrome API 를 만들고,
// ?scene= 에 맞춰 탭·검색어를 채운 뒤 설명 번호(①②③)를 붙인다.

(() => {
  const LIST = 'PLdemo';
  const NAMES = [
    '푸딩 대소동', '비 오는 날', '도시락 소풍', '한밤의 라면', '눈사람 만들기', '수상한 상자',
    '별똥별 소원', '낮잠 시간', '비눗방울', '젤리 사이다', '고양이 카페', '네잎클로버',
    '딸기 젤리', '빨래 널기', '젤리 케이크', '모래성', '풍선 배달', '숨바꼭질',
    '단풍 구경', '군고구마', '털실 뭉치', '꿀 찾기', '종이비행기', '첫눈',
  ];
  const ITEMS = NAMES.map((name, i) => ({ id: `ep${i + 1}`, title: `[짧은 애니] ${i + 1}화_${name}`, index: i }));
  const watch = (v) => `https://www.youtube.com/watch?v=${v}&list=${LIST}`;

  // playlists: 설정에 저장돼 있는 재생목록 / url: 팝업을 연 탭 / alive: 그 탭에 콘텐츠 스크립트가 있는지
  // only: 'state' 면 상태 상자만 보여 준다
  const SCENES = {
    settings: {
      playlists: '', url: watch('ep3'), alive: true,
      badges: [['#state', 1, 'right'], ['#no', 2, 'after'], ['.unit', 3, 'after']],
    },
    search: {
      playlists: LIST, url: watch('ep15'), alive: true, tab: 'search', query: '젤리',
      badges: [['#query', 1, 'right'], ['.result', 2, 'left'], ['.now', 3, 'before'], ['#refresh', 4, 'before']],
    },
    'state-active': { playlists: LIST, url: watch('ep3'), alive: true, only: 'state' },
    'state-not-added': { playlists: '', url: watch('ep3'), alive: true, only: 'state' },
    'state-stale': { playlists: LIST, url: watch('ep3'), alive: false, only: 'state' },
  };

  const scene = SCENES[new URLSearchParams(location.search).get('scene') ?? 'settings'];

  const area = (initial) => {
    const data = { ...initial };
    return {
      async get(keys) { return typeof keys === 'string' ? { [keys]: data[keys] } : { ...keys, ...data }; },
      async set(values) { Object.assign(data, values); },
    };
  };

  window.chrome = {
    storage: { sync: area({ playlists: scene.playlists }), local: area({}) },
    tabs: {
      async query() { return [{ id: 1, url: scene.url }]; },
      async sendMessage(_id, msg) {
        if (!scene.alive) throw new Error('Receiving end does not exist.');
        if (msg.type === 'ping') return { ok: true };
        return { ok: true, title: '내가 모은 짧은 애니', items: ITEMS };
      },
      async update() {},
      async create() {},
      async reload() {},
    },
  };

  const style = document.createElement('style');
  style.textContent = `
    .demo-badge {
      position: absolute; z-index: 10; width: 18px; height: 18px;
      display: flex; align-items: center; justify-content: center;
      background: var(--pink-deep); color: #fff; border: 2px solid var(--ink);
      font: 700 12px/1 Galmuri11, sans-serif; box-shadow: 2px 2px 0 var(--ink);
    }
    *:focus { outline: none !important; }

    body.demo-only-state { padding: 0; background: none; }
    .demo-only-state :is(.deco, .titlebar, .tabs, .field, .statusbar) { display: none; }
    .demo-only-state .window { border: 0; box-shadow: none; background: none; }
    .demo-only-state .body { padding: 0 4px 4px 0; }
    .demo-only-state .state { margin: 0; }
    .demo-only-state .led { animation: none; }
  `;
  document.head.append(style);

  window.addEventListener('load', async () => {
    await document.fonts.ready;
    await new Promise((r) => setTimeout(r, 200)); // popup.js 의 초기화가 끝나길 기다린다

    if (scene.only === 'state') document.body.classList.add('demo-only-state');
    document.getElementById(`tab-${scene.tab ?? 'settings'}`).click();
    if (scene.query) {
      const input = document.getElementById('query');
      input.value = scene.query;
      input.dispatchEvent(new Event('input'));
    }
    document.activeElement?.blur();

    for (const [selector, n, side] of scene.badges ?? []) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      const badge = document.createElement('span');
      badge.className = 'demo-badge';
      badge.textContent = n;
      // right/left: 위쪽 모서리에 걸치기, after/before: 옆에 세로 가운데로
      const [x, y] = {
        right: [rect.right - 8, rect.top - 10],
        left: [rect.left - 12, rect.top - 10],
        after: [rect.right + 6, rect.top + rect.height / 2 - 10],
        before: [rect.left - 26, rect.top + rect.height / 2 - 10],
      }[side];
      badge.style.left = `${x}px`;
      badge.style.top = `${y}px`;
      document.body.append(badge);
    }

    // 이 팝업을 iframe 으로 띄운 설명 페이지가 높이를 맞출 수 있게 알려 준다.
    // (scrollHeight 는 내용이 iframe 보다 짧으면 iframe 높이를 돌려주므로 본문 높이를 잰다)
    parent.postMessage({ demoHeight: document.body.offsetHeight }, '*');
  });
})();

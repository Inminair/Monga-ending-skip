// 팝업(demo.js)이 알려 준 높이에 맞춰, 그 메시지를 보낸 iframe 의 크기를 정한다.
window.addEventListener('message', (e) => {
  if (typeof e.data?.demoHeight !== 'number') return;
  for (const frame of document.querySelectorAll('iframe')) {
    if (frame.contentWindow === e.source) frame.style.height = `${e.data.demoHeight}px`;
  }
});

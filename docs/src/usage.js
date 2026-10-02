// 팝업(demo.js)이 알려 준 높이에 맞춰 iframe 크기를 정한다.
window.addEventListener('message', (e) => {
  if (typeof e.data?.demoHeight === 'number') {
    document.querySelector('iframe').style.height = `${e.data.demoHeight}px`;
  }
});

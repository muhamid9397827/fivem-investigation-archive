(() => {
  const css = (window.__STYLE_SOURCE_PARTS || []).join('');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const source = (window.__APP_SOURCE_PARTS || []).join('');
  const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const script = document.createElement('script');
  script.src = blobUrl;
  script.onload = () => URL.revokeObjectURL(blobUrl);
  document.body.appendChild(script);
})();

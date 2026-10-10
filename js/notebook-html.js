(function () {
  'use strict';
  const frames = [...document.querySelectorAll('.notebook-html-frame')];
  const mounted = new WeakMap();
  function theme(frame) {
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    const light = document.documentElement.dataset.theme === 'light';
    let style = doc.getElementById('blog-embed-theme');
    if (!style) { style = doc.createElement('style'); style.id = 'blog-embed-theme'; doc.head.appendChild(style); }
    style.textContent = `:root { color-scheme:${light ? 'light' : 'dark'} !important; --surface-1:${light ? '#fff' : '#000'}; --surface-2:${light ? '#f3f3f3' : '#101010'}; --text-primary:${light ? '#151515' : '#e6e6e6'}; --text-secondary:${light ? '#505050' : '#b0b0b0'}; --text-muted:${light ? '#6a6a6a' : '#999'}; --border:${light ? '#ddd' : '#303030'}; --border-strong:${light ? '#c0c0c0' : '#505050'}; --border-stronger:${light ? '#888' : '#999'}; }
      html, body { min-height:0 !important; height:auto !important; background:var(--surface-1) !important; color:var(--text-primary); }
      html { margin:0 !important; padding:0 !important; overflow:hidden !important; scrollbar-width:none !important; }
      body { box-sizing:border-box; max-width:100%; margin:0; padding:12px 0 !important; overflow:visible !important; }
      html::-webkit-scrollbar, body::-webkit-scrollbar { display:none !important; }
      button:focus-visible { outline:2px solid var(--text-primary); outline-offset:3px; }
      svg#g text { font-size:var(--blog-label-size,14px) !important; }`;
  }
  function mount(frame) {
    const doc = frame.contentDocument;
    if (!doc?.body || doc.URL === 'about:blank') return;
    const previous = mounted.get(frame);
    if (previous?.doc === doc) { previous.schedule(); return; }
    if (previous) previous.cleanup();
    theme(frame);
    let pending = 0;
    function schedule() {
      if (!pending && frame.isConnected) pending = window.requestAnimationFrame(size);
    }
    function size() {
      pending = 0;
      if (!frame.isConnected || !frame.clientWidth) return;
      const graph = doc.querySelector('svg#g[viewBox]');
      if (graph?.viewBox.baseVal.width && graph.clientWidth) {
        const scale = graph.clientWidth / graph.viewBox.baseVal.width;
        const labelSize = Math.max(14, 11 / scale) + 'px';
        if (graph.style.getPropertyValue('--blog-label-size') !== labelSize) graph.style.setProperty('--blog-label-size', labelSize);
      }
      // Measure content instead of the document's scrollHeight, whose minimum
      // is the iframe's current height and would prevent a long demo shrinking.
      let height = Math.ceil(Math.max(doc.body.getBoundingClientRect().height, doc.body.scrollHeight)) + 2;
      // Absolutely positioned elements may belong to the initial containing
      // block rather than the body. Include them without counting fixed UI.
      for (const element of doc.body.querySelectorAll('*')) {
        const style = doc.defaultView.getComputedStyle(element);
        if (style.position !== 'absolute' || !element.getClientRects().length) continue;
        let ancestor = element.parentElement, fixed = false;
        while (ancestor && ancestor !== doc.body) {
          if (doc.defaultView.getComputedStyle(ancestor).position === 'fixed') { fixed = true; break; }
          ancestor = ancestor.parentElement;
        }
        if (!fixed) height = Math.max(height, Math.ceil(element.getBoundingClientRect().bottom + (parseFloat(style.marginBottom) || 0)));
      }
      const target = height + 'px';
      if (height > 0 && frame.style.height !== target) frame.style.height = target;
      frame.dataset.embedReady = 'true';
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(doc.body);
    const changes = new MutationObserver(schedule);
    changes.observe(doc.body, {childList:true, subtree:true, characterData:true, attributes:true});
    doc.addEventListener('load', schedule, true);
    doc.addEventListener('toggle', schedule, true);
    frame.contentWindow.addEventListener('resize', schedule);
    if (doc.fonts) doc.fonts.ready.then(schedule);
    mounted.set(frame, {doc, schedule, cleanup() {
      resize.disconnect(); changes.disconnect(); window.cancelAnimationFrame(pending);
      doc.removeEventListener('load', schedule, true);
      doc.removeEventListener('toggle', schedule, true);
      doc.defaultView?.removeEventListener('resize', schedule);
    }});
    schedule();
  }
  frames.forEach(frame => {
    frame.setAttribute('scrolling','no');
    frame.addEventListener('load', () => mount(frame));
    mount(frame);
  });
  document.addEventListener('toggle', () => frames.forEach(frame => mounted.get(frame)?.schedule()), true);
  new MutationObserver(() => frames.forEach(frame => {
    theme(frame); mounted.get(frame)?.schedule();
  })).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
})();

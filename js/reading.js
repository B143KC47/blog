(function () {
  'use strict';
  const prose = document.querySelector('.post .prose');
  if (!prose) return;
  let frame = 0;
  const hints = new WeakMap();

  function refresh() {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(function () {
      prose.querySelectorAll('.table-scroll, .literal-block > code, .highlight pre, mjx-container, .mermaid-scroll').forEach(function (node) {
        if (!node.clientWidth || !node.clientHeight) return;
        const overflow = node.scrollWidth > node.clientWidth + 4;
        node.dataset.readerOverflow = String(overflow);
        const math = node.tagName.toLowerCase() === 'mjx-container';
        const diagram = node.classList.contains('mermaid-scroll');
        const table = node.classList.contains('table-scroll');
        const label = math ? '数学公式' : diagram ? '图表' : table ? '表格' : '原文排版';
        if (overflow) {
          node.tabIndex = 0;
          node.dataset.readerFocus = 'true';
          node.setAttribute('role', 'region');
          node.setAttribute('aria-label', label + '，可横向滚动');
        } else if (node.dataset.readerFocus === 'true') {
          node.removeAttribute('tabindex');
          node.removeAttribute('role');
          node.removeAttribute('aria-label');
          delete node.dataset.readerFocus;
        }
        if (!math && !node.closest('.highlight')) {
          let hint = hints.get(node);
          if (!hint && overflow) {
            hint = document.createElement('div');
            hint.className = 'reader-scroll-hint';
            hint.textContent = '左右滑动查看完整' + label;
            const anchor = node.closest('.literal-block') || node;
            anchor.after(hint);
            hints.set(node, hint);
          }
          if (hint) hint.hidden = !overflow;
        }
      });
    });
  }

  function enhanceDiagram(host) {
    const svg = host.querySelector('svg');
    if (!svg || host.querySelector('.diagram-toolbar')) return;
    const natural = Math.ceil(svg.viewBox.baseVal.width || svg.getBoundingClientRect().width);
    const viewport = document.createElement('div');
    viewport.className = 'mermaid-scroll';
    host.appendChild(viewport);
    viewport.appendChild(svg);
    svg.style.maxWidth = 'none';
    svg.style.width = natural + 'px';
    svg.style.height = 'auto';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '文章图表');
    const toolbar = document.createElement('div');
    toolbar.className = 'diagram-toolbar';
    const fit = document.createElement('button');
    fit.type = 'button';
    fit.textContent = '原始大小';
    fit.setAttribute('aria-pressed', 'true');
    let expanded = false;
    function size() {
      const style = getComputedStyle(viewport);
      const available = viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      svg.style.width = (!expanded && fit.getAttribute('aria-pressed') === 'true' ? Math.min(natural, available) : natural) + 'px';
      refresh();
    }
    fit.addEventListener('click', function () {
      const active = fit.getAttribute('aria-pressed') !== 'true';
      fit.setAttribute('aria-pressed', String(active));
      fit.textContent = active ? '原始大小' : '适应宽度';
      size();
    });
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.textContent = '放大查看';
    expand.addEventListener('click', function () {
      expanded = true;
      const dialog = document.createElement('dialog');
      dialog.className = 'diagram-dialog prose';
      dialog.setAttribute('aria-label', '放大查看文章图表');
      const bar = document.createElement('div');
      bar.className = 'diagram-toolbar';
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = '关闭';
      close.addEventListener('click', function () { dialog.close(); });
      bar.appendChild(close);
      const body = document.createElement('div');
      body.className = 'mermaid';
      const placeholder = document.createElement('div');
      placeholder.style.height = viewport.getBoundingClientRect().height + 'px';
      viewport.before(placeholder);
      body.appendChild(viewport);
      dialog.append(bar, body);
      document.body.appendChild(dialog);
      svg.style.width = natural + 'px';
      dialog.addEventListener('close', function () {
        expanded = false;
        placeholder.replaceWith(viewport);
        dialog.remove();
        size();
        expand.focus({preventScroll: true});
      }, {once: true});
      dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.close(); });
      dialog.showModal();
      viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      if (viewport.scrollWidth > viewport.clientWidth + 4) {
        viewport.tabIndex = 0;
        viewport.setAttribute('aria-label', '图表，可横向滚动');
      }
    });
    toolbar.append(fit, expand);
    host.prepend(toolbar);
    if (window.ResizeObserver) new ResizeObserver(size).observe(viewport);
    size();
  }

  window.ReadingUI = {refresh, enhanceDiagram};
  new MutationObserver(refresh).observe(prose, {childList: true, subtree: true});
  if (window.ResizeObserver) new ResizeObserver(refresh).observe(prose);
  window.addEventListener('resize', refresh);
  document.addEventListener('toggle', refresh, true);
  document.fonts.ready.then(refresh);
  const mathScript = document.getElementById('mathjax-cdn-script');
  function mathReady() {
    if (window.MathJax && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(refresh);
  }
  if (mathScript) mathScript.addEventListener('load', mathReady);
  mathReady();
  refresh();
})();

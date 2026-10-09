(function () {
  'use strict';
  const layout = document.querySelector('.post-reading-layout.has-outline');
  if (!layout) return;
  const rail = layout.querySelector('.article-outline');
  const panel = rail.querySelector('.outline-panel');
  const bar = layout.querySelector('.outline-mobile-bar');
  const toggle = bar.querySelector('.outline-toggle');
  const close = panel.querySelector('.outline-close');
  const nav = panel.querySelector('nav');
  const links = Array.from(nav.querySelectorAll('a'));
  const sections = links.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1))));
  const mobile = window.matchMedia('(max-width: 56.25rem)');
  const dialog = document.createElement('dialog');
  // Older browsers retain the server-rendered section list.
  if (typeof dialog.showModal !== 'function') return;
  dialog.id = 'article-outline-dialog';
  dialog.className = 'article-outline outline-dialog';
  dialog.setAttribute('aria-label', nav.getAttribute('aria-label'));
  document.body.appendChild(dialog);
  layout.classList.add('outline-ready');

  function dismiss(restoreFocus) {
    if (dialog.open) dialog.close();
    document.body.classList.remove('outline-open');
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus && mobile.matches) toggle.focus({preventScroll: true});
  }
  function adapt() {
    const hadFocus = panel.contains(document.activeElement) || document.activeElement === toggle;
    dismiss(false);
    bar.hidden = !mobile.matches;
    close.hidden = !mobile.matches;
    if (mobile.matches) {
      dialog.appendChild(panel);
    } else {
      rail.appendChild(panel);
    }
    if (hadFocus) {
      const target = mobile.matches ? toggle : nav.querySelector('[aria-current="location"]') || links[0];
      target.focus({preventScroll: true});
      // WebKit finishes dialog focus restoration after the panel is reparented.
      requestAnimationFrame(function () { if (!dialog.open && target.getClientRects().length) target.focus({preventScroll: true}); });
    }
  }
  toggle.addEventListener('click', function () {
    if (dialog.open) { dismiss(true); return; }
    dialog.showModal();
    document.body.classList.add('outline-open');
    toggle.setAttribute('aria-expanded', 'true');
    const active = nav.querySelector('[aria-current="location"]');
    if (active) nav.scrollTop += active.getBoundingClientRect().top - nav.getBoundingClientRect().top - nav.clientHeight / 3;
    close.focus({preventScroll: true});
  });
  close.addEventListener('click', function () { dismiss(true); });
  dialog.addEventListener('cancel', function (event) { event.preventDefault(); dismiss(true); });
  dialog.addEventListener('close', function () {
    document.body.classList.remove('outline-open');
    toggle.setAttribute('aria-expanded', 'false');
  });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dismiss(true);
  });
  nav.addEventListener('click', function (event) {
    const link = event.target.closest('a');
    if (!link || !nav.contains(link)) return;
    const section = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!section) return;
    if (dialog.open) dismiss(false);
    section.tabIndex = -1;
    section.focus({preventScroll: true});
    section.addEventListener('blur', function () { section.removeAttribute('tabindex'); }, {once: true});
    // Let the anchor update browser history and use the heading's scroll margin.
  });
  mobile.addEventListener('change', adapt);
  adapt();

  let scheduled = 0;
  let current = -1;
  function update() {
    scheduled = 0;
    const threshold = mobile.matches ? 96 : 48;
    let next = 0;
    sections.forEach(function (section, index) {
      if (section && section.getBoundingClientRect().top <= threshold) next = index;
    });
    if (current === next) return;
    links.forEach(function (link, index) {
      if (index === next) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    current = next;
    if (!mobile.matches) {
      const active = links[next].getBoundingClientRect();
      const visible = nav.getBoundingClientRect();
      if (active.top < visible.top) nav.scrollTop -= visible.top - active.top;
      else if (active.bottom > visible.bottom) nav.scrollTop += active.bottom - visible.bottom;
    }
  }
  function queue() { if (!scheduled) scheduled = requestAnimationFrame(update); }
  window.addEventListener('scroll', queue, {passive: true});
  window.addEventListener('resize', queue);
  window.addEventListener('load', queue);
  if (window.ResizeObserver) new ResizeObserver(queue).observe(layout.querySelector('.prose'));
  update();
})();

(function () {
  'use strict';

  const adapters = new Map();
  let registeredSceneImpl = null;
  let activeController = null;

  window.registerScene = function (impl) {
    registeredSceneImpl = impl;
  };

  function registerAdapter(type, factory) {
    if (typeof type === 'string' && typeof factory === 'function') {
      adapters.set(type.toLowerCase(), factory);
    }
  }

  window.BlackCatStage = {
    registerAdapter: registerAdapter,
    getAdapters: function () { return Array.from(adapters.keys()); },
    getInstance: function () { return activeController; }
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const isLightTheme = () => document.documentElement.dataset.theme === 'light';
  const isZhLang = () => {
    const stagedArticle = document.querySelector('.post--staged[data-stage-lang]');
    const lang = (stagedArticle && stagedArticle.dataset.stageLang) || document.documentElement.lang || '';
    return String(lang).toLowerCase().startsWith('zh');
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function makeEl(tag, className, html) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (html != null) el.innerHTML = html;
    return el;
  }

  /* ==========================================================================
   * 1. CANVAS ADAPTER — SVG Pan/Zoom, Spotlight Lifted Card, Hotspots, Reveals
   * ========================================================================== */
  registerAdapter('canvas', function createCanvasAdapter(paneEl, paneCfg, api) {
    const zh = isZhLang();
    const labels = zh
      ? {overview: '整幅画布', resume: '回到阅读', read: t => '阅读：' + t}
      : {overview: 'Whole canvas', resume: 'Resume reading', read: t => 'Read: ' + t};

    let shell = paneEl.querySelector('.stage-canvas-shell');
    if (!shell) {
      const contentId = paneCfg.contentId || ('stage-canvas-content-' + paneCfg.id);
      shell = makeEl('div', 'stage-canvas-shell');
      shell.dataset.invertDark = paneCfg.invertInDark === false ? 'false' : 'true';
      shell.dataset.contentId = contentId;
      shell.innerHTML =
        '<div class="stage-canvas-tools">' +
          '<button type="button" class="stage-btn stage-canvas-overview"><span class="stage-canvas-overview-label">' + esc(labels.overview) + '</span><span aria-hidden="true">↖</span></button>' +
          '<div class="stage-zoom-group"><button type="button" class="stage-zoom-out" aria-label="Zoom out">−</button><button type="button" class="stage-zoom-in" aria-label="Zoom in">+</button></div>' +
        '</div>' +
        '<div class="stage-canvas-viewport" tabindex="0"><div class="stage-canvas-world">' +
          '<div class="stage-canvas-artwork" role="img"></div>' +
          '<div class="stage-canvas-lifted" hidden><svg class="stage-canvas-lifted-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"><use href="#' + esc(contentId) + '"/></svg></div>' +
          '<div class="stage-canvas-hotspots" role="group"></div>' +
          '<div class="stage-canvas-outline" hidden></div>' +
        '</div></div>';
      paneEl.appendChild(shell);
    }

    const viewport = shell.querySelector('.stage-canvas-viewport');
    const world = shell.querySelector('.stage-canvas-world');
    const artwork = shell.querySelector('.stage-canvas-artwork');
    const lifted = shell.querySelector('.stage-canvas-lifted');
    const liftedSvg = shell.querySelector('.stage-canvas-lifted-svg');
    const hotspotsEl = shell.querySelector('.stage-canvas-hotspots');
    const outlineEl = shell.querySelector('.stage-canvas-outline');
    const overviewBtn = shell.querySelector('.stage-canvas-overview');
    const overviewLabel = shell.querySelector('.stage-canvas-overview-label');
    const zoomInBtn = shell.querySelector('.stage-zoom-in');
    const zoomOutBtn = shell.querySelector('.stage-zoom-out');

    let svg = artwork.querySelector('svg');
    let vb = {x: 0, y: 0, width: 2048, height: 1400};
    let W = 2048, H = 1400;
    let allBounds = [0, 0, W, H];
    let boxes = new Map();
    let reveals = [];
    let cam = {x: 0, y: 0, s: 1};
    let anim = 0;
    let overview = false;
    let detached = false;
    let currentEntry = null;
    let currentCue = null;
    let previewId = null;
    let hoveredId = null;
    let hoverTimer = 0;
    let suppressHoverUntil = 0;
    let ready = false;

    function place(el, box) {
      el.style.left = box[0] + 'px';
      el.style.top = box[1] + 'px';
      el.style.width = box[2] + 'px';
      el.style.height = box[3] + 'px';
    }

    function paint() {
      world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.s})`;
      const inv = (1 / Math.max(0.02, cam.s)).toFixed(4);
      hotspotsEl.style.setProperty('--inv', inv);
      outlineEl.style.setProperty('--inv', inv);
    }

    function fitBounds(box, vw, vh, pad, maxS) {
      const bw = Math.max(1, box[2]);
      const bh = Math.max(1, box[3]);
      const s = Math.max(0.02, Math.min((vw - 2 * pad) / bw, (vh - 2 * pad) / bh, maxS));
      return {x: vw / 2 - (box[0] + bw / 2) * s, y: vh / 2 - (box[1] + bh / 2) * s, s};
    }

    function constrain(next) {
      const vw = viewport.clientWidth || 600;
      const vh = viewport.clientHeight || 500;
      const m = Math.min(80, vw / 4, vh / 4);
      return {
        x: clamp(next.x, m - W * next.s, vw - m),
        y: clamp(next.y, m - H * next.s, vh - m),
        s: next.s
      };
    }

    function setCam(next, animate) {
      cancelAnimationFrame(anim);
      const end = constrain(next);
      if (!animate || reducedMotion.matches) {
        cam = end;
        paint();
        return;
      }
      const start = {...cam};
      const t0 = performance.now();
      const dur = 360;
      suppressHoverUntil = t0 + dur + 80;
      const tick = now => {
        const t = Math.min(1, (now - t0) / dur);
        const k = 1 - Math.pow(1 - t, 4);
        cam = {
          x: start.x + (end.x - start.x) * k,
          y: start.y + (end.y - start.y) * k,
          s: start.s + (end.s - start.s) * k
        };
        paint();
        if (t < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    }

    function regionBounds(regionId) {
      if (!svg || !regionId) return null;
      const el = svg.querySelector('#' + CSS.escape('r-' + regionId)) || svg.querySelector('#' + CSS.escape(regionId));
      if (!el || typeof el.getBBox !== 'function') return null;
      let b;
      try { b = el.getBBox(); } catch (_) { return null; }
      if (!b || (!b.width && !b.height)) return null;
      const rootCtm = svg.getScreenCTM();
      const elCtm = el.getScreenCTM();
      if (!rootCtm || !elCtm) return [b.x - vb.x, b.y - vb.y, b.width, b.height];
      const m = rootCtm.inverse().multiply(elCtm);
      const pts = [
        [b.x, b.y],
        [b.x + b.width, b.y],
        [b.x, b.y + b.height],
        [b.x + b.width, b.y + b.height]
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      return [x0 - vb.x, y0 - vb.y, Math.max(...xs) - x0, Math.max(...ys) - y0];
    }

    function resolveAllBoxes() {
      if (!svg) return;
      boxes.clear();
      const entries = api.getEntries();
      for (const e of entries) {
        const cue = e.cue || {};
        const pad = cue.pad != null ? cue.pad : (e.kind === 'detail' ? 12 : 18);
        let box = null;
        let source = '';
        if (Array.isArray(cue.bounds) && cue.bounds.length === 4) {
          box = cue.bounds.slice();
          source = 'explicit';
        } else if (cue.overview) {
          box = allBounds.slice();
          source = 'canvas';
        } else {
          const r = regionBounds(cue.region || e.id);
          if (r) {
            box = [r[0] - pad, r[1] - pad, r[2] + 2 * pad, r[3] + 2 * pad];
            source = 'svg';
          }
        }
        if (!box && e.parent && boxes.has(e.parent)) {
          box = boxes.get(e.parent).box.slice();
          source = 'parent';
        }
        if (!box) {
          box = allBounds.slice();
          source = 'canvas';
        }
        boxes.set(e.id, {box, source});
      }
    }

    function buildHotspots() {
      hotspotsEl.innerHTML = '';
      for (const e of api.getEntries()) {
        const info = boxes.get(e.id);
        if (!info || info.source === 'canvas') continue;
        const btn = makeEl('button', 'stage-hotspot');
        btn.type = 'button';
        btn.tabIndex = -1;
        btn.dataset.entry = e.id;
        btn.setAttribute('aria-label', labels.read(e.title));
        place(btn, info.box);
        btn.addEventListener('click', () => {
          if (moved) return;
          clearHover();
          api.jumpTo(e.id);
        });
        hotspotsEl.appendChild(btn);
      }
    }

    function applyReveal(order, showAll) {
      for (const r of reveals) {
        r.el.style.opacity = (showAll || order >= r.order) ? '' : '0';
      }
    }

    function activeBox() {
      if (overview) return allBounds;
      if (currentCue && Array.isArray(currentCue.bounds) && currentCue.bounds.length === 4) {
        return currentCue.bounds;
      }
      if (currentCue && currentCue.region) {
        const direct = regionBounds(currentCue.region);
        if (direct) {
          const pad = currentCue.pad != null ? currentCue.pad : 18;
          return [direct[0] - pad, direct[1] - pad, direct[2] + 2 * pad, direct[3] + 2 * pad];
        }
      }
      if (currentEntry && boxes.has(currentEntry.id)) return boxes.get(currentEntry.id).box;
      return allBounds;
    }

    function isWholeCanvasBox(box) {
      return Math.abs(box[0] - allBounds[0]) < 2 &&
             Math.abs(box[1] - allBounds[1]) < 2 &&
             Math.abs(box[2] - allBounds[2]) < 2 &&
             Math.abs(box[3] - allBounds[3]) < 2;
    }

    function fit(animate = true) {
      if (!ready || !viewport.clientWidth || !viewport.clientHeight) return;
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const topBar = 46;
      const box = activeBox();
      const maxS = overview ? 4 : (currentCue?.maxScale ?? (currentEntry?.kind === 'detail' ? 3.5 : 3));
      const f = fitBounds(box, vw, Math.max(120, vh - topBar), vw < 500 ? 14 : 28, maxS);
      f.y += topBar * 0.5;
      setCam(f, animate);
    }

    function renderOutline() {
      const targetId = previewId || (currentEntry?.kind === 'detail' ? currentEntry.id : null);
      let box = null;
      if (targetId) {
        box = boxes.get(targetId)?.box || regionBounds(targetId);
      }
      const show = Boolean(box && !isWholeCanvasBox(box) && (!overview || previewId));
      outlineEl.hidden = !show;
      outlineEl.classList.toggle('is-preview', Boolean(previewId));
      if (show) place(outlineEl, box);
    }

    function renderState() {
      if (!ready) return;
      const box = activeBox();
      const whole = overview || Boolean(currentCue?.overview) || isWholeCanvasBox(box);
      world.classList.toggle('is-focused', !whole);
      lifted.hidden = whole;
      if (!whole) {
        place(lifted, box);
        liftedSvg.setAttribute('viewBox', `${box[0] + vb.x} ${box[1] + vb.y} ${box[2]} ${box[3]}`);
      }
      applyReveal(currentEntry ? currentEntry.order : 0, overview);
      overviewLabel.textContent = (detached || overview) ? labels.resume : labels.overview;
      const parentId = currentEntry?.parent || currentEntry?.id;
      const avail = new Set(api.getEntries().filter(e => e.parent === parentId).map(e => e.id));
      for (const h of hotspotsEl.children) {
        h.classList.toggle('is-available', avail.has(h.dataset.entry));
      }
      renderOutline();
    }

    function detach() {
      detached = true;
      suppressHoverUntil = performance.now() + 180;
      overviewLabel.textContent = labels.resume;
      if (previewId) { previewId = null; renderOutline(); }
    }

    function clearHover() {
      clearTimeout(hoverTimer);
      if (hoveredId) {
        hotspotsEl.querySelector(`[data-entry="${CSS.escape(hoveredId)}"]`)?.classList.remove('is-hover');
        hoveredId = null;
      }
      if (previewId) {
        previewId = null;
        renderOutline();
      }
    }

    function minScale() {
      return Math.min(0.1, fitBounds(allBounds, viewport.clientWidth || 600, viewport.clientHeight || 500, 12, 4).s);
    }

    function zoomBy(factor, point, animate) {
      if (!ready) return;
      const pt = point || {x: viewport.clientWidth / 2, y: viewport.clientHeight / 2};
      const nextS = clamp(cam.s * factor, minScale(), 10);
      const r = nextS / cam.s;
      detach();
      setCam({x: pt.x - (pt.x - cam.x) * r, y: pt.y - (pt.y - cam.y) * r, s: nextS}, animate);
    }

    // Pointer pan & pinch
    const pointers = new Map();
    let moved = false, gesture = null;
    function localPt(ev) {
      const r = viewport.getBoundingClientRect();
      return {x: ev.clientX - r.left, y: ev.clientY - r.top};
    }
    function resetGesture() {
      const pts = Array.from(pointers.values());
      if (!pts.length) { gesture = null; return; }
      if (pts.length === 1) gesture = {type: 'pan', p: pts[0], cam: {...cam}};
      else gesture = {
        type: 'pinch',
        c: {x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2},
        d: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        cam: {...cam}
      };
    }

    viewport.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      cancelAnimationFrame(anim);
      clearHover();
      if (!pointers.size) moved = false;
      pointers.set(ev.pointerId, localPt(ev));
      resetGesture();
      if (!ev.target.closest('button')) viewport.setPointerCapture(ev.pointerId);
    });
    viewport.addEventListener('pointermove', ev => {
      if (!pointers.has(ev.pointerId) || !gesture) return;
      const pt = localPt(ev);
      pointers.set(ev.pointerId, pt);
      if (gesture.type === 'pan') {
        const dx = pt.x - gesture.p.x, dy = pt.y - gesture.p.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = true;
        viewport.setPointerCapture(ev.pointerId);
        setCam({...gesture.cam, x: gesture.cam.x + dx, y: gesture.cam.y + dy}, false);
      } else {
        const [a, b] = Array.from(pointers.values());
        if (!b) return;
        const c = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
        const s = clamp(gesture.cam.s * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d, minScale(), 10);
        const r = s / gesture.cam.s;
        moved = true;
        setCam({
          x: gesture.c.x - (gesture.c.x - gesture.cam.x) * r + c.x - gesture.c.x,
          y: gesture.c.y - (gesture.c.y - gesture.cam.y) * r + c.y - gesture.c.y,
          s
        }, false);
      }
      viewport.classList.add('is-dragging');
      detach();
    });
    function endPointer(ev) {
      if (!pointers.has(ev.pointerId)) return;
      pointers.delete(ev.pointerId);
      if (viewport.hasPointerCapture(ev.pointerId)) viewport.releasePointerCapture(ev.pointerId);
      resetGesture();
      if (!pointers.size) {
        viewport.classList.remove('is-dragging');
        setTimeout(() => { moved = false; }, 0);
      }
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    viewport.addEventListener('wheel', ev => {
      ev.preventDefault();
      const k = ev.deltaMode === 1 ? 16 : (ev.deltaMode === 2 ? viewport.clientHeight : 1);
      if (ev.ctrlKey || ev.metaKey) zoomBy(Math.exp(-ev.deltaY * k * 0.008), localPt(ev), false);
      else {
        detach();
        setCam({...cam, x: cam.x - ev.deltaX * k, y: cam.y - ev.deltaY * k}, false);
      }
    }, {passive: false});
    viewport.addEventListener('dblclick', ev => {
      if (!ev.target.closest('button')) zoomBy(ev.shiftKey ? 0.65 : 1.5, localPt(ev), true);
    });
    viewport.addEventListener('scroll', () => {
      if (viewport.scrollTop || viewport.scrollLeft) viewport.scrollTo(0, 0);
    });

    hotspotsEl.addEventListener('pointermove', ev => {
      const h = ev.target.closest('.stage-hotspot');
      if (!h || ev.pointerType === 'touch' || pointers.size || performance.now() < suppressHoverUntil) return;
      if (hoveredId === h.dataset.entry) return;
      clearHover();
      hoveredId = h.dataset.entry;
      h.classList.add('is-hover');
      hoverTimer = setTimeout(() => { previewId = hoveredId; renderOutline(); }, 120);
    });
    hotspotsEl.addEventListener('pointerleave', clearHover);

    zoomInBtn.addEventListener('click', () => zoomBy(1.3, null, true));
    zoomOutBtn.addEventListener('click', () => zoomBy(1 / 1.3, null, true));
    overviewBtn.addEventListener('click', () => {
      if (detached || overview) {
        overview = false;
        detached = false;
      } else {
        overview = true;
        previewId = null;
      }
      renderState();
      fit(true);
    });

    function initSvgElement(svgEl) {
      svg = svgEl;
      const baseVb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width
        ? svg.viewBox.baseVal
        : {x: 0, y: 0, width: Number(svg.getAttribute('width')) || 2048, height: Number(svg.getAttribute('height')) || 1400};
      vb = {x: baseVb.x, y: baseVb.y, width: baseVb.width, height: baseVb.height};
      W = vb.width;
      H = vb.height;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      world.style.width = W + 'px';
      world.style.height = H + 'px';
      allBounds = [0, 0, W, H];

      const byId = new Map(api.getEntries().map(e => [e.id, e]));
      reveals = Array.from(svg.querySelectorAll('[data-from]')).map(el => ({
        el,
        order: byId.get(el.getAttribute('data-from'))?.order ?? 0
      }));

      resolveAllBoxes();
      buildHotspots();
      ready = true;
      renderState();
      fit(false);
    }

    if (svg) {
      requestAnimationFrame(() => initSvgElement(svg));
    } else if (paneCfg.src) {
      fetch(paneCfg.src)
        .then(res => { if (!res.ok) throw new Error('SVG fetch failed'); return res.text(); })
        .then(text => {
          const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
          const fetchedSvg = doc.querySelector('svg');
          if (!fetchedSvg) return;
          fetchedSvg.querySelectorAll('script').forEach(s => s.remove());
          const contentId = shell.dataset.contentId;
          const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
          g.setAttribute('id', contentId);
          while (fetchedSvg.firstChild) g.appendChild(fetchedSvg.firstChild);
          fetchedSvg.appendChild(g);
          artwork.replaceChildren(fetchedSvg);
          initSvgElement(fetchedSvg);
        })
        .catch(() => {
          artwork.replaceChildren(makeEl('div', 'stage-empty', esc(zh ? '无法加载画布资源' : 'Unable to load canvas SVG')));
        });
    }

    return {
      activate(cue, entry, opts = {}) {
        currentEntry = entry || currentEntry;
        currentCue = cue || (entry ? entry.cue : null);
        overview = Boolean(currentCue?.overview);
        detached = false;
        previewId = null;
        if (!ready) return;
        renderState();
        fit(opts.animate !== false);
      },
      preview(targetId) {
        previewId = targetId || null;
        if (ready) renderOutline();
      },
      resize() {
        if (!ready) return;
        if (!boxes.size) resolveAllBoxes();
        if (!detached) fit(false);
      },
      resetOrResume() {
        if (detached || overview) {
          overview = false;
          detached = false;
          renderState();
          fit(true);
          return true;
        }
        return false;
      },
      getState() {
        return {ready, width: W, height: H, cam, overview, detached, boxes: Object.fromEntries(boxes)};
      }
    };
  });

  /* ==========================================================================
   * 2. PDF ADAPTER — Scroll-Synced PDF Viewer (No History Pollution)
   * ========================================================================== */
  registerAdapter('pdf', function createPdfAdapter(paneEl, paneCfg) {
    const zh = isZhLang();
    const shell = makeEl('div', 'stage-pdf-shell');
    const bar = makeEl('div', 'stage-pdf-bar');
    const prevBtn = makeEl('button', 'stage-btn', '‹');
    prevBtn.type = 'button';
    prevBtn.setAttribute('aria-label', zh ? '上一页' : 'Previous page');
    const pageInput = makeEl('input', 'stage-pdf-page-input');
    pageInput.type = 'number';
    pageInput.min = '1';
    pageInput.value = String(paneCfg.page || 1);
    pageInput.setAttribute('aria-label', zh ? 'PDF 页码' : 'PDF page');
    const nextBtn = makeEl('button', 'stage-btn', '›');
    nextBtn.type = 'button';
    nextBtn.setAttribute('aria-label', zh ? '下一页' : 'Next page');
    const openLink = makeEl('a', 'stage-btn', esc(zh ? '新窗口打开' : 'Open PDF'));
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    bar.append(prevBtn, pageInput, nextBtn, openLink);

    const host = makeEl('div', 'stage-pdf-host');
    shell.append(bar, host);
    paneEl.appendChild(shell);

    let currentSrc = paneCfg.src || '';
    let currentPage = Math.max(1, Number(paneCfg.page) || 1);
    let currentZoom = paneCfg.zoom || 'page-width';
    let currentRenderedUrl = '';

    function buildPdfUrl(src, page, zoom, search, nameddest) {
      if (!src) return '';
      const clean = src.split('#')[0];
      const frag = [];
      if (nameddest) frag.push('nameddest=' + encodeURIComponent(nameddest));
      else if (page) frag.push('page=' + Math.max(1, Math.trunc(page)));
      if (zoom) frag.push('zoom=' + encodeURIComponent(zoom));
      if (search) frag.push('search=' + encodeURIComponent(search));
      return clean + (frag.length ? '#' + frag.join('&') : '');
    }

    function navigatePdf(url) {
      if (!url || url === currentRenderedUrl) return;
      currentRenderedUrl = url;
      openLink.href = url;
      // Replace the iframe element directly so browser session history is never polluted on scroll.
      const frame = document.createElement('iframe');
      frame.className = 'stage-pdf-frame';
      frame.title = paneCfg.label || 'PDF';
      frame.src = url;
      host.replaceChildren(frame);
    }

    function setPage(page) {
      currentPage = Math.max(1, Math.trunc(Number(page) || 1));
      pageInput.value = String(currentPage);
      navigatePdf(buildPdfUrl(currentSrc, currentPage, currentZoom));
    }

    prevBtn.addEventListener('click', () => setPage(currentPage - 1));
    nextBtn.addEventListener('click', () => setPage(currentPage + 1));
    pageInput.addEventListener('change', () => setPage(pageInput.value));

    if (currentSrc) navigatePdf(buildPdfUrl(currentSrc, currentPage, currentZoom));
    else host.replaceChildren(makeEl('div', 'stage-empty', esc(zh ? '未指定 PDF 文件' : 'No PDF source configured')));

    return {
      activate(cue) {
        if (!cue) return;
        let changed = false;
        if (cue.src && cue.src !== currentSrc) { currentSrc = cue.src; changed = true; }
        if (cue.page != null && cue.page !== currentPage) {
          currentPage = Math.max(1, Math.trunc(cue.page));
          pageInput.value = String(currentPage);
          changed = true;
        }
        if (cue.zoom && cue.zoom !== currentZoom) { currentZoom = cue.zoom; changed = true; }
        if (changed || cue.search || cue.nameddest) {
          navigatePdf(buildPdfUrl(currentSrc, currentPage, currentZoom, cue.search, cue.nameddest));
        }
      },
      getState() {
        return {src: currentSrc, page: currentPage, url: currentRenderedUrl};
      }
    };
  });

  /* ==========================================================================
   * 3. IMAGE / PICTURE ADAPTER — Pan/Zoom + Spotlight Crop Focus + Gallery
   * ========================================================================== */
  registerAdapter('image', function createImageAdapter(paneEl, paneCfg) {
    const zh = isZhLang();
    const shell = makeEl('div', 'stage-image-shell');
    const tools = makeEl('div', 'stage-image-tools');
    const fitBtn = makeEl('button', 'stage-btn', esc(zh ? '适应窗口' : 'Fit image'));
    fitBtn.type = 'button';
    const zoomGroup = makeEl('div', 'stage-zoom-group');
    const zoomOut = makeEl('button', '', '−'); zoomOut.type = 'button';
    const zoomIn = makeEl('button', '', '+'); zoomIn.type = 'button';
    zoomGroup.append(zoomOut, zoomIn);
    tools.append(fitBtn, zoomGroup);

    const gallery = Array.isArray(paneCfg.images) ? paneCfg.images : [];
    const chipButtons = [];
    if (gallery.length > 1) {
      gallery.forEach((item, idx) => {
        const b = makeEl('button', 'stage-btn', esc(item.label || String(idx + 1)));
        b.type = 'button';
        b.addEventListener('click', () => loadSrc(item.src, null, item.label));
        chipButtons.push({btn: b, src: item.src});
        tools.appendChild(b);
      });
    }

    const viewport = makeEl('div', 'stage-image-viewport');
    viewport.tabIndex = 0;
    const world = makeEl('div', 'stage-image-world');
    const img = document.createElement('img');
    img.alt = paneCfg.alt || paneCfg.label || '';
    const spotlight = makeEl('div', 'stage-image-spotlight');
    spotlight.hidden = true;
    const spotImg = document.createElement('img');
    spotImg.alt = '';
    spotlight.appendChild(spotImg);
    world.append(img, spotlight);
    viewport.appendChild(world);

    const card = makeEl('div', 'stage-overlay-card');
    card.hidden = true;
    shell.append(tools, viewport, card);
    paneEl.appendChild(shell);

    let natW = 1200, natH = 800;
    let cam = {x: 0, y: 0, s: 1};
    let anim = 0;
    let activeFocus = paneCfg.focus || null;
    let activeCaption = paneCfg.caption || '';
    let activeKicker = '';
    let currentSrc = paneCfg.src || (gallery[0] && gallery[0].src) || '';

    function paint() {
      world.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.s})`;
    }

    function resolveFocusBox(focus) {
      if (!Array.isArray(focus) || focus.length !== 4) return null;
      const normalized = focus.every(v => Math.abs(v) <= 1.0001) && (focus[2] <= 1 && focus[3] <= 1);
      if (normalized) {
        return [focus[0] * natW, focus[1] * natH, focus[2] * natW, focus[3] * natH];
      }
      return focus.slice();
    }

    function fitTo(focus, animate = true) {
      const vw = viewport.clientWidth || 600;
      const vh = viewport.clientHeight || 500;
      const box = resolveFocusBox(focus) || [0, 0, natW, natH];
      const pad = 28;
      const s = Math.max(0.05, Math.min((vw - 2 * pad) / Math.max(1, box[2]), (vh - 2 * pad) / Math.max(1, box[3]), 4));
      const end = {
        x: vw / 2 - (box[0] + box[2] / 2) * s,
        y: vh / 2 - (box[1] + box[3] / 2) * s,
        s
      };
      const hasFocus = Boolean(resolveFocusBox(focus));
      world.classList.toggle('is-focused', hasFocus);
      spotlight.hidden = !hasFocus;
      if (hasFocus) {
        spotlight.style.left = box[0] + 'px';
        spotlight.style.top = box[1] + 'px';
        spotlight.style.width = box[2] + 'px';
        spotlight.style.height = box[3] + 'px';
        spotImg.style.width = natW + 'px';
        spotImg.style.height = natH + 'px';
        spotImg.style.left = (-box[0]) + 'px';
        spotImg.style.top = (-box[1]) + 'px';
      }

      cancelAnimationFrame(anim);
      if (!animate || reducedMotion.matches) {
        cam = end;
        paint();
        return;
      }
      const start = {...cam}, t0 = performance.now(), dur = 320;
      const tick = now => {
        const t = Math.min(1, (now - t0) / dur), k = 1 - Math.pow(1 - t, 4);
        cam = {x: start.x + (end.x - start.x) * k, y: start.y + (end.y - start.y) * k, s: start.s + (end.s - start.s) * k};
        paint();
        if (t < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    }

    function updateCard() {
      if (!activeCaption && !activeKicker) {
        card.hidden = true;
        return;
      }
      card.hidden = false;
      card.innerHTML =
        (activeKicker ? `<span class="stage-overlay-kicker">${esc(activeKicker)}</span>` : '') +
        esc(activeCaption);
    }

    function loadSrc(src, focus, caption, kicker, animate) {
      if (!src) return;
      activeFocus = focus !== undefined ? focus : null;
      if (caption !== undefined) activeCaption = caption;
      if (kicker !== undefined) activeKicker = kicker;
      updateCard();
      chipButtons.forEach(c => c.btn.setAttribute('aria-pressed', String(c.src === src)));
      if (img.getAttribute('src') === src && img.complete && img.naturalWidth) {
        fitTo(activeFocus, animate);
        return;
      }
      currentSrc = src;
      img.onload = () => {
        natW = img.naturalWidth || 1200;
        natH = img.naturalHeight || 800;
        world.style.width = natW + 'px';
        world.style.height = natH + 'px';
        fitTo(activeFocus, false);
      };
      img.src = src;
      spotImg.src = src;
    }

    // Pan & wheel zoom
    let drag = null;
    viewport.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || ev.target.closest('button')) return;
      drag = {x: ev.clientX, y: ev.clientY, cam: {...cam}};
      viewport.classList.add('is-dragging');
      viewport.setPointerCapture(ev.pointerId);
    });
    viewport.addEventListener('pointermove', ev => {
      if (!drag) return;
      cam = {x: drag.cam.x + (ev.clientX - drag.x), y: drag.cam.y + (ev.clientY - drag.y), s: drag.cam.s};
      paint();
    });
    viewport.addEventListener('pointerup', () => { drag = null; viewport.classList.remove('is-dragging'); });
    viewport.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = viewport.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      const factor = Math.exp(-ev.deltaY * 0.0025);
      const nextS = clamp(cam.s * factor, 0.05, 8);
      const ratio = nextS / cam.s;
      cam = {x: px - (px - cam.x) * ratio, y: py - (py - cam.y) * ratio, s: nextS};
      paint();
    }, {passive: false});

    fitBtn.addEventListener('click', () => { activeFocus = null; fitTo(null, true); });
    zoomIn.addEventListener('click', () => {
      const vw = viewport.clientWidth / 2, vh = viewport.clientHeight / 2;
      const nextS = clamp(cam.s * 1.3, 0.05, 8), r = nextS / cam.s;
      cam = {x: vw - (vw - cam.x) * r, y: vh - (vh - cam.y) * r, s: nextS};
      paint();
    });
    zoomOut.addEventListener('click', () => {
      const vw = viewport.clientWidth / 2, vh = viewport.clientHeight / 2;
      const nextS = clamp(cam.s / 1.3, 0.05, 8), r = nextS / cam.s;
      cam = {x: vw - (vw - cam.x) * r, y: vh - (vh - cam.y) * r, s: nextS};
      paint();
    });

    if (currentSrc) loadSrc(currentSrc, activeFocus, activeCaption, '', false);

    return {
      activate(cue, _entry, opts = {}) {
        if (!cue) return;
        const nextSrc = cue.src || currentSrc;
        const nextFocus = cue.overview ? null : (cue.focus || null);
        loadSrc(
          nextSrc,
          nextFocus,
          cue.caption ?? cue.note ?? activeCaption,
          cue.kicker ?? cue.title ?? '',
          opts.animate !== false
        );
      },
      resize() {
        fitTo(activeFocus, false);
      },
      getState() {
        return {src: currentSrc, focus: activeFocus, cam};
      }
    };
  });

  /* ==========================================================================
   * 4. VIRTUAL WORLD / 3D / INTERACTIVE SANDBOX ADAPTER (postMessage Bridge)
   * ========================================================================== */
  registerAdapter('world', function createWorldAdapter(paneEl, paneCfg, api) {
    const zh = isZhLang();
    const shell = makeEl('div', 'stage-world-shell');
    const tools = makeEl('div', 'stage-world-tools');
    const resetBtn = makeEl('button', 'stage-btn', esc(zh ? '重置视角' : 'Reset view'));
    resetBtn.type = 'button';
    const openLink = makeEl('a', 'stage-btn', esc(zh ? '独立打开' : 'Open standalone'));
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    tools.append(resetBtn, openLink);

    const card = makeEl('div', 'stage-overlay-card');
    card.hidden = true;
    shell.append(tools, card);
    paneEl.appendChild(shell);

    let currentSrc = paneCfg.src || '';
    let lastCue = null;
    let lastEntry = null;
    let frame = null;
    let modelEl = null;
    const isModel3d = paneCfg.kind === 'model3d' || /\.(?:glb|gltf)(?:[?#]|$)/i.test(currentSrc);

    function postToWorld(payload) {
      if (!frame || !frame.contentWindow) return;
      try {
        frame.contentWindow.postMessage(Object.assign({type: 'blackcat:stage', paneId: paneCfg.id}, payload), '*');
      } catch (_) { /* cross-origin frame may ignore */ }
      try {
        const doc = frame.contentDocument;
        if (doc && doc.documentElement) {
          doc.documentElement.dataset.theme = isLightTheme() ? 'light' : 'dark';
        }
      } catch (_) { /* cross-origin safe */ }
    }

    function mountWorldUrl(src) {
      if (!src) return;
      currentSrc = src;
      openLink.href = src;
      if (isModel3d) {
        let host = shell.querySelector('.stage-model-host');
        if (!host) {
          host = makeEl('div', 'stage-model-host');
          shell.insertBefore(host, card);
        }
        if (!document.querySelector('script[data-model-viewer]')) {
          const s = document.createElement('script');
          s.type = 'module';
          s.dataset.modelViewer = 'true';
          s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
          document.head.appendChild(s);
        }
        modelEl = document.createElement('model-viewer');
        modelEl.setAttribute('src', src);
        modelEl.setAttribute('camera-controls', '');
        modelEl.setAttribute('auto-rotate', '');
        if (paneCfg.poster) modelEl.setAttribute('poster', paneCfg.poster);
        host.replaceChildren(modelEl);
        return;
      }

      if (frame) frame.remove();
      frame = document.createElement('iframe');
      frame.className = 'stage-world-frame';
      frame.title = paneCfg.label || 'Interactive World';
      frame.allow = paneCfg.allow || 'fullscreen; xr-spatial-tracking; accelerometer; gyroscope';
      if (paneCfg.sandbox) frame.setAttribute('sandbox', paneCfg.sandbox);
      frame.src = src;
      frame.addEventListener('load', () => {
        postToWorld({
          action: 'init',
          theme: isLightTheme() ? 'light' : 'dark',
          state: (lastCue && lastCue.state) || paneCfg.state || null,
          entryId: lastEntry ? lastEntry.id : null
        });
      });
      shell.insertBefore(frame, card);
    }

    function onMessage(ev) {
      if (!frame || ev.source !== frame.contentWindow || !ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'blackcat:reader' && ev.data.action === 'jumpTo' && ev.data.entryId) {
        api.jumpTo(String(ev.data.entryId));
      }
    }
    window.addEventListener('message', onMessage);

    resetBtn.addEventListener('click', () => {
      if (modelEl && typeof modelEl.resetTurntableRotation === 'function') modelEl.resetTurntableRotation();
      postToWorld({
        action: 'reset',
        theme: isLightTheme() ? 'light' : 'dark',
        state: (lastCue && lastCue.state) || paneCfg.state || null
      });
    });

    if (currentSrc) mountWorldUrl(currentSrc);
    else shell.appendChild(makeEl('div', 'stage-empty', esc(zh ? '未配置交互世界地址' : 'No interactive world URL configured')));

    return {
      activate(cue, entry) {
        lastCue = cue || null;
        lastEntry = entry || null;
        if (cue && cue.src && cue.src !== currentSrc) {
          mountWorldUrl(cue.src);
        }
        const caption = cue?.caption || cue?.note || '';
        card.hidden = !caption;
        if (caption) card.textContent = caption;

        if (modelEl && cue?.state) {
          if (cue.state.orbit) modelEl.setAttribute('camera-orbit', String(cue.state.orbit));
          if (cue.state.target) modelEl.setAttribute('camera-target', String(cue.state.target));
        }
        postToWorld({
          action: 'activate',
          entryId: entry ? entry.id : null,
          cue: cue || null,
          state: (cue && cue.state) || paneCfg.state || null,
          theme: isLightTheme() ? 'light' : 'dark'
        });
      },
      setTheme(theme) {
        postToWorld({action: 'theme', theme});
      },
      destroy() {
        window.removeEventListener('message', onMessage);
      },
      getState() {
        return {src: currentSrc, state: lastCue?.state || paneCfg.state || null};
      }
    };
  });

  /* ==========================================================================
   * 5. MEDIA ADAPTER — Multi-Encoding Clips, Segment Loops & Outcome Cards
   * ========================================================================== */
  registerAdapter('media', function createMediaAdapter(paneEl, paneCfg, api) {
    const zh = isZhLang();
    const shell = makeEl('div', 'stage-media-shell');
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.loop = true;
    video.controls = true;
    video.preload = 'metadata';
    const img = document.createElement('img');
    img.hidden = true;
    const chips = makeEl('div', 'stage-clip-chips');
    chips.hidden = true;
    const card = makeEl('div', 'stage-overlay-card');
    card.hidden = true;
    const empty = makeEl('div', 'stage-empty', esc(zh ? '当前小节暂无视频' : 'No media clip for this section'));
    shell.append(video, img, chips, card, empty);
    paneEl.appendChild(shell);

    const clips = api.getConfig().clips || {};
    let activeList = [];
    let activeIdx = 0;
    let activeSeg = null;

    const CODEC = {
      mp4: 'video/mp4; codecs="avc1.42E01E"',
      webm: 'video/webm; codecs="vp8"',
      ogv: 'video/ogg; codecs="theora"'
    };

    function pickSource(src) {
      const list = Array.isArray(src) ? src : [src];
      for (const u of list) {
        if (!u) continue;
        const ext = (String(u).match(/\.([a-z0-9]+)(?:[?#]|$)/i) || [])[1]?.toLowerCase();
        const type = CODEC[ext];
        if (!type || video.canPlayType(type)) return u;
      }
      return list[0] || '';
    }

    function playIndex(idx, segOverride, cardOverride) {
      activeIdx = idx;
      const item = activeList[idx];
      empty.hidden = Boolean(item);
      chips.hidden = activeList.length < 2;
      chips.innerHTML = '';
      if (activeList.length >= 2) {
        activeList.forEach((c, i) => {
          const b = makeEl('button', 'stage-btn', '▶ ' + (i + 1));
          b.type = 'button';
          b.setAttribute('aria-pressed', String(i === idx));
          b.addEventListener('click', () => playIndex(i, segOverride, cardOverride));
          chips.appendChild(b);
        });
      }
      if (!item) {
        video.pause();
        video.hidden = true;
        img.hidden = true;
        card.hidden = true;
        api.notifyMediaChange(null, video);
        return;
      }
      const chosen = pickSource(item.src);
      const isImg = /\.(?:png|jpe?g|webp|gif|svg|avif)(?:[?#]|$)/i.test(chosen);
      video.hidden = isImg;
      img.hidden = !isImg;
      if (isImg) {
        video.pause();
        img.src = chosen;
        img.alt = item.title || '';
      } else {
        if (video.getAttribute('src') !== chosen) {
          if (item.poster) video.poster = item.poster;
          else video.removeAttribute('poster');
          video.src = chosen;
        }
        activeSeg = segOverride || (item.start != null || item.end != null ? [item.start || 0, item.end ?? null] : null);
        const startVideo = () => {
          try { video.currentTime = activeSeg ? activeSeg[0] : 0; } catch (_) {}
          if (!reducedMotion.matches) video.play().catch(() => {});
        };
        if (video.readyState >= 1) startVideo();
        else video.addEventListener('loadedmetadata', startVideo, {once: true});
      }

      const title = cardOverride?.title ?? item.title ?? '';
      const note = cardOverride?.note ?? item.note ?? '';
      const kicker = cardOverride?.kicker ?? item.kicker ?? '';
      card.hidden = !(title || note || kicker);
      card.innerHTML =
        (kicker ? `<span class="stage-overlay-kicker">${esc(kicker)}</span>` : '') +
        (title ? `<strong>${esc(title)}</strong> ` : '') +
        (note ? esc(note) : '');

      api.notifyMediaChange(item, video);
    }

    video.addEventListener('timeupdate', () => {
      if (activeSeg && activeSeg[1] != null && video.currentTime >= activeSeg[1]) {
        video.currentTime = activeSeg[0];
      }
    });

    if (paneCfg.src) {
      activeList = [{id: paneCfg.id, src: paneCfg.src, poster: paneCfg.poster, title: paneCfg.label}];
      playIndex(0, null, null);
    }

    return {
      activate(cue) {
        if (!cue) return;
        if (cue.media != null) {
          const raw = cue.media;
          const ids = typeof raw === 'string' ? [raw] : (Array.isArray(raw) ? raw : (raw.clips || (raw.clip ? [raw.clip] : [])));
          activeList = ids.map(id => clips[id] || (typeof id === 'string' && /\.[a-z0-9]+$/i.test(id) ? {id, src: id} : null)).filter(Boolean);
          const seg = (cue.start != null || cue.end != null || raw?.start != null || raw?.end != null)
            ? [cue.start ?? raw?.start ?? 0, cue.end ?? raw?.end ?? null]
            : null;
          playIndex(0, seg, raw?.card || cue);
        } else if (cue.src) {
          activeList = [{id: cue.src, src: cue.src, title: cue.title || '', note: cue.caption || cue.note || ''}];
          const seg = (cue.start != null || cue.end != null) ? [cue.start || 0, cue.end ?? null] : null;
          playIndex(0, seg, cue);
        }
      },
      getVideo() { return video; },
      getState() { return {clips: activeList.length, index: activeIdx}; }
    };
  });

  /* ==========================================================================
   * 6. CHART ADAPTER — Responsive SVG Curves & Video-Synced Traces
   * ========================================================================== */
  registerAdapter('chart', function createChartAdapter(paneEl, _paneCfg, api) {
    const zh = isZhLang();
    const shell = makeEl('div', 'stage-chart-shell');
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.setAttribute('class', 'stage-chart-svg');
    host.setAttribute('aria-label', 'Chart');
    const empty = makeEl('div', 'stage-empty', esc(zh ? '当前小节暂无图表' : 'No chart for this section'));
    shell.append(host, empty);
    paneEl.appendChild(shell);

    const seriesLib = api.getConfig().series || {};
    const PAL_DARK = ['#74c0fc', '#ffa94d', '#8ce99a', '#e599f7', '#ff8787', '#66d9e8'];
    const PAL_LIGHT = ['#1971c2', '#e8590c', '#2f9e44', '#9c36b5', '#e03131', '#0c8599'];
    let currentSpec = null;
    let playhead = null;
    let axisMeta = null;

    function niceTicks(a, b, n) {
      if (!(b > a)) b = a + 1;
      const raw = (b - a) / Math.max(1, n);
      const p = Math.pow(10, Math.floor(Math.log10(raw)));
      const r = raw / p;
      const st = p * (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1);
      const out = [];
      for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-9; v += st) out.push(Number(v.toFixed(10)));
      return out;
    }

    function fmtNum(v) {
      const a = Math.abs(v);
      if (a >= 1e4) return (v / 1e3).toFixed(a >= 1e5 ? 0 : 1) + 'k';
      if (a >= 100) return v.toFixed(0);
      if (a >= 1 || v === 0) return String(Number(v.toFixed(2)));
      return String(Number(v.toPrecision(2)));
    }

    function draw() {
      host.innerHTML = '';
      playhead = null;
      axisMeta = null;
      host.classList.remove('is-seekable');
      const rect = host.getBoundingClientRect();
      const activeMedia = api.getActiveMedia();
      const ids = !currentSpec
        ? []
        : (currentSpec.series === '@clip' ? (activeMedia.clip?.trace || []) : [].concat(currentSpec.series || []));
      const pal = isLightTheme() ? PAL_LIGHT : PAL_DARK;
      const ser = ids.map((id, idx) => {
        const s = seriesLib[id] || {};
        const pts = s.points || (s.x || []).map((x, j) => [x, s.y[j]]);
        return {label: s.label || id, color: s.color || pal[idx % pal.length], dash: s.dash, pts};
      });
      const all = ser.flatMap(s => s.pts.filter(p => p[1] != null && Number.isFinite(p[1])));
      empty.hidden = all.length > 0;
      if (!all.length || !rect.width || !rect.height) return;

      const W = rect.width, H = rect.height;
      const m = {l: 56, r: 18, t: currentSpec.title ? 44 : 18, b: 46};
      let x0 = currentSpec.xmin ?? Math.min(...all.map(p => p[0]));
      let x1 = currentSpec.xmax ?? Math.max(...all.map(p => p[0]));
      let y0 = currentSpec.ymin ?? Math.min(...all.map(p => p[1]));
      let y1 = currentSpec.ymax ?? Math.max(...all.map(p => p[1]));
      if (currentSpec.zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
      if (x0 === x1) { x0 -= 1; x1 += 1; }
      if (y0 === y1) { y0 -= 1; y1 += 1; }
      const pad = currentSpec.ymin != null ? 0 : (y1 - y0) * 0.06;
      const Y0 = y0 - pad, Y1 = y1 + pad;
      const sx = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
      const sy = v => H - m.b - (v - Y0) / (Y1 - Y0) * (H - m.t - m.b);
      const NS = 'http://www.w3.org/2000/svg';
      const svgEl = (tag, attrs, text) => {
        const n = document.createElementNS(NS, tag);
        for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]);
        if (text != null) n.textContent = text;
        host.appendChild(n);
        return n;
      };

      for (const v of niceTicks(Y0, Y1, Math.max(2, Math.floor((H - m.t - m.b) / 56)))) {
        const y = sy(v);
        if (y < m.t - 1 || y > H - m.b + 1) continue;
        svgEl('line', {x1: m.l, x2: W - m.r, y1: y, y2: y, class: 'grid'});
        svgEl('text', {x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'tick'}, fmtNum(v));
      }
      for (const v of niceTicks(x0, x1, Math.max(2, Math.floor((W - m.l - m.r) / 90)))) {
        const x = sx(v);
        if (x < m.l - 1 || x > W - m.r + 1) continue;
        svgEl('line', {x1: x, x2: x, y1: H - m.b, y2: H - m.b + 5, class: 'axis-line'});
        svgEl('text', {x, y: H - m.b + 18, 'text-anchor': 'middle', class: 'tick'}, fmtNum(v));
      }
      svgEl('line', {x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'axis-line'});
      if (currentSpec.title) svgEl('text', {x: m.l, y: 25, class: 'title'}, currentSpec.title);
      if (currentSpec.xlabel) svgEl('text', {x: (m.l + W - m.r) / 2, y: H - 10, 'text-anchor': 'middle', class: 'label'}, currentSpec.xlabel);
      if (currentSpec.ylabel) {
        const cy = (m.t + H - m.b) / 2;
        svgEl('text', {x: 15, y: cy, transform: `rotate(-90 15 ${cy})`, 'text-anchor': 'middle', class: 'label'}, currentSpec.ylabel);
      }

      for (const s of ser) {
        let d = '', pen = false;
        for (const [x, y] of s.pts) {
          if (y == null || !Number.isFinite(y)) { pen = false; continue; }
          d += (pen ? 'L' : 'M') + sx(x).toFixed(1) + ' ' + sy(y).toFixed(1);
          pen = true;
        }
        const attrs = {d, class: 'line', stroke: s.color};
        if (s.dash) attrs['stroke-dasharray'] = '6 5';
        svgEl('path', attrs);
      }

      if (ser.length > 1 || currentSpec.legend) {
        let yy = m.t + 6;
        const lx0 = W - m.r - Math.max(...ser.map(s => s.label.length)) * 6.8 - 36;
        for (const s of ser) {
          svgEl('line', {x1: lx0, x2: lx0 + 20, y1: yy + 6, y2: yy + 6, stroke: s.color, 'stroke-width': 3});
          svgEl('text', {x: lx0 + 26, y: yy + 10, class: 'legend'}, s.label);
          yy += 18;
        }
      }

      axisMeta = {sx, m, W, x0, x1};
      if (currentSpec.sync && activeMedia.video) {
        host.classList.add('is-seekable');
        playhead = svgEl('line', {x1: m.l, x2: m.l, y1: m.t, y2: H - m.b, class: 'playhead'});
        updatePlayhead();
      }
    }

    function updatePlayhead() {
      const video = api.getActiveMedia().video;
      if (!playhead || !axisMeta || !video) return;
      const x = axisMeta.sx(clamp(video.currentTime || 0, axisMeta.x0, axisMeta.x1));
      playhead.setAttribute('x1', x);
      playhead.setAttribute('x2', x);
    }

    host.addEventListener('click', ev => {
      const video = api.getActiveMedia().video;
      if (!playhead || !axisMeta || !video) return;
      const r = host.getBoundingClientRect();
      const t = axisMeta.x0 + (ev.clientX - r.left - axisMeta.m.l) / (axisMeta.W - axisMeta.m.l - axisMeta.m.r) * (axisMeta.x1 - axisMeta.x0);
      video.currentTime = clamp(t, axisMeta.x0, axisMeta.x1);
    });

    return {
      activate(cue) {
        if (cue && cue.chart) {
          currentSpec = cue.chart;
          draw();
        }
      },
      onMediaUpdate(video) {
        draw();
        if (video) {
          video.addEventListener('timeupdate', updatePlayhead);
          video.addEventListener('seeked', updatePlayhead);
        }
      },
      resize: draw,
      setTheme: draw,
      getState() { return {paths: host.querySelectorAll('path.line').length}; }
    };
  });

  /* ==========================================================================
   * 7. SCENE ADAPTER — Custom JS Animation (`registerScene` API)
   * ========================================================================== */
  registerAdapter('scene', function createSceneAdapter(paneEl, _paneCfg, api) {
    const shell = makeEl('div', 'stage-scene-shell');
    paneEl.appendChild(shell);
    let mounted = false;
    let rafId = 0;

    function ensureMounted() {
      if (mounted || !registeredSceneImpl) return;
      mounted = true;
      registeredSceneImpl.mount?.(shell, {
        el: shell,
        data: api.getConfig().sceneData || {},
        reducedMotion: reducedMotion.matches,
        dark: () => !isLightTheme(),
        jumpTo: id => api.jumpTo(id)
      });
      if (registeredSceneImpl.frame) {
        const loop = t => {
          if (!document.hidden) registeredSceneImpl.frame(t);
          rafId = requestAnimationFrame(loop);
        };
        rafId = requestAnimationFrame(loop);
      }
    }

    ensureMounted();

    return {
      activate(cue, entry) {
        ensureMounted();
        if (!registeredSceneImpl || !cue?.state) return;
        registeredSceneImpl.update?.(cue.state, {
          id: entry ? entry.id : '',
          title: entry ? entry.title : ''
        });
      },
      resize(w, h) {
        if (mounted) registeredSceneImpl?.resize?.(w, h);
      },
      destroy() {
        cancelAnimationFrame(rafId);
      }
    };
  });

  /* ==========================================================================
   * MAIN STAGE CONTROLLER
   * ========================================================================== */
  function bootStage() {
    const article = document.querySelector('.post--staged[data-article-stage="true"]');
    const dataEl = document.getElementById('article-stage-data');
    if (!article || !dataEl || article.dataset.stageMounted === 'true') return;
    article.dataset.stageMounted = 'true';

    let config;
    try { config = JSON.parse(dataEl.textContent); } catch (_) { return; }

    const prose = document.getElementById('stage-prose');
    const reader = document.getElementById('stage-reader');
    const readerInner = article.querySelector('.stage-reader-inner');
    const splitter = document.getElementById('stage-splitter');
    const contentsToggle = document.getElementById('stage-contents-toggle');
    const contentsMenu = document.getElementById('stage-contents-menu');
    const tocList = document.getElementById('stage-toc-list');
    const expandAllWrap = document.getElementById('stage-expand-all-wrap');
    const expandAllInput = document.getElementById('stage-expand-all');
    const currentLabelEl = document.getElementById('stage-current-label');
    const announceEl = document.getElementById('stage-announce');
    const mobileMedia = window.matchMedia('(max-width: 56.25rem)');
    const zh = isZhLang();

    // Parse inline stage cues and headings inside #stage-prose
    const entries = [];
    const byId = new Map();
    let initialCue = null;

    function parseCueNode(node) {
      if (!node || !node.dataset.stageCue) return null;
      try { return JSON.parse(node.dataset.stageCue); } catch (_) { return null; }
    }

    function isExcludedHeading(h) {
      for (let p = h.parentElement; p && p !== prose; p = p.parentElement) {
        if (p.tagName === 'DETAILS' && !p.classList.contains('stage-components-fold')) return true;
        if (/\b(?:mermaid|source-block|prose-ui|gpt-graph|desmos-graph|micrograd-plot|micrograd-diagram)\b/.test(p.className || '')) return true;
      }
      return false;
    }

    let lastSectionId = null;
    const walker = document.createTreeWalker(prose, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      if (node.classList.contains('stage-cue')) {
        const parsed = parseCueNode(node);
        if (parsed) {
          if (entries.length) {
            const prev = entries[entries.length - 1];
            prev.cue = Object.assign({}, prev.cue, parsed);
          } else {
            initialCue = Object.assign({}, initialCue || {}, parsed);
          }
        }
      } else if (/^H[23]$/.test(node.tagName) && !isExcludedHeading(node)) {
        if (!node.id) node.id = 'section-' + (entries.length + 1);
        const id = node.id;
        const kind = node.tagName === 'H3' && lastSectionId ? 'detail' : 'section';
        if (kind === 'section') lastSectionId = id;
        const detailsEl = node.closest('details.stage-components-fold');
        const configuredCue = (config.entries && config.entries[id]) || {};
        const entry = {
          id,
          title: (node.textContent || '').trim(),
          el: node,
          kind,
          parent: kind === 'detail' ? lastSectionId : null,
          detailsEl: detailsEl || null,
          order: entries.length,
          cue: Object.assign({region: id}, configuredCue)
        };
        entries.push(entry);
        byId.set(id, entry);
      }
      node = walker.nextNode();
    }

    if (initialCue && entries.length) {
      entries[0].cue = Object.assign({}, initialCue, entries[0].cue);
    }

    // Build unified TOC including folded component notes
    const folds = Array.from(prose.querySelectorAll('details.stage-components-fold'));
    if (folds.length && expandAllWrap && expandAllInput) {
      expandAllWrap.hidden = false;
      const syncExpandCheckbox = () => {
        expandAllInput.checked = folds.every(d => d.open);
      };
      expandAllInput.addEventListener('change', () => {
        folds.forEach(d => { d.open = expandAllInput.checked; });
        measureStops();
        scheduleSync();
      });
      folds.forEach(d => d.addEventListener('toggle', () => {
        syncExpandCheckbox();
        measureStops();
        scheduleSync();
      }));
    }

    if (entries.length && tocList) {
      const ul = makeEl('ul');
      for (const e of entries) {
        const li = makeEl('li', e.kind === 'detail' ? 'is-sub' : '');
        const a = makeEl('a', '', esc(e.title));
        a.href = '#' + encodeURIComponent(e.id);
        a.dataset.stageToc = e.id;
        a.addEventListener('click', ev => {
          ev.preventDefault();
          jumpTo(e.id);
        });
        li.appendChild(a);
        ul.appendChild(li);
      }
      tocList.replaceChildren(ul);
    }

    // Active media bridge for chart sync
    let activeMediaState = {clip: null, video: null};
    const mountedPanes = new Map();
    let activePaneId = config.panes[0]?.id || '';
    let activeEntryId = entries[0]?.id || '';
    let visibleEntries = [];
    let stopTops = [];
    let jumpLockTarget = null;
    let jumpLockTimer = 0;
    let syncRaf = 0;

    const stageApi = {
      getConfig: () => config,
      getEntries: () => entries,
      getActiveMedia: () => activeMediaState,
      notifyMediaChange(clip, video) {
        activeMediaState = {clip, video};
        for (const inst of mountedPanes.values()) {
          inst.adapter.onMediaUpdate?.(video);
        }
      },
      jumpTo: id => jumpTo(id)
    };

    // Mount pane adapters
    for (const paneCfg of config.panes) {
      const paneEl = document.getElementById('stage-pane-' + paneCfg.id);
      const factory = adapters.get(paneCfg.type);
      if (!paneEl || !factory) continue;
      const adapter = factory(paneEl, paneCfg, stageApi);
      mountedPanes.set(paneCfg.id, {cfg: paneCfg, el: paneEl, adapter});
      if (window.ResizeObserver) {
        new ResizeObserver(() => adapter.resize?.(paneEl.clientWidth, paneEl.clientHeight)).observe(paneEl);
      }
    }

    // Tab switching
    function showPaneTab(targetIdOrType) {
      if (config.mode !== 'tabs') return;
      let target = mountedPanes.get(targetIdOrType);
      if (!target) {
        for (const item of mountedPanes.values()) {
          if (item.cfg.type === targetIdOrType) { target = item; break; }
        }
      }
      if (!target) return;
      activePaneId = target.cfg.id;
      for (const item of mountedPanes.values()) {
        const on = item.cfg.id === activePaneId;
        item.el.hidden = !on;
        item.el.classList.toggle('is-active', on);
        if (on) item.adapter.resize?.(item.el.clientWidth, item.el.clientHeight);
      }
      article.querySelectorAll('.stage-tab').forEach(btn => {
        btn.setAttribute('aria-selected', String(btn.dataset.paneTarget === activePaneId));
      });
    }

    article.querySelectorAll('.stage-tab').forEach(btn => {
      btn.addEventListener('click', () => showPaneTab(btn.dataset.paneTarget));
    });

    // View mode switching: split | reader | stage
    function applyViewMode(mode) {
      const nextMode = ['split', 'reader', 'stage'].includes(mode) ? mode : 'split';
      article.dataset.stageView = nextMode;
      document.documentElement.dataset.stageActive = nextMode === 'reader' ? 'false' : 'true';
      article.querySelectorAll('.stage-view-btn').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.viewMode === nextMode));
      });
      if (nextMode !== 'reader') {
        const outlineDlg = document.getElementById('article-outline-dialog');
        if (outlineDlg && outlineDlg.open && typeof outlineDlg.close === 'function') outlineDlg.close();
      }
      const expandPill = article.querySelector('.stage-dock [data-set-stage-view]');
      if (expandPill) {
        const isFull = nextMode === 'stage';
        expandPill.dataset.setStageView = isFull ? 'split' : 'stage';
        const span = expandPill.querySelector('[data-expand-label]');
        if (span) span.textContent = isFull ? (zh ? '返回分栏' : 'Split view') : (zh ? '全屏舞台' : 'Stage');
      }
      requestAnimationFrame(() => {
        measureStops();
        for (const item of mountedPanes.values()) {
          item.adapter.resize?.(item.el.clientWidth, item.el.clientHeight);
        }
        if (activeEntryId) activateEntry(activeEntryId, {animate: false, history: 'none', force: true});
        window.dispatchEvent(new Event('resize'));
      });
    }

    article.querySelectorAll('.stage-view-btn').forEach(btn => {
      btn.addEventListener('click', () => applyViewMode(btn.dataset.viewMode));
    });
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-set-stage-view]');
      if (!btn) return;
      if (btn.closest('.post--staged, #article-outline-dialog')) {
        applyViewMode(btn.dataset.setStageView);
      }
    });

    // Inherit cue fields from earlier entries so panes only update when a section asks for a change
    function effectiveCueFor(entry) {
      const merged = {};
      for (let i = 0; i <= entry.order; i++) {
        const c = entries[i].cue;
        if (!c) continue;
        for (const k of ['tab', 'src', 'page', 'zoom', 'media', 'chart', 'state', 'caption', 'kicker', 'note']) {
          if (c[k] !== undefined) merged[k] = c[k];
        }
      }
      // Region / bounds / focus / overview belong strictly to the active entry (not inherited from an earlier unrelated heading)
      const own = entry.cue || {};
      for (const localKey of ['region', 'bounds', 'pad', 'maxScale', 'focus', 'overview', 'search', 'nameddest', 'start', 'end']) {
        if (own[localKey] !== undefined) merged[localKey] = own[localKey];
      }
      return merged;
    }

    function activateEntry(id, {animate = true, history: hm = 'replace', force = false} = {}) {
      const entry = byId.get(id);
      if (!entry) return;
      if (activeEntryId === id && !force) return;
      activeEntryId = id;

      const cue = effectiveCueFor(entry);
      if (cue.tab) showPaneTab(cue.tab);

      for (const item of mountedPanes.values()) {
        item.adapter.activate?.(cue, entry, {animate});
      }

      for (const e of entries) {
        e.el.classList.toggle('is-stage-current', e.id === id);
      }
      if (tocList) {
        tocList.querySelectorAll('a[data-stage-toc]').forEach(a => {
          if (a.dataset.stageToc === id) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        });
      }
      if (currentLabelEl) currentLabelEl.textContent = entry.title;
      if (announceEl) announceEl.textContent = entry.title;

      if (hm !== 'none') {
        const hash = '#' + encodeURIComponent(id);
        if (location.hash !== hash) {
          window.history[hm === 'push' ? 'pushState' : 'replaceState'](null, '', location.pathname + location.search + hash);
        }
      }
      updateTransportUI();
    }

    // Scroll sync (supports both #stage-reader scroll in split mode and window scroll in reader mode)
    function isEntryVisible(e) {
      return !e.detailsEl || e.detailsEl.open;
    }

    function anchorOffset() {
      if (article.dataset.stageView === 'reader') return 110;
      return Math.min(150, (reader.clientHeight || 600) * 0.24);
    }

    function measureStops() {
      if (readerInner) {
        if (article.dataset.stageView === 'reader') {
          readerInner.style.paddingBottom = '';
        } else if (reader) {
          readerInner.style.paddingBottom = Math.ceil(Math.max(240, reader.clientHeight - anchorOffset() + 32)) + 'px';
        }
      }
      visibleEntries = entries.filter(isEntryVisible);
      if (article.dataset.stageView === 'reader') {
        stopTops = visibleEntries.map(e => e.el.getBoundingClientRect().top + window.scrollY);
      } else {
        const rRect = reader.getBoundingClientRect();
        stopTops = visibleEntries.map(e => e.el.getBoundingClientRect().top - rRect.top + reader.scrollTop);
      }
    }

    function readingIndex(line) {
      let lo = 0, hi = stopTops.length - 1, found = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (stopTops[mid] <= line + 2) { found = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      return found;
    }

    function syncFromScroll() {
      if (jumpLockTarget || !visibleEntries.length) return;
      const scrollPos = article.dataset.stageView === 'reader' ? window.scrollY : reader.scrollTop;
      const chosen = visibleEntries[readingIndex(scrollPos + anchorOffset())];
      if (chosen) activateEntry(chosen.id);
    }

    function scheduleSync() {
      if (!syncRaf) {
        syncRaf = requestAnimationFrame(() => {
          syncRaf = 0;
          syncFromScroll();
        });
      }
    }

    function closeContents() {
      if (!contentsMenu || !contentsToggle) return;
      contentsMenu.hidden = true;
      contentsToggle.setAttribute('aria-expanded', 'false');
    }

    function jumpTo(id, {history: hm = 'push', animate = true} = {}) {
      const entry = byId.get(id);
      if (!entry) return;
      closeContents();
      clearTimeout(jumpLockTimer);
      jumpLockTarget = null;
      if (entry.detailsEl && !entry.detailsEl.open) entry.detailsEl.open = true;
      measureStops();
      activateEntry(id, {history: hm, animate, force: true});

      const idx = visibleEntries.findIndex(v => v.id === id);
      if (idx < 0) return;
      const targetTop = Math.max(0, stopTops[idx] - anchorOffset() + 4);
      const smooth = animate && !reducedMotion.matches;

      if (article.dataset.stageView === 'reader') {
        window.scrollTo({top: targetTop, behavior: smooth ? 'smooth' : 'instant'});
      } else {
        const maxTop = Math.max(0, reader.scrollHeight - reader.clientHeight);
        if (Math.abs(Math.min(targetTop, maxTop) - reader.scrollTop) < 2) return;
        jumpLockTarget = id;
        reader.scrollTo({top: targetTop, behavior: smooth ? 'smooth' : 'instant'});
        if (smooth) {
          jumpLockTimer = setTimeout(() => { jumpLockTarget = null; scheduleSync(); }, 850);
        } else {
          requestAnimationFrame(() => { jumpLockTarget = null; });
        }
      }
    }

    reader.addEventListener('scroll', () => { if (!jumpLockTarget) scheduleSync(); }, {passive: true});
    reader.addEventListener('scrollend', () => { if (jumpLockTarget) { clearTimeout(jumpLockTimer); jumpLockTarget = null; scheduleSync(); } });
    window.addEventListener('scroll', () => { if (article.dataset.stageView === 'reader') scheduleSync(); }, {passive: true});
    for (const evt of ['wheel', 'touchstart']) {
      reader.addEventListener(evt, () => {
        if (jumpLockTarget) { clearTimeout(jumpLockTimer); jumpLockTarget = null; }
      }, {passive: true});
    }

    // Contents menu toggle
    if (contentsToggle && contentsMenu) {
      contentsToggle.addEventListener('click', () => {
        const nextOpen = contentsMenu.hidden;
        contentsMenu.hidden = !nextOpen;
        contentsToggle.setAttribute('aria-expanded', String(nextOpen));
      });
      document.addEventListener('pointerdown', ev => {
        if (!contentsMenu.hidden && !ev.target.closest('#stage-contents-menu, #stage-contents-toggle')) {
          closeContents();
        }
      });
    }

    // Inline .stage-xref hover preview + click actions
    function setPreview(targetId) {
      for (const item of mountedPanes.values()) item.adapter.preview?.(targetId);
      prose.querySelectorAll('[data-stage-target]').forEach(el => {
        el.classList.toggle('is-linked', Boolean(targetId && el.dataset.stageTarget === targetId));
      });
    }

    prose.addEventListener('pointerover', ev => {
      const xref = ev.target.closest('[data-stage-target]');
      if (xref) setPreview(xref.dataset.stageTarget);
    });
    prose.addEventListener('pointerout', ev => {
      if (ev.target.closest('[data-stage-target]')) setPreview(null);
    });
    prose.addEventListener('click', ev => {
      const actionEl = ev.target.closest('[data-stage-action]');
      if (actionEl) {
        ev.preventDefault();
        try {
          const actionCue = JSON.parse(actionEl.dataset.stageAction);
          if (actionCue.tab) showPaneTab(actionCue.tab);
          if (article.dataset.stageView === 'reader') applyViewMode('split');
          for (const item of mountedPanes.values()) {
            item.adapter.activate?.(actionCue, byId.get(activeEntryId) || null, {animate: true});
          }
        } catch (_) {}
        return;
      }
      const targetEl = ev.target.closest('[data-stage-target]');
      if (targetEl) {
        ev.preventDefault();
        setPreview(null);
        const targetId = targetEl.dataset.stageTarget;
        if (byId.has(targetId)) {
          jumpTo(targetId);
        } else {
          // Direct SVG region jump even when there is no dedicated heading with that id
          for (const item of mountedPanes.values()) {
            item.adapter.activate?.({region: targetId}, byId.get(activeEntryId) || null, {animate: true});
          }
        }
      }
    });

    // Draggable Splitter
    if (splitter) {
      let dragging = false;
      splitter.addEventListener('pointerdown', ev => {
        dragging = true;
        splitter.setPointerCapture(ev.pointerId);
      });
      splitter.addEventListener('pointermove', ev => {
        if (!dragging) return;
        const r = article.getBoundingClientRect();
        if (mobileMedia.matches) {
          const pct = clamp(((ev.clientY - r.top) / Math.max(1, r.height)) * 100, 20, 75);
          article.style.setProperty('--split-y', pct.toFixed(1) + '%');
        } else {
          const pct = clamp(((ev.clientX - r.left) / Math.max(1, r.width)) * 100, 25, 75);
          article.style.setProperty('--split-x', pct.toFixed(1) + '%');
        }
      });
      splitter.addEventListener('pointerup', () => { dragging = false; });
      splitter.addEventListener('dblclick', () => {
        article.style.setProperty('--split-x', config.split + '%');
        article.style.setProperty('--split-y', config.mobileSplit + '%');
      });
      splitter.addEventListener('keydown', ev => {
        const delta = {ArrowLeft: -3, ArrowRight: 3, ArrowUp: -3, ArrowDown: 3}[ev.key];
        if (!delta) return;
        ev.preventDefault();
        const prop = mobileMedia.matches ? '--split-y' : '--split-x';
        const fallback = mobileMedia.matches ? config.mobileSplit : config.split;
        const cur = parseFloat(article.style.getPropertyValue(prop)) || fallback;
        article.style.setProperty(prop, clamp(cur + delta, 20, 75) + '%');
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', ev => {
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (ev.key === 'Escape') {
        if (contentsMenu && !contentsMenu.hidden) { ev.preventDefault(); closeContents(); return; }
        if (article.dataset.stageView === 'stage') { ev.preventDefault(); applyViewMode('split'); return; }
        for (const item of mountedPanes.values()) {
          if (item.adapter.resetOrResume?.()) { ev.preventDefault(); return; }
        }
      }
    });

    // Autoplay transport
    const transportEl = document.getElementById('stage-transport');
    const tpPlayBtn = document.getElementById('stage-tp-play');
    const tpPrevBtn = document.getElementById('stage-tp-prev');
    const tpNextBtn = document.getElementById('stage-tp-next');
    const tpLabel = document.getElementById('stage-tp-label');
    const tpCount = document.getElementById('stage-tp-count');
    const tpBar = document.getElementById('stage-tp-bar');
    const majorSections = entries.filter(e => e.kind === 'section');
    let playing = false, playTimer = 0, playStart = 0, playDur = 8000;

    function updateTransportUI() {
      if (!config.autoplay || !transportEl) return;
      const cur = byId.get(activeEntryId);
      const secId = cur?.parent || cur?.id;
      const idx = Math.max(0, majorSections.findIndex(s => s.id === secId));
      const pad = n => String(n).padStart(2, '0');
      if (tpCount) tpCount.textContent = `${pad(idx + 1)} / ${pad(Math.max(1, majorSections.length))}`;
      if (tpLabel) tpLabel.textContent = majorSections[idx]?.title || '';
    }

    function scheduleAutoplay() {
      clearTimeout(playTimer);
      if (!playing || !majorSections.length) return;
      const cur = byId.get(activeEntryId);
      const secId = cur?.parent || cur?.id;
      const idx = Math.max(0, majorSections.findIndex(s => s.id === secId));
      const dwellSec = Number(majorSections[idx]?.cue?.dwell) || config.dwell || 8;
      playDur = dwellSec * 1000;
      playStart = performance.now();
      playTimer = setTimeout(() => {
        const nextIdx = idx + 1;
        if (nextIdx < majorSections.length) jumpTo(majorSections[nextIdx].id);
        else if (config.loop) jumpTo(majorSections[0].id);
        else { setPlaying(false); return; }
        scheduleAutoplay();
      }, playDur);
      const tickBar = () => {
        if (!playing) { if (tpBar) tpBar.style.width = '0%'; return; }
        if (tpBar) tpBar.style.width = Math.min(100, ((performance.now() - playStart) / playDur) * 100) + '%';
        requestAnimationFrame(tickBar);
      };
      requestAnimationFrame(tickBar);
    }

    function setPlaying(on) {
      playing = Boolean(on);
      if (tpPlayBtn) tpPlayBtn.textContent = playing ? (zh ? '暂停' : 'Pause') : (zh ? '播放' : 'Play');
      if (playing) scheduleAutoplay();
      else clearTimeout(playTimer);
    }

    if (config.autoplay && transportEl) {
      transportEl.hidden = false;
      tpPlayBtn?.addEventListener('click', () => setPlaying(!playing));
      tpPrevBtn?.addEventListener('click', () => {
        const cur = byId.get(activeEntryId);
        const idx = Math.max(0, majorSections.findIndex(s => s.id === (cur?.parent || cur?.id)) - 1);
        if (majorSections[idx]) jumpTo(majorSections[idx].id);
      });
      tpNextBtn?.addEventListener('click', () => {
        const cur = byId.get(activeEntryId);
        const idx = Math.min(majorSections.length - 1, majorSections.findIndex(s => s.id === (cur?.parent || cur?.id)) + 1);
        if (majorSections[idx]) jumpTo(majorSections[idx].id);
      });
    }

    // Sync BlackCat dark/light theme changes across all adapters
    document.documentElement.addEventListener('blackcat:themechange', ev => {
      const theme = ev.detail?.theme || (isLightTheme() ? 'light' : 'dark');
      for (const item of mountedPanes.values()) item.adapter.setTheme?.(theme);
    });

    // Initial boot & deep-link hash resolution
    applyViewMode(config.defaultView || 'split');
    if (window.ResizeObserver) {
      new ResizeObserver(() => measureStops()).observe(prose);
      new ResizeObserver(() => measureStops()).observe(reader);
    }
    window.addEventListener('hashchange', () => {
      const rawHash = decodeURIComponent(location.hash.slice(1)).split('/').pop();
      if (rawHash && byId.has(rawHash)) jumpTo(rawHash, {history: 'none', animate: false});
    });

    measureStops();
    const initialHash = decodeURIComponent(location.hash.slice(1)).split('/').pop();
    if (initialHash && byId.has(initialHash)) {
      jumpTo(initialHash, {history: 'none', animate: false});
    } else if (entries.length) {
      activateEntry(entries[0].id, {animate: false, history: 'none', force: true});
    } else {
      // Stage post with zero h2/h3 headings still activates its initial cue cleanly
      for (const item of mountedPanes.values()) {
        item.adapter.activate?.(initialCue || {}, null, {animate: false});
      }
    }

    if (config.autoplay === 'on' && !reducedMotion.matches) setPlaying(true);

    activeController = {
      config,
      entries: () => entries.map(e => ({id: e.id, kind: e.kind, parent: e.parent, title: e.title, cue: e.cue})),
      jumpTo,
      setViewMode: applyViewMode,
      showPaneTab,
      state: () => ({
        viewMode: article.dataset.stageView,
        activeEntryId,
        activePaneId,
        panes: Object.fromEntries(Array.from(mountedPanes.entries()).map(([id, p]) => [id, p.adapter.getState?.() || {}]))
      })
    };
    document.documentElement.dataset.articleStageReady = 'true';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootStage, {once: true});
  } else {
    bootStage();
  }
})();

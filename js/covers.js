/* BlackCat photo covers. No dependencies, uploads, analytics or animation. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root && root.document) {
    root.BlackCatCovers = api;
    if (!root.document.querySelector("[data-cover-studio]")) api.boot(root.document);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function bounded(value, fallback, min, max) {
    const n = value === "" || value == null ? NaN : Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }
  function options(value) {
    const o = value || {};
    return {
      columns: Math.round(bounded(o.columns, 96, 32, 160)),
      gap: bounded(o.gap, 0.12, 0, 0.3),
      contrast: bounded(o.contrast, 1.1, 0.5, 2),
      brightness: bounded(o.brightness, 1, 0.5, 1.5),
      focalX: bounded(o.focalX, 0.5, 0, 1),
      focalY: bounded(o.focalY, 0.5, 0, 1),
      dither: bounded(o.dither, 0.2, 0, 1)
    };
  }
  function cropRect(width, height, ratio, x, y) {
    if (![width, height, ratio].every(n => Number.isFinite(n) && n > 0)) {
      throw new RangeError("Image dimensions and aspect ratio must be positive.");
    }
    const w = Math.min(width, height * ratio);
    const h = w / ratio;
    // Focal point, not a percentage of the leftover crop: center the subject when possible.
    return {
      x: Math.max(0, Math.min(width - w, width * bounded(x, 0.5, 0, 1) - w / 2)),
      y: Math.max(0, Math.min(height - h, height * bounded(y, 0.5, 0, 1) - h / 2)),
      width: w, height: h
    };
  }
  function tone(r, g, b, alpha, x, y, o) {
    // Perceptual luma approximation; composite transparency onto the site's black paper.
    let v = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 * alpha / 255;
    v = ((v - 0.5) * o.contrast + 0.5) * o.brightness;
    v += ((BAYER[(y % 4) * 4 + x % 4] + 0.5) / 16 - 0.5) * o.dither / 7;
    const level = Math.round(Math.max(0, Math.min(1, v)) * 7);
    return Math.round(16 + level * 214 / 7);
  }
  function draw(canvas, image, settings, ratio, outputWidth) {
    const o = options(settings);
    const iw = image.naturalWidth || image.width;
    const ih = image.naturalHeight || image.height;
    const crop = cropRect(iw, ih, ratio, o.focalX, o.focalY);
    const cols = o.columns;
    const rows = Math.max(1, Math.round(cols / ratio));
    const sample = canvas.ownerDocument.createElement("canvas");
    sample.width = cols;
    sample.height = rows;
    const s = sample.getContext("2d", { willReadFrequently: true });
    if (!s) throw new Error("Canvas is unavailable.");
    s.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, cols, rows);
    // Read before touching the visible canvas: a CORS failure cannot erase the fallback.
    const pixels = s.getImageData(0, 0, cols, rows).data;
    canvas.width = Math.round(bounded(outputWidth, 1200, 160, 2400));
    canvas.height = Math.round(canvas.width / ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable.");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const gray = tone(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3], x, y, o);
        ctx.fillStyle = "rgb(" + gray + "," + gray + "," + gray + ")";
        const left = Math.round(x * canvas.width / cols);
        const top = Math.round(y * canvas.height / rows);
        const right = Math.round((x + 1 - o.gap) * canvas.width / cols);
        const bottom = Math.round((y + 1 - o.gap) * canvas.height / rows);
        ctx.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
      }
    }
    return canvas;
  }
  function pathKey(value, base) {
    try {
      const url = new URL(value, base);
      let path = decodeURI(url.pathname).replace(/\/index\.html$/, "/");
      return path.endsWith("/") ? path : path + "/";
    } catch (_) { return null; }
  }
  function localSource(value, base) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
      const url = new URL(value, base);
      const origin = new URL(base).origin;
      return /^https?:$/.test(url.protocol) && url.origin === origin ? url.href : null;
    } catch (_) { return null; }
  }
  function layoutRatio(className, width, height) {
    const cls = String(className || "");
    if (cls.includes("pixel-banner--card")) {
      return width > 0 && height > 0 ? width / height : 4 / 3;
    }
    if (cls.includes("pixel-banner--hero")) return 6;
    if (cls.includes("pixel-banner--featured") || cls.includes("pixel-banner--cover")) return 3;
    if (cls.includes("pixel-banner--rule")) return 8;
    return 3;
  }
  function hashSeed(str) {
    let h = 2166136261;
    const s = String(str || "simplism");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Same 8-level tiles, gap and dither as a Cover Studio photograph.
  function paintSeed(canvas) {
    if (!canvas || canvas.dataset.coverReady === "true" || canvas.dataset.coverManaged === "true") return;
    const card = canvas.classList.contains("pixel-banner--card");
    canvas.style.width = "100%";
    canvas.style.height = card ? "100%" : "auto";
    const parent = canvas.parentElement;
    const boxW = canvas.clientWidth || (parent ? parent.clientWidth : 0);
    const boxH = canvas.clientHeight || (card && parent ? parent.clientHeight : 0);
    const ratio = boxW > 0 && boxH > 0
      ? boxW / boxH
      : layoutRatio(canvas.className, parent ? parent.clientWidth : 0, parent ? parent.clientHeight : 0);
    const o = options({
      columns: canvas.classList.contains("pixel-banner--card") ? 48 : 96,
      gap: 0.12, contrast: 1.1, brightness: 1, dither: 0.2
    });
    const cols = o.columns;
    const rows = Math.max(1, Math.round(cols / ratio));
    const view = canvas.ownerDocument.defaultView || window;
    const dpr = Math.min(view.devicePixelRatio || 1, 2);
    const cssW = boxW || canvas.clientWidth || 960;
    canvas.width = Math.round(Math.min(1600, Math.max(160, cssW * dpr)));
    canvas.height = Math.max(1, Math.round(canvas.width / ratio));
    canvas.style.width = "100%";
    canvas.style.height = canvas.classList.contains("pixel-banner--card") ? "100%" : "auto";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rand = mulberry32(hashSeed(canvas.dataset.seed));
    const cx = cols * (0.28 + rand() * 0.44);
    const cy = rows * (0.28 + rand() * 0.44);
    const sx = 2.2 + rand() * 3.4;
    const sy = 2.8 + rand() * 4.2;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / cols;
        const dy = (y - cy) / rows;
        const radial = Math.exp(-(dx * dx * sx + dy * dy * sy));
        const byte = Math.round(Math.max(0, Math.min(1, 0.08 + radial * 0.9)) * 255);
        const gray = tone(byte, byte, byte, 255, x, y, o);
        ctx.fillStyle = "rgb(" + gray + "," + gray + "," + gray + ")";
        const left = Math.round(x * canvas.width / cols);
        const top = Math.round(y * canvas.height / rows);
        const right = Math.round((x + 1 - o.gap) * canvas.width / cols);
        const bottom = Math.round((y + 1 - o.gap) * canvas.height / rows);
        ctx.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
      }
    }
    canvas.dataset.coverField = "studio";
  }
  function boot(doc) {
    const win = doc.defaultView;
    const script = doc.currentScript;
    const base = new URL("../", script ? script.src : doc.baseURI);
    const nodes = Array.from(doc.querySelectorAll(
      ".pixel-banner--hero, .pixel-banner--featured, .pixel-banner--card, .pixel-banner--cover"
    ));
    nodes.forEach(paintSeed);
    const jobs = new Map();
    const images = new Map();
    function load(src) {
      if (!images.has(src)) images.set(src, new Promise((resolve, reject) => {
        const image = new win.Image();
        image.decoding = "async";
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Cover image unavailable."));
        image.src = src;
      }));
      return images.get(src);
    }
    function paint(node, job) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || !job.image) return;
      const ratio = rect.width / rect.height;
      const signature = Math.round(rect.width) + ":" + Math.round(rect.height);
      if (job.signature === signature) return;
      try {
        draw(node, job.image, job.config, ratio, Math.min(1600, rect.width * Math.min(win.devicePixelRatio || 1, 2)));
        node.dataset.coverReady = "true";
        node.style.visibility = "visible";
        job.signature = signature;
        if (job.original) job.original.hidden = true;
        // Media links are decorative duplicates of an adjacent title. Article art may have alt text.
        if (!node.parentElement.closest('[aria-hidden="true"]') && job.config.alt) {
          node.removeAttribute("aria-hidden");
          node.setAttribute("role", "img");
          node.setAttribute("aria-label", String(job.config.alt));
        }
      } catch (_) {
        // Bad decode, CORS, or unavailable canvas: retain the existing art/photo.
        if (job.original) node.remove();
      }
    }
    function begin(node) {
      const job = jobs.get(node);
      if (!job || job.started) return;
      job.started = true;
      load(job.src).then(image => {
        job.image = image;
        paint(node, job);
        if (resize) resize.observe(node);
      }).catch(() => { if (job.original) node.remove(); });
    }
    const resize = win.ResizeObserver ? new win.ResizeObserver(entries => {
      entries.forEach(entry => {
        const job = jobs.get(entry.target);
        if (job) paint(entry.target, job);
      });
    }) : null;
    const visible = win.IntersectionObserver ? new win.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { visible.unobserve(entry.target); begin(entry.target); }
      });
    }, { rootMargin: "240px" }) : null;
    function register(node, config, original) {
      if (!config || typeof config !== "object" || jobs.has(node)) return;
      const src = localSource(config.src, base.href);
      if (!src) return;
      jobs.set(node, { config, src, original, image: null, signature: "" });
      if (visible && node.closest(".card-media")) visible.observe(node);
      else begin(node);
    }
    // Existing Hexo cover <img> output also works; body figures are never selected.
    doc.querySelectorAll(".card-media img, .featured-media img, .post-cover img").forEach(image => {
      if (image.dataset.coverStyle === "original" || !localSource(image.getAttribute("src"), doc.baseURI)) return;
      const node = doc.createElement("canvas");
      const card = image.closest(".card-media");
      node.className = "pixel-banner " + (card ? "pixel-banner--card" : image.closest(".post-cover") ? "pixel-banner--cover" : "pixel-banner--featured");
      node.setAttribute("aria-hidden", "true");
      node.dataset.coverManaged = "true";
      node.style.visibility = "hidden";
      image.after(node);
      let configured = {};
      try { configured = JSON.parse(image.dataset.coverOptions || "{}"); } catch (_) { /* Defaults. */ }
      register(node, Object.assign({}, options(configured), {
        src: new URL(image.getAttribute("src"), doc.baseURI).href, alt: image.alt
      }), image);
    });
    if (nodes.length) win.fetch(new URL("covers.json", base).href)
      .then(response => {
        if (!response.ok) throw new Error("Cover configuration unavailable.");
        return response.json();
      })
      .then(manifest => {
        if (!manifest || manifest.version !== 1 || !manifest.covers || typeof manifest.covers !== "object") return;
        const entries = Object.create(null);
        Object.keys(manifest.covers).forEach(key => {
          const normalized = key === "hero" ? key : pathKey(key, base.href);
          if (normalized) entries[normalized] = manifest.covers[key];
        });
        nodes.forEach(node => {
          const link = node.closest("a.card-media, a.featured-media");
          const key = node.matches(".pixel-banner--hero") ? "hero" : pathKey(link ? link.href : (doc.querySelector('link[rel="canonical"]') || {}).href || win.location.href, base.href);
          register(node, Object.prototype.hasOwnProperty.call(entries, key) ? entries[key] : null);
        });
      }).catch(() => {}); // Keep deterministic mosaics when unconfigured/offline.
    if (!resize) win.addEventListener("resize", () => jobs.forEach((job, node) => paint(node, job)));
    const prose = doc.querySelector(".post .prose");
    if (prose) {
      let pending = 0;
      function focusScrollers() {
        win.cancelAnimationFrame(pending);
        pending = win.requestAnimationFrame(() => {
          prose.querySelectorAll(".table-scroll, .highlight pre, pre:not(.mermaid), mjx-container[display='true']").forEach(node => {
            if (node.closest(".highlight") && node.tagName !== "PRE") return;
            const overflows = node.scrollWidth > node.clientWidth + 8;
            if (overflows && !node.hasAttribute("tabindex")) {
              node.tabIndex = 0; node.dataset.coverScrollFocus = "true";
            } else if (!overflows && node.dataset.coverScrollFocus === "true") {
              node.removeAttribute("tabindex"); delete node.dataset.coverScrollFocus;
            }
          });
        });
      }
      focusScrollers();
      if (win.MutationObserver) new win.MutationObserver(focusScrollers).observe(prose, { childList: true, subtree: true });
      win.addEventListener("resize", focusScrollers);
    }
    if (prose && !doc.querySelector(".article-outline")) {
      const headings = Array.from(prose.querySelectorAll("h2, h3")).filter(h => !h.closest("details, .mermaid, .source-block"));
      if (headings.length >= 4) {
        const details = doc.createElement("details");
        details.className = "article-outline";
        const summary = doc.createElement("summary");
        const lang = (doc.documentElement.lang || "").toLowerCase();
        summary.textContent = lang.startsWith("zh") ? "目录" : "Contents";
        if (win.matchMedia && win.matchMedia("(min-width: 960px)").matches) details.open = true;
        const nav = doc.createElement("nav");
        nav.setAttribute("aria-label", lang.startsWith("zh") ? "目录" : "Article sections");
        const list = doc.createElement("ul");
        headings.forEach((heading, index) => {
          if (!heading.id) {
            let id = "section-" + (index + 1);
            while (doc.getElementById(id)) id += "-";
            heading.id = id;
          }
          const li = doc.createElement("li");
          li.className = heading.tagName === "H3" ? "outline-subsection" : "";
          const a = doc.createElement("a");
          a.href = "#" + encodeURIComponent(heading.id);
          a.textContent = heading.textContent.trim();
          li.append(a); list.append(li);
        });
        nav.append(list); details.append(summary, nav); prose.before(details);
      }
    }
    if (prose) {
      const bar = doc.createElement("div");
      bar.className = "read-progress";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", langLabel(doc));
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", "0");
      const fill = doc.createElement("span");
      bar.append(fill);
      doc.body.append(bar);
      const tick = () => {
        const start = prose.getBoundingClientRect().top + win.scrollY;
        const span = Math.max(1, prose.offsetHeight - win.innerHeight * 0.35);
        const value = Math.max(0, Math.min(1, (win.scrollY - start) / span));
        fill.style.transform = "scaleX(" + value + ")";
        bar.setAttribute("aria-valuenow", String(Math.round(value * 100)));
      };
      tick();
      win.addEventListener("scroll", tick, { passive: true });
      win.addEventListener("resize", tick);
    }
    let seedTimer = 0;
    win.addEventListener("resize", () => {
      win.clearTimeout(seedTimer);
      seedTimer = win.setTimeout(() => {
        doc.querySelectorAll(".pixel-banner[data-cover-field='studio']").forEach(node => {
          if (node.dataset.coverReady === "true") return;
          paintSeed(node);
        });
      }, 120);
    });
  }
  function langLabel(doc) {
    return (doc.documentElement.lang || "").toLowerCase().startsWith("zh") ? "阅读进度" : "Reading progress";
  }
  return { options, cropRect, tone, draw, pathKey, localSource, layoutRatio, paintSeed, boot };
});

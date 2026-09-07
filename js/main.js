(function () {
  "use strict";

  function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
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

  function paint(canvas) {
    const cols = Number(canvas.dataset.cols) || 48;
    let rows = Number(canvas.dataset.rows) || 12;
    const rand = mulberry32(hashSeed(canvas.dataset.seed));
    const fill = canvas.classList.contains("pixel-banner--card");
    const parent = canvas.parentElement;
    const cssW = (parent && parent.clientWidth) || canvas.clientWidth || 656;
    if (fill && parent && parent.clientHeight && cssW) {
      rows = Math.max(10, Math.round(cols * (parent.clientHeight / cssW)));
    }
    const gap = 2;
    const cell = 8;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cols * (cell + gap) - gap;
    const h = rows * (cell + gap) - gap;
    const scale = cssW / w;
    canvas.width = Math.round(w * scale * dpr);
    canvas.height = Math.round(h * scale * dpr);
    canvas.style.width = "100%";
    canvas.style.height = fill ? "100%" : "auto";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const cx = cols * (0.22 + rand() * 0.56);
    const cy = rows * (0.22 + rand() * 0.56);
    const sx = 2.4 + rand() * 4.2;
    const sy = 3.2 + rand() * 5.5;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const dx = (x - cx) / cols;
        const dy = (y - cy) / rows;
        const radial = Math.exp(-(dx * dx * sx + dy * dy * sy));
        const n = rand();
        let v = 0.06 + radial * 0.82 + (n - 0.5) * 0.24;
        v = Math.max(0, Math.min(1, v));
        const g = Math.round(16 + v * 214);
        ctx.fillStyle = "rgb(" + g + "," + g + "," + g + ")";
        ctx.fillRect(x * (cell + gap), y * (cell + gap), cell, cell);
      }
    }
  }

  function paintAll() {
    document.querySelectorAll(".pixel-banner").forEach(paint);
  }

  paintAll();
  let timer = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(timer);
    timer = window.setTimeout(paintAll, 120);
  });

  const results = document.querySelector(".search-results");
  const input = document.querySelector(".search-input");
  const status = document.querySelector(".search-status");
  if (results && input) {
    const endpoint = results.getAttribute("data-index");
    let index = [];
    fetch(endpoint)
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        index = data || [];
        const params = new URLSearchParams(window.location.search);
        const initial = params.get("q");
        if (initial) {
          input.value = initial;
          render(initial);
        }
      })
      .catch(function () {
        if (status) {
          status.hidden = false;
          status.textContent = "Search index unavailable.";
        }
      });

    function render(q) {
      const query = (q || "").trim().toLowerCase();
      results.innerHTML = "";
      if (!query) {
        if (status) status.hidden = true;
        return;
      }
      const hits = index.filter(function (item) {
        return (
          (item.title || "").toLowerCase().indexOf(query) !== -1 ||
          (item.excerpt || "").toLowerCase().indexOf(query) !== -1 ||
          (item.category || "").toLowerCase().indexOf(query) !== -1
        );
      });
      if (status) {
        status.hidden = false;
        status.textContent = hits.length
          ? hits.length + " note" + (hits.length === 1 ? "" : "s")
          : "No matching notes.";
      }
      hits.forEach(function (item) {
        const a = document.createElement("a");
        a.className = "row";
        a.href = item.url;
        a.innerHTML =
          '<span class="row-title"></span><span class="row-meta"><span></span><span class="row-arrow" aria-hidden="true">›</span></span>';
        a.querySelector(".row-title").textContent = item.title;
        a.querySelector(".row-meta span").textContent = item.date;
        results.appendChild(a);
      });
    }

    input.addEventListener("input", function () {
      render(input.value);
    });
    const form = document.querySelector(".search-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        render(input.value);
      });
    }
  }
})();

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
    if (canvas.dataset.coverReady === "true" || canvas.dataset.coverManaged === "true" || canvas.dataset.coverField === "studio") return;
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
    if (!ctx) return;
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

  function codeText(block) {
    const code = block.querySelector("code");
    return (code ? code.innerText : block.innerText).replace(/\n$/, "");
  }
  function writeClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) resolve();
      else reject(new Error("copy failed"));
    });
  }
  function mountCodeBlock(block) {
    if (block.querySelector(":scope > .code-bar")) return;
    const code = block.querySelector("code");
    const names = Array.from((code || block).classList);
    let language = names.find(function (name) { return name !== "hljs" && name !== "highlight" && name !== "code" && name !== "literal-block"; }) || "";
    if (language.indexOf("literal-block--") === 0) {
      const kind = language.replace("literal-block--", "");
      language = kind === "code" ? "pseudocode" : kind === "tree" ? "tree" : kind === "aligned" ? "output" : kind;
    }
    const zh = (document.documentElement.lang || "").toLowerCase().indexOf("zh") === 0;
    const copyIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12"/><path d="M4 16V4h12"/></svg>';
    const doneIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>';
    const idleLabel = zh ? "复制代码" : "Copy code";
    const doneLabel = zh ? "已复制" : "Copied";
    const bar = document.createElement("div");
    bar.className = "code-bar";
    if (language) {
      const label = document.createElement("span");
      label.className = "code-lang";
      label.textContent = language;
      bar.appendChild(label);
    } else {
      bar.appendChild(document.createElement("span"));
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    button.innerHTML = copyIcon;
    button.setAttribute("aria-label", idleLabel);
    button.addEventListener("click", function () {
      writeClipboard(codeText(block)).then(function () {
        button.innerHTML = doneIcon;
        button.setAttribute("aria-label", doneLabel);
        window.setTimeout(function () {
          button.innerHTML = copyIcon;
          button.setAttribute("aria-label", idleLabel);
        }, 1600);
      }).catch(function () {
        button.setAttribute("aria-label", zh ? "复制失败" : "Copy failed");
      });
    });
    bar.appendChild(button);
    block.insertBefore(bar, block.firstChild);
  }
  document.querySelectorAll(".prose figure.highlight").forEach(mountCodeBlock);
  document.querySelectorAll(".prose pre").forEach(function (node) {
    if (node.classList.contains("mermaid") || node.closest("figure.highlight")) return;
    mountCodeBlock(node);
  });

  paintAll();
  let timer = 0;
  window.addEventListener("resize", function () {
    window.clearTimeout(timer);
    timer = window.setTimeout(paintAll, 120);
  });

  function bootMermaid() {
    const nodes = Array.from(document.querySelectorAll("pre.mermaid"));
    if (!nodes.length) return;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js";
    function fallback(node, source) {
      const details = document.createElement('details');
      details.className = 'diagram-source';
      const summary = document.createElement('summary');
      summary.textContent = '图表未能加载，查看原始内容';
      const pre = document.createElement('pre');
      pre.textContent = source;
      details.append(summary, pre);
      node.replaceChildren(details);
      node.dataset.diagramState = 'error';
    }
    script.onerror = function () {
      nodes.forEach(function (node) { fallback(node, node.textContent); });
    };
    script.onload = async function () {
      if (!window.mermaid) return;
      const ink = "#e6e6e6";
      const mute = "rgba(230,230,230,0.5)";
      const fill = "#141414";
      const paper = "#000000";
      window.mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        securityLevel: "loose",
        htmlLabels: true,
        fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, Noto Sans SC, Microsoft YaHei, sans-serif",
        fontSize: "14px",
        themeVariables: {
          darkMode: true,
          background: paper,
          fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, Noto Sans SC, Microsoft YaHei, sans-serif",
          fontSize: "14px",
          primaryColor: fill,
          primaryTextColor: ink,
          primaryBorderColor: mute,
          secondaryColor: "#101010",
          secondaryTextColor: ink,
          secondaryBorderColor: mute,
          tertiaryColor: "#0a0a0a",
          tertiaryTextColor: ink,
          tertiaryBorderColor: "rgba(230,230,230,0.22)",
          lineColor: mute,
          textColor: ink,
          mainBkg: fill,
          nodeBkg: fill,
          nodeBorder: mute,
          clusterBkg: "#0a0a0a",
          clusterBorder: "rgba(230,230,230,0.22)",
          titleColor: ink,
          edgeLabelBackground: paper,
          actorBkg: fill,
          actorBorder: mute,
          actorTextColor: ink,
          actorLineColor: mute,
          signalColor: mute,
          signalTextColor: ink,
          labelBoxBkgColor: fill,
          labelBoxBorderColor: mute,
          labelTextColor: ink,
          loopTextColor: ink,
          noteBkgColor: fill,
          noteTextColor: ink,
          noteBorderColor: mute,
          activationBkgColor: "#1a1a1a",
          sequenceNumberColor: paper
        },
        flowchart: {
          htmlLabels: true,
          curve: "linear",
          padding: 22,
          nodeSpacing: 36,
          rankSpacing: 72,
          wrappingWidth: 220,
          diagramPadding: 12,
          useMaxWidth: true
        },
        sequence: {
          actorMargin: 28,
          boxMargin: 8,
          messageMargin: 36,
          useMaxWidth: true
        },
        timeline: {
          useMaxWidth: true,
          padding: 16
        }
      });
      await document.fonts.ready;
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index];
        const source = node.textContent;
        const figure = document.createElement('figure');
        figure.className = 'mermaid';
        node.replaceWith(figure);
        try {
          // Mermaid must measure labels under the same prose styles used for
          // display. Measuring in its default body container clips wrapped text.
          let measurement = figure;
          let temporary;
          if (!figure.getBoundingClientRect().height && figure.closest('details:not([open])')) {
            temporary = document.createElement('div');
            temporary.className = 'prose';
            temporary.style.cssText = 'position:absolute;visibility:hidden;left:-10000px;width:760px';
            measurement = document.createElement('figure');
            measurement.className = 'mermaid';
            temporary.appendChild(measurement);
            document.body.appendChild(temporary);
          }
          let result;
          try {
            result = await window.mermaid.render('article-diagram-' + index, source, measurement);
          } finally {
            if (temporary) temporary.remove();
          }
          figure.innerHTML = result.svg;
          if (result.bindFunctions) result.bindFunctions(figure);
          figure.querySelectorAll('rect').forEach(function (rect) {
            rect.setAttribute("rx", "0");
            rect.setAttribute("ry", "0");
          });
          figure.dataset.diagramState = 'ready';
          if (window.ReadingUI) window.ReadingUI.enhanceDiagram(figure);
        } catch (error) {
          fallback(figure, source);
        }
      }
    };
    document.head.appendChild(script);
  }
  bootMermaid();

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

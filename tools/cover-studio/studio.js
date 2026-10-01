(function () {
  "use strict";
  const engine = window.BlackCatCovers;
  const $ = id => document.getElementById(id);
  const base = new URL("../../", document.baseURI);
  const controls = ["columns", "gap", "focalX", "focalY", "contrast", "brightness"];
  let image = null, objectURL = null, generation = 0, manifest = null, frame = 0;
  function settings() {
    return engine.options({ columns: $("columns").value, gap: $("gap").value / 100,
      focalX: $("focalX").value / 100, focalY: $("focalY").value / 100,
      contrast: $("contrast").value / 100, brightness: $("brightness").value / 100,
      invert: $("invert").checked });
  }
  function name() {
    return ($("filename").value.replace(/[^a-zA-Z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "my-cover").toLowerCase();
  }
  function entry() { return Object.assign({ src: base.pathname + "images/covers/" + name() + ".webp" }, settings()); }
  function sync() {
    controls.forEach(id => { $(id + "-value").textContent = $(id).value + (id === "columns" ? " columns" : "%"); });
    $("snippet").value = JSON.stringify({ [$("target").value]: entry() }, null, 2);
    $("download-config").disabled = !image || !manifest;
  }
  function render() {
    sync();
    if (!image) return;
    try {
      const ratio = Number($("ratio").value), o = settings();
      const original = $("original");
      original.width = 1200; original.height = Math.round(1200 / ratio);
      const crop = engine.cropRect(image.naturalWidth, image.naturalHeight, ratio, o.focalX, o.focalY);
      const ctx = original.getContext("2d");
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, original.width, original.height);
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, original.width, original.height);
      engine.draw($("processed"), image, o, ratio, 1200);
      $("status").textContent = image.naturalWidth + " × " + image.naturalHeight + " source · " + o.columns + " columns · 8 gray levels · preview " + $("processed").width + " × " + $("processed").height;
      $("download-source").disabled = false;
      $("download-preview").disabled = false;
    } catch (_) {
      $("status").textContent = "This image could not be processed. Try a smaller JPEG, PNG, WebP or SVG.";
      $("download-source").disabled = $("download-preview").disabled = $("download-config").disabled = true;
    }
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); }
  $("photo").addEventListener("change", function () {
    const token = ++generation;
    const file = this.files[0];
    image = null;
    $("download-source").disabled = $("download-preview").disabled = $("download-config").disabled = true;
    [$("original"), $("processed")].forEach(canvas => { const ctx = canvas.getContext("2d"); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); });
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = null;
    if (!file) { $("status").textContent = "Choose a photograph to see the comparison."; return; }
    if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(file.type) || file.size > 20 * 1024 * 1024) {
      $("status").textContent = "Choose a JPEG, PNG, WebP or SVG under 20 MB."; return;
    }
    $("status").textContent = "Preparing the local preview…";
    objectURL = URL.createObjectURL(file);
    const candidate = new Image();
    candidate.onload = () => {
      if (token !== generation) return;
      if (candidate.naturalWidth * candidate.naturalHeight > 24000000) {
        $("status").textContent = "Please resize this photo to 24 megapixels or fewer first."; return;
      }
      image = candidate; render();
    };
    candidate.onerror = () => { if (token === generation) $("status").textContent = "The image could not be decoded. Try another file."; };
    candidate.src = objectURL;
  });
  controls.forEach(id => $(id).addEventListener("input", schedule));
  $("invert").addEventListener("change", schedule);
  $("ratio").addEventListener("change", schedule);
  $("filename").addEventListener("input", sync);
  $("target").addEventListener("change", () => { $("ratio").value = $("target").value === "hero" ? "6" : "3"; render(); });
  $("reset").addEventListener("click", () => {
    const defaults = { columns: 96, gap: 6, focalX: 50, focalY: 50, contrast: 110, brightness: 100 };
    controls.forEach(id => { $(id).value = defaults[id]; });
    $("invert").checked = false; render();
  });
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  $("download-preview").addEventListener("click", () => {
    $("processed").toBlob(blob => {
      if (blob) download(blob, name() + "-pixel-preview.png");
      else $("status").textContent = "Preview export failed. Try a smaller image.";
    }, "image/png");
  });
  $("download-source").addEventListener("click", () => {
    if (!image) return;
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob || blob.type !== "image/webp") { $("status").textContent = "WebP export is unavailable in this browser. Use a browser with WebP canvas export."; return; }
      download(blob, name() + ".webp");
      $("status").textContent = "Source exported: " + canvas.width + " × " + canvas.height + " · " + Math.ceil(blob.size / 1024) + " KB. Save it in source/images/covers/.";
    }, "image/webp", 0.84);
  });
  $("download-config").addEventListener("click", () => {
    if (!manifest || !image) return;
    const merged = Object.assign({}, manifest, { covers: Object.assign({}, manifest.covers, { [$("target").value]: entry() }) });
    manifest = merged;
    download(new Blob([JSON.stringify(merged, null, 2) + "\n"], { type: "application/json" }), "covers.json");
  });
  fetch(new URL("covers.json", base)).then(response => {
    if (!response.ok) throw new Error("Unavailable"); return response.json();
  }).then(data => {
    if (data.version !== 1 || !data.covers || typeof data.covers !== "object" || Array.isArray(data.covers)) throw new Error("Invalid configuration");
    manifest = data;
    $("config-status").textContent = "Existing cover entries will be preserved. Add this entry to the latest covers.json when publishing concurrent edits.";
    sync();
  }).catch(() => {
    $("config-status").textContent = "Could not load covers.json. Configuration download is disabled to avoid overwriting existing covers. Use the entry above to merge manually.";
  });
  fetch(new URL("search.json", base)).then(response => {
    if (!response.ok) throw new Error("Unavailable"); return response.json();
  }).then(posts => {
    if (!Array.isArray(posts)) return;
    const seen = new Set();
    posts.forEach(post => {
      if (!post || typeof post.url !== "string") return;
      const key = engine.pathKey(post.url, base.href);
      if (!key || seen.has(key)) return;
      seen.add(key);
      const option = document.createElement("option"); option.value = key; option.textContent = post.title || key;
      $("target").append(option);
    });
  }).catch(() => { $("config-status").textContent += " Post list unavailable; the homepage target is still usable."; });
  sync();
})();

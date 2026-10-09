(function () {
  "use strict";

  const button = document.querySelector(".article-share");
  if (!button) return;

  const controls = button.closest(".article-share-controls");
  const status = controls.querySelector(".article-share-status");
  const manual = controls.querySelector(".article-share-manual");
  const field = controls.querySelector(".article-share-link");
  const close = controls.querySelector(".article-share-dismiss");
  const isZh = (document.documentElement.lang || "").toLowerCase().startsWith("zh");
  const labels = isZh ? {
    copied: "链接已复制",
    manual: "请复制下方链接"
  } : {
    copied: "Link copied",
    manual: "Copy the link below"
  };
  const canonical = document.querySelector('link[rel="canonical"]');
  let url;
  try {
    url = new URL(canonical && canonical.href || window.location.href, document.baseURI);
    if (!/^https?:$/.test(url.protocol)) throw new Error("Unsupported article URL");
  } catch (_) {
    url = new URL(window.location.href);
  }
  url.hash = "";
  const link = url.href;
  let statusTimer;

  function clearStatus() {
    clearTimeout(statusTimer);
    status.textContent = "";
  }

  function dismiss() {
    manual.hidden = true;
    clearStatus();
    button.focus({ preventScroll: true });
  }

  function legacyCopy() {
    const focused = document.activeElement;
    const selected = window.getSelection();
    const ranges = selected ? Array.from({ length: selected.rangeCount }, (_, index) => selected.getRangeAt(index).cloneRange()) : [];
    const temporary = document.createElement("textarea");
    temporary.value = link;
    temporary.setAttribute("readonly", "");
    temporary.setAttribute("aria-hidden", "true");
    temporary.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;padding:0;border:0;opacity:0;pointer-events:none;";
    document.body.append(temporary);
    let copied = false;
    try {
      temporary.focus({ preventScroll: true });
      temporary.select();
      temporary.setSelectionRange(0, temporary.value.length);
      copied = typeof document.execCommand === "function" && document.execCommand("copy");
    } catch (_) {
      copied = false;
    } finally {
      temporary.remove();
      if (selected) {
        selected.removeAllRanges();
        ranges.forEach(range => selected.addRange(range));
      }
      if (focused && typeof focused.focus === "function") focused.focus({ preventScroll: true });
    }
    return copied;
  }

  async function copy() {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch (_) {
        // Browsers can deny clipboard permission; retain the older copy fallback.
      }
    }
    return legacyCopy();
  }

  button.hidden = false;
  button.addEventListener("click", async function () {
    if (button.disabled) return;
    const restoreFocus = document.activeElement === button;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    manual.hidden = true;
    clearStatus();
    try {
      if (await copy()) {
        status.textContent = labels.copied;
        statusTimer = setTimeout(clearStatus, 2500);
      } else {
        field.value = link;
        manual.hidden = false;
        status.textContent = labels.manual;
        field.focus({ preventScroll: true });
        field.select();
      }
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (manual.hidden && restoreFocus) button.focus({ preventScroll: true });
    }
  });

  close.addEventListener("click", dismiss);
  manual.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
    }
  });
}());

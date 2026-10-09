(function () {
  "use strict";
  const root = document.documentElement;
  const key = "blackcat-theme";
  const isChinese = (root.lang || "").toLowerCase().startsWith("zh");

  function storedTheme() {
    try {
      const value = localStorage.getItem(key);
      return value === "light" || value === "dark" ? value : null;
    } catch (_) {
      return null;
    }
  }

  function applyTheme(value, persist) {
    const theme = value === "light" ? "light" : "dark";
    const light = theme === "light";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = light ? "#ffffff" : "#000000";
    const scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.content = theme;
    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      button.hidden = false;
      button.setAttribute("aria-label", isChinese ? "白色主题" : "Light theme");
      button.setAttribute("aria-pressed", String(light));
      const next = isChinese
        ? (light ? "切换到黑色主题" : "切换到白色主题")
        : (light ? "Switch to dark theme" : "Switch to light theme");
      button.title = next;
      const label = button.querySelector(".theme-toggle-label");
      if (label) label.textContent = isChinese ? (light ? "黑色" : "白色") : (light ? "Dark" : "Light");
    });
    if (persist) {
      try { localStorage.setItem(key, theme); } catch (_) { /* Selection still works for this page. */ }
    }
    root.dispatchEvent(new CustomEvent("blackcat:themechange", { detail: { theme: theme } }));
  }

  function init() {
    applyTheme(storedTheme() || root.dataset.theme || "dark", false);
    document.querySelectorAll(".theme-toggle").forEach(function (button) {
      button.addEventListener("click", function () {
        applyTheme(root.dataset.theme === "light" ? "dark" : "light", true);
      });
    });
    window.addEventListener("storage", function (event) {
      if (event.key === key) applyTheme(event.newValue, false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();

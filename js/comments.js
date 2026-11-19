(function () {
  "use strict";

  const root = document.getElementById("comments");
  if (!root) return;
  const mount = root.querySelector("[data-comments-mount]");
  if (!mount) return;

  const provider = (root.dataset.commentsProvider || "disqus").toLowerCase();
  let mounted = false;

  function isLightTheme() {
    return document.documentElement.getAttribute("data-theme") !== "dark";
  }

  function renderDisqusNotice() {
    mount.innerHTML = "";
    const box = document.createElement("div");
    box.className = "article-comments-fallback";
    box.textContent = "Comments powered by Disqus (blocked by browser privacy or content-blocking settings).";
    mount.appendChild(box);
  }

  function loadComments() {
    if (mounted) return;
    mounted = true;

    if (provider === "disqus") {
      const shortname = root.dataset.commentsShortname || "";
      if (!shortname) return;
      let thread = document.getElementById("disqus_thread");
      if (!thread) {
        thread = document.createElement("div");
        thread.id = "disqus_thread";
        mount.innerHTML = "";
        mount.appendChild(thread);
      }
      const pageUrl = root.dataset.commentsUrl || window.location.href;
      const pageId = root.dataset.commentsIdentifier || window.location.pathname;
      const pageTitle = root.dataset.commentsTitle || document.title;
      window.disqus_config = function () {
        this.page.url = pageUrl;
        this.page.identifier = pageId;
        this.page.title = pageTitle;
      };
      const s = document.createElement("script");
      s.src = "https://" + shortname + ".disqus.com/embed.js";
      s.async = true;
      s.setAttribute("data-timestamp", String(+new Date()));
      s.onerror = renderDisqusNotice;
      (document.head || document.body).appendChild(s);
      return;
    }

    if (provider === "utterances") {
      const repo = root.dataset.commentsRepo || "";
      if (!repo) return;
      mount.innerHTML = "";
      const s = document.createElement("script");
      s.src = "https://utteranc.es/client.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.setAttribute("repo", repo);
      s.setAttribute("issue-term", root.dataset.commentsIssueTerm || "pathname");
      if (root.dataset.commentsLabel) s.setAttribute("label", root.dataset.commentsLabel);
      s.setAttribute("theme", isLightTheme() ? "github-light" : "github-dark");
      mount.appendChild(s);
      return;
    }

    if (provider === "giscus") {
      const repo = root.dataset.commentsRepo || "";
      const repoId = root.dataset.commentsRepoId || "";
      const categoryId = root.dataset.commentsCategoryId || "";
      if (!repo || !repoId || !categoryId) return;
      mount.innerHTML = "";
      const s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-repo", repo);
      s.setAttribute("data-repo-id", repoId);
      s.setAttribute("data-category", root.dataset.commentsCategory || "General");
      s.setAttribute("data-category-id", categoryId);
      s.setAttribute("data-mapping", root.dataset.commentsIssueTerm || "pathname");
      s.setAttribute("data-strict", "0");
      s.setAttribute("data-reactions-enabled", "1");
      s.setAttribute("data-emit-metadata", "0");
      s.setAttribute("data-input-position", "top");
      s.setAttribute("data-theme", isLightTheme() ? "light" : "noborder_dark");
      s.setAttribute("data-lang", "en");
      mount.appendChild(s);
    }
  }

  function syncTheme() {
    if (!mounted) return;
    if (provider === "disqus" && window.DISQUS && typeof window.DISQUS.reset === "function") {
      try {
        window.DISQUS.reset({ reload: true, config: window.disqus_config });
      } catch (_) {}
    } else if (provider === "utterances") {
      const frame = mount.querySelector("iframe.utterances-frame");
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: "set-theme", theme: isLightTheme() ? "github-light" : "github-dark" }, "https://utteranc.es");
      }
    } else if (provider === "giscus") {
      const frame = mount.querySelector("iframe.giscus-frame");
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ giscus: { setConfig: { theme: isLightTheme() ? "light" : "noborder_dark" } } }, "https://giscus.app");
      }
    }
  }

  document.documentElement.addEventListener("blackcat:themechange", syncTheme);

  if (window.IntersectionObserver) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          io.disconnect();
          loadComments();
        }
      });
    }, { rootMargin: "420px 0px" });
    io.observe(root);
  } else {
    loadComments();
  }
})();

(function () {
  "use strict";
  const disclosures = Array.from(document.querySelectorAll(".series-topics-more"));
  if (!disclosures.length) return;

  disclosures.forEach(function (disclosure) {
    disclosure.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && disclosure.open) {
        event.preventDefault();
        disclosure.open = false;
        disclosure.querySelector("summary").focus({ preventScroll: true });
      }
    });
  });

  document.addEventListener("pointerdown", function (event) {
    disclosures.forEach(function (disclosure) {
      if (disclosure.open && !disclosure.contains(event.target)) disclosure.open = false;
    });
  });
})();

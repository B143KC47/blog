(function () {
  'use strict';
  const closeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  document.querySelectorAll('.micrograd-diagram').forEach(function (figure) {
    const expand = figure.querySelector('.learning-graph-expand');
    const viewport = figure.querySelector('.learning-graph-viewport');
    const panButtons = figure.querySelectorAll('.learning-graph-pan');
    function updatePan() {
      panButtons.forEach(function (button) {
        button.disabled = Number(button.dataset.pan) < 0 ? viewport.scrollLeft < 1
          : viewport.scrollLeft + viewport.clientWidth >= viewport.scrollWidth - 1;
      });
    }
    panButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        viewport.scrollBy({left:Number(button.dataset.pan)*viewport.clientWidth*0.8, behavior:'instant'});
      });
    });
    if (panButtons.length) {
      viewport.addEventListener('scroll', updatePan, {passive:true});
      window.addEventListener('resize', updatePan);
      figure.querySelector('img').addEventListener('load', updatePan);
      updatePan();
    }
    expand.addEventListener('click', function () {
      const dialog = document.createElement('dialog');
      dialog.className = 'learning-graph-dialog';
      const image = figure.querySelector('img');
      dialog.setAttribute('aria-label', image.alt);
      const tools = document.createElement('div');
      tools.className = 'learning-graph-tools';
      const close = document.createElement('button');
      close.className = 'learning-graph-close';
      close.type = 'button';
      close.setAttribute('aria-label', '关闭图形');
      close.innerHTML = closeIcon;
      tools.appendChild(close);
      const viewport = document.createElement('div');
      viewport.className = 'learning-graph-viewport';
      viewport.tabIndex = 0;
      viewport.setAttribute('role', 'region');
      viewport.setAttribute('aria-label', image.alt);
      const fullImage = image.cloneNode();
      fullImage.src = image.currentSrc || image.src;
      viewport.appendChild(fullImage);
      dialog.append(tools, viewport);
      document.body.appendChild(dialog);
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      close.addEventListener('click', function () { dialog.close(); });
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener('close', function () {
        document.body.style.overflow = previousOverflow;
        dialog.remove();
        expand.focus({preventScroll:true});
      }, {once:true});
      dialog.showModal();
      close.focus();
    });
  });

  function stylePlot(elt) {
    const root = elt.closest('.micrograd-plot');
    const calc = elt.__desmosCalc;
    if (!root || !calc || root.dataset.learningReady === 'true') return false;
    root.dataset.learningReady = 'true';
    calc.updateSettings({xAxisMinorSubdivisions:1, yAxisMinorSubdivisions:1, xAxisStep:2, yAxisStep:2, fontSize:16});
    calc.setExpressions(calc.getExpressions().filter(function (expr) { return expr.latex && /^y=/.test(expr.latex); }).map(function (expr, index) {
      return Object.assign({}, expr, {lineWidth:index === 0 ? 3 : 2, lineOpacity:1, lineStyle:index === 0 ? Desmos.Styles.SOLID : Desmos.Styles.DASHED});
    }));
    const reluOnly = root.classList.contains('desmos-graph');
    const bounds = reluOnly ? {left:-4,right:4,bottom:-1.5,top:4.5} : {left:-5,right:5,bottom:-3,top:5};
    calc.setMathBounds(bounds);
    calc.setDefaultState(calc.getState());
    const panel = root.querySelector('.gpt-graph-panel');
    if (panel) {
      const curves = calc.getExpressions().filter(function (expr) { return expr.latex && /^y=/.test(expr.latex); });
      const legend = document.createElement('div');
      legend.className = 'learning-plot-legend';
      curves.forEach(function (expr, index) {
        if (index === 0) return;
        const key = document.createElement('span');
        key.className = 'learning-plot-key' + (index ? ' learning-plot-key--reference' : '');
        // The primary curve already has the article's unchanged title above it.
        const latex = expr.latex;
        const formula = document.createElement('span');
        formula.textContent = '\\(' + latex + '\\)';
        key.appendChild(formula);
        legend.appendChild(key);
      });
      panel.appendChild(legend);
      const resetRow = document.createElement('div');
      resetRow.className = 'learning-plot-reset-row';
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'learning-graph-reset';
      reset.setAttribute('aria-label', '重置图形');
      reset.title = '重置图形';
      reset.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>';
      reset.addEventListener('click', function () {
        root.querySelectorAll('input[data-slider]').forEach(function (input) {
          input.value = input.defaultValue;
          input.dispatchEvent(new Event('input', {bubbles:true}));
        });
        calc.setMathBounds(bounds);
      });
      resetRow.appendChild(reset);
      panel.appendChild(resetRow);
      function typesetLegend() {
        if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([legend]).catch(function () {});
      }
      if (window.MathJax && MathJax.startup && MathJax.startup.promise) MathJax.startup.promise.then(typesetLegend);
      else typesetLegend();
      root.querySelectorAll('input[data-slider]').forEach(function (input) {
        const slider = input.closest('.gpt-slider');
        const label = slider.querySelector('.gpt-slider-row span');
        label.id = root.id + '-label-' + input.dataset.slider;
        input.setAttribute('aria-labelledby', label.id);
      });
    }
    return true;
  }
  document.querySelectorAll('.micrograd-plot').forEach(function (root) {
    const elt = root.querySelector('.gpt-graph-canvas') || root;
    if (stylePlot(elt)) return;
    const observer = new MutationObserver(function () {
      if (stylePlot(elt)) observer.disconnect();
    });
    observer.observe(elt, {childList:true});
  });
})();

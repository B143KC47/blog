(function () {
  'use strict';
  const roots = [...document.querySelectorAll('[data-graph-config]')];
  const namespace = 'http://www.w3.org/2000/svg';
  const states = [];
  let apiPromise;
  function loadDesmos() {
    if (window.Desmos) return Promise.resolve(window.Desmos);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.id = 'desmos-api-script';
      script.src = 'https://www.desmos.com/api/v1.9/calculator.js?apiKey=dcb31709b452b1cf9dc26972add0fda6';
      script.onload = () => window.Desmos ? resolve(window.Desmos) : reject(new Error('Graph library unavailable'));
      script.onerror = () => reject(new Error('Graph library unavailable'));
      document.head.appendChild(script);
    });
    return apiPromise;
  }
  function svgNode(name, attributes, text) {
    const node = document.createElementNS(namespace,name);
    for (const [key,value] of Object.entries(attributes || {})) node.setAttribute(key,value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function boundsFor(root) {
    return root.classList.contains('desmos-graph') ? {left:-4,right:4,bottom:-1.5,top:4.5} : {left:-5,right:5,bottom:-3,top:5};
  }
  function variables(state) {
    return Object.fromEntries(state.config.sliders.map((slider,index) => [slider.varName,Number(state.root.querySelector('[data-slider="' + index + '"]')?.value ?? slider.init)]));
  }
  function tickStep(range) {
    const scale = Math.pow(10, Math.floor(Math.log10(range / 7)));
    return [1,2,5,10].find(value => value * scale >= range / 7) * scale;
  }
  function draw(state) {
    if (state.calc || !state.svg || !state.canvas.clientWidth || !state.canvas.clientHeight) return;
    const width = state.canvas.clientWidth, height = state.canvas.clientHeight, box = state.bounds;
    const x = value => (value-box.left)/(box.right-box.left)*width;
    const y = value => (box.top-value)/(box.top-box.bottom)*height;
    state.svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const grid = svgNode('g');
    const stepX = tickStep(box.right-box.left), stepY = tickStep(box.top-box.bottom);
    for (let value = Math.ceil(box.left/stepX)*stepX; value<=box.right; value+=stepX) {
      grid.appendChild(svgNode('line',{x1:x(value),x2:x(value),y1:0,y2:height,class:Math.abs(value)<stepX/100 ? 'graph-local-axis' : 'graph-local-grid'}));
      if (Math.abs(value)>stepX/100) grid.appendChild(svgNode('text',{x:x(value)+3,y:Math.min(height-5,Math.max(14,y(0)+16)),class:'graph-local-label'},Number(value.toPrecision(5))));
    }
    for (let value = Math.ceil(box.bottom/stepY)*stepY; value<=box.top; value+=stepY) {
      grid.appendChild(svgNode('line',{x1:0,x2:width,y1:y(value),y2:y(value),class:Math.abs(value)<stepY/100 ? 'graph-local-axis' : 'graph-local-grid'}));
      if (Math.abs(value)>stepY/100) grid.appendChild(svgNode('text',{x:Math.min(width-28,Math.max(4,x(0)+5)),y:y(value)-4,class:'graph-local-label'},Number(value.toPrecision(5))));
    }
    const curves = svgNode('g'), values = variables(state), samples = Math.min(1200,Math.max(320,Math.ceil(width)));
    state.functions.forEach((fn,index) => {
      if (!fn) return;
      let d = '', connected = false, previousY;
      for (let i=0;i<=samples;i++) {
        const valueX = box.left + i/samples*(box.right-box.left);
        const valueY = fn(valueX,values), px = x(valueX), py = y(valueY);
        if (!Number.isFinite(py) || Math.abs(py)>height*20) { connected=false; continue; }
        if (previousY !== undefined && Math.abs(py-previousY)>height*2) connected=false;
        d += `${connected ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)} `;
        connected=true; previousY=py;
      }
      curves.appendChild(svgNode('path',{d,class:'graph-local-curve',stroke:index ? '#9a9a9a' : '#e6e6e6','stroke-dasharray':index ? '6 5' : 'none','data-curve':index}));
    });
    state.svg.replaceChildren(grid,curves);
  }
  function localGraph(state) {
    const values = variables(state);
    state.functions = state.config.expressions.map(expression => {
      try { const fn=BlogGraphExpression.compile(expression.latex); fn(0,values); return fn; } catch (_) { return null; }
    });
    if (state.functions.some(fn => !fn)) {
      const source = document.createElement('div');
      source.className = 'graph-source-fallback';
      source.textContent = '此图需要在线图形加载。\n' + state.config.expressions.map(expression => expression.latex).join('\n');
      state.canvas.replaceChildren(source);
      state.canvas.dataset.graphEngine = 'source';
      return;
    }
    state.svg = svgNode('svg',{class:'graph-local-svg',role:'img','aria-label':state.config.expressions.map(expression => expression.latex).join('；')});
    const controls = document.createElement('div'); controls.className='graph-local-zoom';
    for (const [label,text,scale] of [['放大图形','+',.8],['缩小图形','−',1.25],['重置视图','↺',0]]) {
      const button=document.createElement('button'); button.type='button'; button.textContent=text; button.setAttribute('aria-label',label);
      button.addEventListener('click',()=>{
        const box=state.bounds, cx=(box.left+box.right)/2, cy=(box.top+box.bottom)/2;
        if (!scale) state.bounds=boundsFor(state.root);
        else { const dx=(box.right-box.left)*scale/2, dy=(box.top-box.bottom)*scale/2; state.bounds={left:cx-dx,right:cx+dx,bottom:cy-dy,top:cy+dy}; }
        draw(state);
      });
      controls.appendChild(button);
    }
    state.canvas.replaceChildren(state.svg,controls);
    state.canvas.dataset.graphEngine='local';
    draw(state);
  }
  function nativeGraph(state, Desmos) {
    if (state.calc || state.root.closest('details:not([open])') || !state.canvas.clientWidth || !state.canvas.clientHeight) return;
    // The local curve stays available until the remote library is actually ready.
    const currentValues=variables(state);
    try {
      state.canvas.replaceChildren();
      const calc=Desmos.GraphingCalculator(state.canvas,{invertedColors:true,expressions:false,expressionsTopbar:false,keypad:false,settingsMenu:false,zoomButtons:true,showResetButtonOnGraphpaper:true,border:false,fontSize:16});
      calc.setExpressions(state.config.expressions);
      state.config.sliders.forEach((slider,index)=>calc.setExpression({id:'slider-'+index,latex:slider.varName+'='+currentValues[slider.varName]}));
      calc.setMathBounds(state.bounds);
      calc.setDefaultState(calc.getState());
      calc.observeEvent('change',()=>{
        for (let index=0;index<state.config.sliders.length;index++) {
          const expression=calc.getExpressions().find(expression=>expression.id==='slider-'+index);
          const value=Number(expression?.latex.split('=').pop());
          if (!Number.isFinite(value)) continue;
          const input=state.root.querySelector('[data-slider="'+index+'"]'), badge=state.root.querySelector('[data-slider-value="'+index+'"]');
          if (input) input.value=value;
          if (badge) badge.textContent=value;
        }
      });
      state.calc=calc; state.canvas.__desmosCalc=calc; state.canvas.__desmosInit=true; state.canvas.dataset.graphEngine='desmos';
    } catch (_) { state.calc=null; localGraph(state); }
  }
  function controls(state) {
    const panel=state.root.querySelector('.gpt-graph-panel');
    if (!panel) return;
    const legend=document.createElement('div'); legend.className='learning-plot-legend';
    state.config.expressions.slice(1).forEach(expression=>{
      const key=document.createElement('span'); key.className='learning-plot-key learning-plot-key--reference';
      key.textContent='\\('+expression.latex+'\\)'; legend.appendChild(key);
    });
    panel.appendChild(legend);
    const row=document.createElement('div'); row.className='learning-plot-reset-row';
    const reset=document.createElement('button'); reset.type='button'; reset.className='learning-graph-reset'; reset.setAttribute('aria-label','重置图形');
    reset.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>';
    reset.addEventListener('click',()=>{
      state.root.querySelectorAll('input[data-slider]').forEach(input=>{input.value=input.defaultValue;input.dispatchEvent(new Event('input',{bubbles:true}));});
      state.bounds=boundsFor(state.root);
      if (state.calc) state.calc.setMathBounds(state.bounds); else draw(state);
    });
    row.appendChild(reset); panel.appendChild(row);
    function typeset() {
      if (window.MathJax?.startup?.promise) MathJax.startup.promise.then(()=>MathJax.typesetPromise([panel])).catch(()=>{});
    }
    document.getElementById('mathjax-cdn-script')?.addEventListener('load',typeset,{once:true});
    typeset();
  }
  roots.forEach(root=>{
    const state={root, canvas:root.querySelector('.gpt-graph-canvas') || root, config:JSON.parse(root.dataset.graphConfig), bounds:boundsFor(root)};
    states.push(state); controls(state);
    root.querySelectorAll('input[data-slider]').forEach(input=>input.addEventListener('input',()=>{
      const index=Number(input.dataset.slider), badge=root.querySelector('[data-slider-value="'+index+'"]');
      if (badge) badge.textContent=input.value;
      if (state.calc) state.calc.setExpression({id:'slider-'+index,latex:state.config.sliders[index].varName+'='+input.value});
      else draw(state);
    }));
    function mount() {
      if (root.closest('details:not([open])') || !state.canvas.clientWidth || !state.canvas.clientHeight) return;
      if (!state.started) {
        state.started=true; localGraph(state);
        loadDesmos().then(api=>nativeGraph(state,api)).catch(()=>{});
      } else if (window.Desmos && !state.calc) nativeGraph(state,window.Desmos);
      if (state.calc) state.calc.resize(); else draw(state);
    }
    if (window.ResizeObserver) new ResizeObserver(mount).observe(state.canvas);
    document.addEventListener('toggle',mount,true);
    window.addEventListener('resize',mount);
    mount();
  });
  window.addEventListener('online',()=>{
    if (window.Desmos) return;
    document.getElementById('desmos-api-script')?.remove(); apiPromise=undefined;
    loadDesmos().then(api=>states.filter(state=>state.started).forEach(state=>nativeGraph(state,api))).catch(()=>{});
  });
})();

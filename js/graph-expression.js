/* Small explicit-function parser for the local graph fallback. Never evals text. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlogGraphExpression = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const functions = {sin:Math.sin, cos:Math.cos, tan:Math.tan, tanh:Math.tanh, exp:Math.exp, ln:Math.log, log:Math.log10, sqrt:Math.sqrt, abs:Math.abs, max:Math.max, min:Math.min};
  function compile(latex) {
    let source = String(latex).trim().replace(/^y\s*=\s*/, '').replace(/\\(?:left|right|,|;|!)/g, '').replace(/\\(?:cdot|times)/g, '*');
    if (!source || source.length > 2048) throw new Error('Unsupported graph expression');
    const tokens = [];
    while (source) {
      const space = source.match(/^\s+/);
      if (space) { source = source.slice(space[0].length); continue; }
      const number = source.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
      const command = source.match(/^\\([a-zA-Z]+)/);
      const named = source.match(/^(sin|cos|tan|tanh|exp|ln|log|sqrt|abs|max|min)(?=\s*\()/);
      const variable = source.match(/^[a-zA-Z](?:_(?:\{[a-zA-Z0-9]+\}|[a-zA-Z0-9]))?/);
      let token, length = 1;
      if (number) { token = {type:'number', value:Number(number[0])}; length = number[0].length; }
      else if (command || named) {
        const name = command ? command[1] : named[1];
        length = (command || named)[0].length;
        if (name === 'pi') token = {type:'number', value:Math.PI};
        else if (functions[name] || name === 'frac') token = {type:'function', value:name};
        else throw new Error('Unsupported command: ' + name);
      } else if (variable) { token = {type:'variable', value:variable[0]}; length = variable[0].length; }
      else if ('+-*/^(),{}'.includes(source[0])) token = {type:source[0] === '{' ? '(' : source[0] === '}' ? ')' : source[0]};
      else throw new Error('Unsupported graph syntax');
      tokens.push(token);
      if (tokens.length > 512) throw new Error('Graph expression is too long');
      source = source.slice(length);
    }
    let index = 0;
    function atom() {
      const token = tokens[index++];
      if (!token) throw new Error('Incomplete graph expression');
      if (token.type === '+' || token.type === '-') return {type:'unary', op:token.type, child:expression(3)};
      if (token.type === 'number' || token.type === 'variable') return token;
      if (token.type === '(') {
        const node = expression(0);
        if (tokens[index++]?.type !== ')') throw new Error('Unclosed graph group');
        return node;
      }
      if (token.type === 'function') {
        if (token.value === 'frac') return {type:'binary', op:'/', left:atom(), right:atom()};
        const args = [];
        if (tokens[index]?.type === '(') {
          index++;
          do { args.push(expression(0)); } while (tokens[index]?.type === ',' && ++index);
          if (tokens[index++]?.type !== ')') throw new Error('Unclosed function');
        } else args.push(atom());
        if (!args.length || (token.value !== 'max' && token.value !== 'min' && args.length !== 1)) throw new Error('Unsupported function arguments');
        return {type:'call', name:token.value, args};
      }
      throw new Error('Unexpected graph token');
    }
    function expression(minimum) {
      let left = atom();
      while (index < tokens.length) {
        const token = tokens[index];
        const implicit = ['number','variable','function','('].includes(token.type);
        const op = implicit ? '*' : token.type;
        const precedence = {'+':1,'-':1,'*':2,'/':2,'^':4}[op];
        if (!precedence || precedence < minimum) break;
        if (!implicit) index++;
        const right = expression(op === '^' ? precedence : precedence + 1);
        left = {type:'binary', op, left, right};
      }
      return left;
    }
    const tree = expression(0);
    if (index !== tokens.length) throw new Error('Unsupported graph expression');
    function evaluate(node, x, variables) {
      if (node.type === 'number') return node.value;
      if (node.type === 'variable') {
        if (node.value === 'x') return x;
        if (!Object.prototype.hasOwnProperty.call(variables, node.value)) throw new Error('Unknown graph variable: ' + node.value);
        return Number(variables[node.value]);
      }
      if (node.type === 'unary') return (node.op === '-' ? -1 : 1) * evaluate(node.child,x,variables);
      if (node.type === 'call') return functions[node.name](...node.args.map(arg => evaluate(arg,x,variables)));
      const a = evaluate(node.left,x,variables), b = evaluate(node.right,x,variables);
      return node.op === '+' ? a+b : node.op === '-' ? a-b : node.op === '*' ? a*b : node.op === '/' ? a/b : Math.pow(a,b);
    }
    return (x, variables = {}) => evaluate(tree, x, variables);
  }
  return {compile};
});

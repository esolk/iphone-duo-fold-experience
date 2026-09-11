const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const scripts = ['renderer.js', 'app.js'].map(name => {
  const source = read(name);
  new vm.Script(source, { filename: name });
  return source;
}).join('\n');
const inline = `document.addEventListener('DOMContentLoaded', () => {\n${scripts}\n});`;
new vm.Script(inline, { filename: 'standalone-inline.js' });
const html = read('index.html')
  .replace('<link rel="stylesheet" href="style.css">', () => `<style>${read('style.css')}</style>`)
  .replace('<script src="renderer.js" defer></script>\n  <script src="app.js" defer></script>', () => `<script>${inline}</script>`);
if (/<script\s+src=/.test(html) || /href="style.css"/.test(html)) throw Error('Unresolved standalone asset');
fs.writeFileSync(path.join(root, 'duo-fold.html'), html);
console.log('Standalone HTML rebuilt; both scripts and inline bundle passed syntax checks.');

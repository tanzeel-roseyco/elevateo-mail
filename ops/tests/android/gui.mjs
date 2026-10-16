// AIDEV-NOTE: QA-only CDP client runs inside the isolated emulator container; no public debugging endpoint.
import { execFileSync } from 'node:child_process';
import { readSync, writeFileSync } from 'node:fs';
const buffer = Buffer.alloc(65537);
let size = 0;
while (size < buffer.length) {
  const count = readSync(0, buffer, size, buffer.length - size, null);
  if (!count) break;
  size += count;
}
if (size > 65536) throw new Error('QA command too large');
const input = buffer.subarray(0, size).toString('utf8');
const request = JSON.parse(input);
const adb = (...args) => execFileSync('adb', ['-s', 'emulator-5554', ...args],
  { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }).trim();
const pid = adb('shell', 'pidof', 'com.elevateo.mail.qa');
if (!/^[0-9]+$/.test(pid)) throw new Error('One QA app process required');
adb('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
const response = await fetch('http://127.0.0.1:9222/json/list', { signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error('WebView discovery failed');
const pages = await response.json();
const page = pages.find(p => p.type === 'page' && p.url.startsWith('https://elevateo.qa.internal/'));
if (!page) throw new Error('QA HTTPS WebView not found');
const endpoint = new URL(page.webSocketDebuggerUrl);
if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(endpoint.hostname) || endpoint.port !== '9222')
  throw new Error('Unexpected debugger endpoint');
const socket = new WebSocket(endpoint);
let sequence = 0;
const pending = new Map();
socket.onmessage = event => {
  const message = JSON.parse(event.data);
  const handler = pending.get(message.id);
  if (!handler) return;
  pending.delete(message.id); clearTimeout(handler.timer);
  if (message.error) handler.reject(new Error('CDP command failed: ' + message.error.message));
  else handler.resolve(message.result);
};
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('CDP connect timed out')), 5000);
  socket.onopen = () => { clearTimeout(timer); resolve(); };
  socket.onerror = () => { clearTimeout(timer); reject(new Error('CDP connection failed')); };
});
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP command timed out')); }, 10000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error('QA browser expression failed');
  return result.result.value;
}
async function click(selector) {
  const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});
    if(!e || e.disabled) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();
    const x=r.x+r.width/2,y=r.y+r.height/2,style=getComputedStyle(e),top=document.elementFromPoint(x,y);
    return r.width>0 && r.height>0 && x>=0 && x<innerWidth && y>=0 && y<innerHeight &&
      style.visibility==='visible' && style.display!=='none' && style.pointerEvents!=='none' &&
      (top===e || e.contains(top)) ? {x,y} : null;})()`);
  if (!point) throw new Error('Visible enabled QA target not found');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
}
try {
  let result;
  if (request.action === 'snapshot') result = await evaluate(`({url:location.href,online:navigator.onLine,
    width:innerWidth,height:innerHeight,text:document.body.innerText.slice(0,10000),
    buttonCount:document.querySelectorAll('button').length,linkCount:document.querySelectorAll('a').length,
    collectionLimit:100,textLimit:300,
    buttons:[...document.querySelectorAll('button')].slice(0,100).map(e=>({text:e.textContent.slice(0,300),label:e.getAttribute('aria-label')?.slice(0,300)})),
    links:[...document.querySelectorAll('a')].slice(0,100).map(e=>({text:e.textContent.slice(0,300),href:e.getAttribute('href')?.slice(0,300)}))})`);
  else if (request.action === 'evaluate') result = await evaluate(request.expression);
  else if (request.action === 'click') { await click(request.selector); result = { action: 'click-dispatched', outcomeRequiresAssertion: true }; }
  else if (request.action === 'fill') {
    if (typeof request.value !== 'string') throw new Error('QA fill requires text');
    const editable = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(request.selector)});
      return !!e && ['INPUT','TEXTAREA'].includes(e.tagName) && !e.readOnly && !e.disabled;})()`);
    if (!editable) throw new Error('Editable QA target required');
    await click(request.selector);
    await evaluate(`document.querySelector(${JSON.stringify(request.selector)}).select()`);
    await send('Input.insertText', { text: request.value });
    const matched = await evaluate(`document.querySelector(${JSON.stringify(request.selector)}).value===${JSON.stringify(request.value)}`);
    if (!matched) throw new Error('QA field value did not match');
    result = { action: 'filled', verified: true };
  } else if (request.action === 'screen') {
    if (!/^[a-z0-9-]{1,40}$/.test(request.name)) throw new Error('Invalid evidence name');
    const png = execFileSync('adb', ['-s', 'emulator-5554', 'exec-out', 'screencap', '-p'],
      { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    writeFileSync('/evidence/' + request.name + '.png', png); result = { screen: request.name };
  } else throw new Error('Unknown QA action');
  process.stdout.write(JSON.stringify(result) + '\n');
} finally {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('CDP closed')); }
  socket.close();
}

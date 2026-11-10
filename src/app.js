import { gradients, solids, ratios, frames, backgroundModes, defaults, render, createDemo, MAX_FILE_BYTES, MAX_INPUT_SIDE, MAX_INPUT_PIXELS } from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#preview');
const input = $('#file-input');
const exportButton = $('#export-button');
const copyButton = $('#copy-button');
const dropZone = $('#drop-zone');
const STORAGE_KEY = 'snapframe:v1';
const formats = { png: { type: 'image/png', ext: 'png', label: 'PNG' }, jpeg: { type: 'image/jpeg', ext: 'jpg', label: 'JPG' } };
const canCopy = window.isSecureContext && typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function';
const mod = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
const settings = { ...defaults };
let format = 'png';
let image = createDemo();
let filename = 'snapframe-demo';
let isDemo = true;
let loadId = 0;
let pendingFrame = 0;
let exporting = false;
let loading = false;
let size;

function message(text = '', error = false) {
  $('#message').textContent = text;
  $('#message').classList.toggle('error', error);
}

function setButtons(disabled = exporting || loading) {
  exportButton.disabled = disabled;
  copyButton.disabled = disabled;
}

// Only the style is remembered; images never leave memory.
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, format })); } catch { /* Storage may be unavailable. */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const s = saved?.settings;
    if (!s || typeof s !== 'object') return;
    if (Object.hasOwn(backgroundModes, s.mode)) settings.mode = s.mode;
    if (Number.isInteger(s.gradient) && gradients[s.gradient]) settings.gradient = s.gradient;
    if (/^#[0-9a-f]{6}$/i.test(s.color)) settings.color = s.color.toLowerCase();
    for (const key of ['padding', 'radius', 'shadow']) {
      if (!Number.isFinite(s[key])) continue;
      // The range input clamps and snaps the saved value to its own min, max, and step.
      const range = $(`#${key}`); range.value = String(s[key]); settings[key] = Number(range.value);
    }
    if (ratios.some(ratio => ratio.id === s.ratio)) settings.ratio = s.ratio;
    if (frames.some(frame => frame.id === s.frame)) settings.frame = s.frame;
    if (Object.hasOwn(formats, saved.format)) format = saved.format;
  } catch { /* Missing or stale data: keep the defaults. */ }
}

function update() {
  try {
    size = render(canvas, image, settings);
    canvas.classList.toggle('transparent', settings.mode === 'transparent');
    $('#dimensions').textContent = `${size.width} × ${size.height} px${size.scale < 1 ? '（已安全缩放）' : ''}`;
    $('#preview-label').textContent = isDemo ? '示例效果' : '你的截图';
    setButtons();
    persist();
    return true;
  } catch (error) {
    setButtons(true);
    message(error.message || '图片绘制失败，请换一张较小的图片。', true);
    return false;
  }
}

function scheduleUpdate() {
  if (pendingFrame) cancelAnimationFrame(pendingFrame);
  pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; update(); });
}

function syncControls() {
  for (const key of ['padding', 'radius', 'shadow']) {
    const range = $(`#${key}`);
    range.value = settings[key];
    range.style.setProperty('--fill', `${(settings[key] - Number(range.min)) / (Number(range.max) - Number(range.min)) * 100}%`);
    $(`#${key}-value`).textContent = `${settings[key]}${key === 'shadow' ? '%' : ' px'}`;
  }
  const press = (attribute, read, value) => document.querySelectorAll(`[data-${attribute}]`).forEach(button => button.setAttribute('aria-pressed', String(read(button.dataset[attribute]) === value)));
  press('mode', String, settings.mode);
  press('gradient', Number, settings.gradient);
  press('color', String, settings.color);
  press('ratio', String, settings.ratio);
  press('frame', String, settings.frame);
  press('format', String, format);
  for (const mode of Object.keys(backgroundModes)) $(`#${mode}-options`).hidden = settings.mode !== mode;
  $('#background-name').textContent = settings.mode === 'gradient' ? gradients[settings.gradient].name : { solid: '纯色', blur: '取自截图', transparent: '无背景' }[settings.mode];
  $('#ratio-name').textContent = ratios.find(ratio => ratio.id === settings.ratio).hint;
  $('#custom-color').value = settings.color;
  $('#color-value').textContent = settings.color.toUpperCase();
  if (!exporting) exportButton.querySelector('span').textContent = `导出 ${formats[format].label}`;
}

function changed() { syncControls(); scheduleUpdate(); }

gradients.forEach((preset, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'swatch'; button.dataset.gradient = index;
  button.title = preset.name; button.setAttribute('aria-label', preset.name);
  button.style.background = `linear-gradient(135deg,${preset.colors.join(',')})`;
  button.addEventListener('click', () => { settings.gradient = index; changed(); });
  $('#gradient-options').append(button);
});
solids.forEach((color, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'swatch'; button.dataset.color = color;
  button.title = color; button.setAttribute('aria-label', `纯色 ${index + 1} ${color}`); button.style.background = color;
  button.addEventListener('click', () => { settings.color = color; changed(); });
  $('#solid-swatches').append(button);
});
ratios.forEach(ratio => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'ratio'; button.dataset.ratio = ratio.id;
  button.title = ratio.hint; button.setAttribute('aria-label', `${ratio.name}，${ratio.hint}`);
  // A miniature of the canvas shape, at most 18 px on its long side.
  const shape = document.createElement('span');
  shape.className = 'ratio-shape'; shape.setAttribute('aria-hidden', 'true');
  const value = ratio.value || 1.4;
  shape.style.width = `${value >= 1 ? 18 : Math.round(18 * value)}px`;
  shape.style.height = `${value >= 1 ? Math.round(18 / value) : 18}px`;
  const label = document.createElement('span'); label.textContent = ratio.name;
  button.append(shape, label);
  button.addEventListener('click', () => { settings.ratio = ratio.id; changed(); });
  $('#ratio-options').append(button);
});
frames.forEach(frame => {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset.frame = frame.id; button.textContent = frame.name;
  button.addEventListener('click', () => { settings.frame = frame.id; changed(); });
  $('#frame-options').append(button);
});

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { settings.mode = button.dataset.mode; changed(); }));
document.querySelectorAll('[data-format]').forEach(button => button.addEventListener('click', () => { format = button.dataset.format; syncControls(); persist(); }));
for (const key of ['padding', 'radius', 'shadow']) {
  $(`#${key}`).addEventListener('input', event => { settings[key] = Number(event.target.value); changed(); });
}
$('#custom-color').addEventListener('input', event => { settings.color = event.target.value; changed(); });
$('#reset-button').addEventListener('click', () => {
  Object.assign(settings, defaults); changed(); message('已恢复默认样式，当前图片已保留。');
});

// Validate bytes, not just extensions or browser-provided MIME types.
async function validSignature(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 13 && b[5] === 10 && b[6] === 26 && b[7] === 10)
    || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    || (String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP');
}

// Resolves once the header is parsed: dimensions are known, pixels are not decoded yet.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = reject;
    next.src = url;
  });
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
function reveal() {
  if (reducedMotion.matches || !canvas.animate) return;
  canvas.animate([{ opacity: 0, transform: 'translateY(6px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2, .7, .2, 1)' });
}

async function loadFile(file) {
  const thisLoad = ++loadId;
  if (!file) return;
  loading = true; setButtons();
  let url;
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error('图片超过 32 MB，请压缩后重试。');
    if (!await validSignature(file)) throw new Error('暂不支持这个文件，请选择 PNG、JPG 或 WebP 静态图片。');
    if (thisLoad !== loadId) return;
    message('正在读取图片…');
    url = URL.createObjectURL(file);
    const unreadable = '无法读取图片，文件可能损坏，请换一张试试。';
    let next;
    try { next = await loadImage(url); }
    catch { throw new Error(unreadable); }
    if (thisLoad !== loadId) return;
    // Check dimensions before decode() so an oversized image is rejected without allocating its pixels.
    if (next.naturalWidth > MAX_INPUT_SIDE || next.naturalHeight > MAX_INPUT_SIDE || next.naturalWidth * next.naturalHeight > MAX_INPUT_PIXELS) {
      throw new Error('图片尺寸过大，请使用边长不超过 16,384 px、总像素不超过 4,000 万的图片。');
    }
    try { await next.decode(); }
    catch { throw new Error(unreadable); }
    if (thisLoad !== loadId) return;
    // An HTMLImageElement's width/height are initialized from decoded intrinsic dimensions.
    image = next; filename = file.name.replace(/\.[^.]+$/, '') || 'screenshot'; isDemo = false;
    $('#file-name').textContent = file.name;
    $('#file-name').title = file.name;
    loading = false;
    if (!update()) return;
    reveal();
    message(size?.scale < 1 ? '图片已载入。为保证浏览器稳定，导出已缩放至 1,600 万像素以内。' : '图片已载入，调一调就能导出。');
  } catch (error) {
    if (thisLoad === loadId) message(error.message || '无法读取图片，文件可能损坏，请换一张试试。', true);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (thisLoad === loadId) { loading = false; setButtons(); }
  }
}

function receiveFiles(files) {
  if (files.length > 1) { message('每次只能处理一张图片，请只选择或拖入一张。', true); return; }
  if (files.length === 1) loadFile(files[0]);
}
$('#upload-button').addEventListener('click', () => input.click());
input.addEventListener('change', () => { receiveFiles(input.files); input.value = ''; });
let dragDepth = 0;
dropZone.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; });
dropZone.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropZone.classList.remove('dragging'); });
dropZone.addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; dropZone.classList.remove('dragging'); receiveFiles(event.dataTransfer.files);
});
// Prevent dropping outside the upload zone from navigating away and losing the current edit.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());

function isTextField(target) {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('textarea, input:not([type=range], [type=color], [type=button], [type=file])'));
}

// Clipboard images usually arrive as "image.png"; give them a name worth downloading.
function pastedFile(file) {
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type] || 'png';
  const time = new Date().toTimeString().slice(0, 8).replaceAll(':', '');
  return new File([file], `粘贴的截图-${time}.${ext}`, { type: file.type });
}
document.addEventListener('paste', event => {
  if (isTextField(event.target)) return;
  event.preventDefault();
  const file = [...(event.clipboardData?.files || [])].find(item => item.type.startsWith('image/'));
  if (file) loadFile(pastedFile(file));
  else message(`剪贴板里没有图片。先截图或复制一张图片，再按 ${mod} + V。`, true);
});

function flush() {
  if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; }
  if (!update()) throw new Error('图片绘制失败，请减小图片尺寸后重试。');
}

function encode(type) {
  let source = canvas;
  // JPEG has no alpha channel: flatten a transparent background onto white rather than black.
  if (type === 'image/jpeg' && settings.mode === 'transparent') {
    source = document.createElement('canvas');
    source.width = canvas.width; source.height = canvas.height;
    const ctx = source.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, source.width, source.height); ctx.drawImage(canvas, 0, 0);
  }
  return new Promise((resolve, reject) => source.toBlob(value => value ? resolve(value) : reject(new Error('导出失败，请减小图片尺寸后重试。')), type, .92));
}

async function withBusy(button, busyLabel, failure, task) {
  if (loading || exporting) return;
  const label = button.querySelector('span');
  const idle = label.textContent;
  exporting = true; setButtons(); label.textContent = busyLabel;
  try { flush(); await task(); }
  catch (error) { message(error instanceof DOMException || !error?.message ? failure : error.message, true); }
  finally { exporting = false; setButtons(); label.textContent = idle; syncControls(); }
}

function exportImage() {
  const { type, ext, label } = formats[format];
  return withBusy(exportButton, '正在导出…', '导出失败，请稍后重试。', async () => {
    const blob = await encode(type);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${filename}-snapframe.${ext}`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message(`${label} 已导出。如果手机浏览器直接打开了图片，长按即可保存。`);
  });
}

function copyImage() {
  return withBusy(copyButton, '复制中…', '浏览器没有允许写入剪贴板，请改用导出。', async () => {
    // Hand over a pending blob so Safari still treats the write as part of the click.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': encode('image/png') })]);
    message('已复制图片，可以直接粘贴到聊天或文档里。');
  });
}

exportButton.addEventListener('click', exportImage);
copyButton.addEventListener('click', copyImage);
document.addEventListener('keydown', event => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key === 's') { event.preventDefault(); exportImage(); }
  // Leave Ctrl+C alone while text is selected or being edited.
  else if (key === 'c' && canCopy && !isTextField(event.target) && !String(getSelection())) { event.preventDefault(); copyImage(); }
});

copyButton.hidden = !canCopy;
$('#copy-hint').hidden = !canCopy;
document.querySelectorAll('[data-mod]').forEach(element => { element.textContent = mod; });
restore(); syncControls(); update();

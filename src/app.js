import { gradients, solids, defaults, render, createDemo, MAX_FILE_BYTES, MAX_INPUT_SIDE, MAX_INPUT_PIXELS } from './renderer.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#preview');
const input = $('#file-input');
const exportButton = $('#export-button');
const dropZone = $('#drop-zone');
const settings = { ...defaults };
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

function update() {
  try {
    size = render(canvas, image, settings);
    $('#dimensions').textContent = `${size.width} × ${size.height} px${size.scale < 1 ? '（已安全缩放）' : ''}`;
    $('#preview-label').textContent = isDemo ? '示例效果' : '你的截图';
    exportButton.disabled = exporting || loading;
    return true;
  } catch (error) {
    exportButton.disabled = true;
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
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === settings.mode)));
  $('#gradient-options').hidden = settings.mode !== 'gradient';
  $('#solid-options').hidden = settings.mode !== 'solid';
  $('#background-name').textContent = settings.mode === 'gradient' ? gradients[settings.gradient].name : '自在纯色';
  document.querySelectorAll('[data-gradient]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.gradient) === settings.gradient)));
  document.querySelectorAll('[data-color]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === settings.color)));
  $('#custom-color').value = settings.color;
  $('#color-value').textContent = settings.color.toUpperCase();
}

gradients.forEach((preset, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'swatch'; button.dataset.gradient = index;
  button.title = preset.name; button.setAttribute('aria-label', preset.name);
  button.style.background = `linear-gradient(135deg,${preset.colors.join(',')})`;
  button.addEventListener('click', () => { settings.gradient = index; syncControls(); scheduleUpdate(); });
  $('#gradient-options').append(button);
});
solids.forEach((color, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'swatch'; button.dataset.color = color;
  button.title = color; button.setAttribute('aria-label', `纯色 ${index + 1} ${color}`); button.style.background = color;
  button.addEventListener('click', () => { settings.color = color; syncControls(); scheduleUpdate(); });
  $('#solid-swatches').append(button);
});

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => {
  settings.mode = button.dataset.mode; syncControls(); scheduleUpdate();
}));
for (const key of ['padding', 'radius', 'shadow']) {
  $(`#${key}`).addEventListener('input', event => { settings[key] = Number(event.target.value); syncControls(); scheduleUpdate(); });
}
$('#custom-color').addEventListener('input', event => { settings.color = event.target.value; syncControls(); scheduleUpdate(); });
$('#reset-button').addEventListener('click', () => {
  Object.assign(settings, defaults); syncControls(); scheduleUpdate(); message('已恢复默认样式，当前图片已保留。');
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
  loading = true; exportButton.disabled = true;
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
    if (thisLoad === loadId) { loading = false; exportButton.disabled = exporting; }
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

exportButton.addEventListener('click', async () => {
  if (loading || exporting) return;
  exporting = true; exportButton.disabled = true; exportButton.querySelector('span').textContent = '正在导出…';
  try {
    if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; }
    if (!update()) throw new Error('图片绘制失败，请减小图片尺寸后重试。'); // Flush the last slider change.
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('导出失败，请减小图片尺寸后重试。')), 'image/png'));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `${filename}-snapframe.png`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('PNG 已导出。如果手机浏览器直接打开了图片，长按即可保存。');
  } catch (error) { message(error.message || '导出失败，请稍后重试。', true); }
  finally { exporting = false; exportButton.disabled = loading; exportButton.querySelector('span').textContent = '导出 PNG'; }
});

syncControls(); update();

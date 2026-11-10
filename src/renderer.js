// One rendering path for preview and export: the displayed canvas IS the exported image.
export const MAX_OUTPUT_SIDE = 8192;
export const MAX_OUTPUT_PIXELS = 16_000_000;
export const MAX_INPUT_SIDE = 16384;
export const MAX_INPUT_PIXELS = 40_000_000;
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

export const gradients = [
  { name: '薄荷微光', colors: ['#d5eee2', '#b6d7cb'] },
  { name: '暮色紫霞', colors: ['#e2d5f2', '#bac7e8'] },
  { name: '落日奶橘', colors: ['#f7dec5', '#f1bcb1'] },
  { name: '晴空来信', colors: ['#d0e8f5', '#a8c8e3'] },
  { name: '玫瑰柔雾', colors: ['#f2d5e1', '#dfbcd5'] },
  { name: '暖砂时光', colors: ['#ede5cd', '#c9d3b8'] },
];
export const solids = ['#e1f2ea', '#ece4f5', '#f9e7d5', '#daeaf6', '#f7dfe8', '#eef0e5'];
export const backgroundModes = { gradient: '渐变', solid: '纯色', blur: '模糊', transparent: '透明' };
export const ratios = [
  { id: 'auto', name: '自动', hint: '跟随截图' },
  { id: '1:1', name: '1:1', hint: '方形', value: 1 },
  { id: '4:3', name: '4:3', hint: '横版', value: 4 / 3 },
  { id: '3:4', name: '3:4', hint: '竖版，适合小红书', value: 3 / 4 },
  { id: '16:9', name: '16:9', hint: '宽屏，适合封面', value: 16 / 9 },
  { id: '9:16', name: '9:16', hint: '竖屏，适合手机', value: 9 / 16 },
];
export const frames = [
  { id: 'none', name: '无' },
  { id: 'light', name: '浅色', bar: '#eceef0', line: '#d8dbdf' },
  { id: 'dark', name: '深色', bar: '#2b2f34', line: '#1b1e22' },
];
export const defaults = Object.freeze({ mode: 'gradient', gradient: 0, color: '#e1f2ea', padding: 64, radius: 16, shadow: 40, ratio: 'auto', frame: 'none' });

// The title bar scales with the screenshot so it reads the same at any resolution.
export function titleBarHeight(width) {
  return Math.round(Math.min(96, Math.max(24, width * .032)));
}

// Logical layout in source pixels, plus the scale that keeps the output within browser limits.
export function layout(width, height, settings) {
  const bar = settings.frame === 'none' ? 0 : titleBarHeight(width);
  const card = { w: width, h: height + bar };
  let w = card.w + settings.padding * 2;
  let h = card.h + settings.padding * 2;
  // A fixed ratio only ever grows the canvas, so padding stays the minimum margin.
  const ratio = ratios.find(item => item.id === settings.ratio)?.value;
  if (ratio) {
    if (w / h < ratio) w = Math.round(h * ratio);
    else h = Math.round(w / ratio);
  }
  card.x = Math.round((w - card.w) / 2);
  card.y = Math.round((h - card.h) / 2);
  const scale = Math.min(1, MAX_OUTPUT_SIDE / w, MAX_OUTPUT_SIDE / h, Math.sqrt(MAX_OUTPUT_PIXELS / (w * h)));
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)), scale, logicalWidth: w, logicalHeight: h, card, bar };
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

// Destination rect that covers width x height (plus `bleed` on every side) without distortion.
function coverRect(image, width, height, bleed = 0) {
  const scale = Math.max((width + bleed * 2) / image.width, (height + bleed * 2) / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  return [(width - w) / 2, (height - h) / 2, w, h];
}

// A soft colour field taken from the screenshot itself, cached per image and aspect ratio.
const backdrops = new WeakMap();
function backdrop(image, aspect) {
  const key = aspect.toFixed(3);
  const cached = backdrops.get(image);
  if (cached?.key === key) return cached.canvas;
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = Math.max(1, Math.round(240 / aspect));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  // An opaque base keeps the edges solid where the blur fades out.
  ctx.drawImage(image, ...coverRect(image, canvas.width, canvas.height));
  if ('filter' in ctx) {
    const blur = 18;
    ctx.filter = `blur(${blur}px) saturate(1.4)`;
    // Bleed past the edges by the kernel's reach (about 3 sigma) so the blur never samples emptiness.
    ctx.drawImage(image, ...coverRect(image, canvas.width, canvas.height, blur * 3));
  } else {
    // Without canvas filters, averaging down to a few pixels and scaling up blurs just as well.
    const tiny = document.createElement('canvas');
    tiny.width = 12;
    tiny.height = Math.max(1, Math.round(12 / aspect));
    tiny.getContext('2d').drawImage(image, ...coverRect(image, tiny.width, tiny.height));
    ctx.drawImage(tiny, 0, 0, canvas.width, canvas.height);
  }
  backdrops.set(image, { key, canvas });
  return canvas;
}

function paintBackground(ctx, image, settings, width, height) {
  if (settings.mode === 'transparent') return;
  if (settings.mode === 'blur') {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(backdrop(image, width / height), 0, 0, width, height);
    return;
  }
  if (settings.mode === 'gradient') {
    const { colors } = gradients[settings.gradient];
    const background = ctx.createLinearGradient(0, 0, width, height);
    colors.forEach((color, index) => background.addColorStop(index / Math.max(1, colors.length - 1), color));
    ctx.fillStyle = background;
  } else ctx.fillStyle = settings.color;
  ctx.fillRect(0, 0, width, height);
}

function paintTitleBar(ctx, frame, x, y, width, bar) {
  ctx.fillStyle = frame.bar;
  ctx.fillRect(x, y, width, bar);
  ctx.fillStyle = frame.line;
  ctx.fillRect(x, y + bar - 1, width, 1);
  ['#ff5f57', '#febc2e', '#28c840'].forEach((color, index) => {
    ctx.beginPath();
    ctx.arc(x + bar * .6 + index * bar * .52, y + bar / 2, bar * .15, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

export function render(canvas, image, settings) {
  const size = layout(image.width, image.height, settings);
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法绘制图片，请换用较新的浏览器。');
  paintBackground(ctx, image, settings, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(size.scale, size.scale);
  const { x, y, w, h } = size.card;
  const radius = Math.min(settings.radius, w / 2, h / 2);
  if (settings.shadow > 0) {
    ctx.save();
    // Paint only the shadow, never the shape casting it, so transparent pixels show the
    // background whether or not a shadow is on: clip out the card area, then cast from
    // an off-canvas copy whose shadow is offset back into place.
    const away = size.logicalWidth;
    ctx.beginPath();
    ctx.rect(0, 0, size.logicalWidth, size.logicalHeight);
    ctx.roundRect(x, y, w, h, radius);
    ctx.clip('evenodd');
    // Shadow metrics use output pixels; paths use the scaled logical coordinate system.
    ctx.shadowColor = `rgba(23, 45, 37, ${settings.shadow / 100 * .5})`;
    ctx.shadowBlur = (12 + settings.shadow * .4) * size.scale;
    ctx.shadowOffsetX = away * size.scale;
    ctx.shadowOffsetY = (4 + settings.shadow * .16) * size.scale;
    roundedRect(ctx, x - away, y, w, h, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
  }
  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
  if (size.bar) paintTitleBar(ctx, frames.find(frame => frame.id === settings.frame), x, y, w, size.bar);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y + size.bar, image.width, image.height);
  ctx.restore();
  return size;
}

export function createDemo() {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 640;
  const c = canvas.getContext('2d');
  const font = '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
  c.fillStyle = '#fbfcfa'; c.fillRect(0, 0, 1000, 640);
  c.fillStyle = '#eef2ee'; c.fillRect(0, 0, 1000, 46);
  ['#e5b6ae', '#e5d4a2', '#b6cbb3'].forEach((color, i) => { c.beginPath(); c.arc(24 + i * 19, 23, 5, 0, Math.PI * 2); c.fillStyle = color; c.fill(); });
  c.fillStyle = '#91a092'; c.font = `12px ${font}`; c.textAlign = 'center'; c.fillText('studio / a little space for ideas', 500, 28); c.textAlign = 'left';
  c.fillStyle = '#f1f4ef'; c.fillRect(0, 46, 197, 594);
  c.fillStyle = '#375a43'; c.font = `bold 22px ${font}`; c.fillText('◈  留白笔记', 23, 97);
  c.font = `14px ${font}`; c.fillStyle = '#93a08f'; c.fillText('我的工作空间', 24, 153);
  roundedRect(c, 14, 172, 168, 40, 7); c.fillStyle = '#dce8d9'; c.fill();
  c.fillStyle = '#4b7054'; c.fillText('▦   灵感看板', 28, 197);
  c.fillStyle = '#8a9787'; c.fillText('☷   所有笔记', 28, 243); c.fillText('☆   我的收藏', 28, 290);
  c.font = `12px ${font}`; c.fillStyle = '#a6b0a1'; c.fillText('为好想法，留一点空间。', 23, 608);
  c.fillStyle = '#8f9e8c'; c.font = `12px ${font}`; c.fillText('工作空间   /   灵感看板', 235, 91);
  c.fillStyle = '#2c4535'; c.font = `bold 32px ${font}`; c.fillText('把灵感，慢慢变成日常。', 235, 157);
  c.font = `14px ${font}`; c.fillStyle = '#97a18f'; c.fillText('收集那些微小、明亮，又值得记录的瞬间。', 237, 189);
  roundedRect(c, 236, 220, 98, 30, 15); c.fillStyle = '#e3eddc'; c.fill(); c.fillStyle = '#67815e'; c.font = `12px ${font}`; c.fillText('所有灵感  6', 253, 240); c.fillStyle = '#9aa590'; c.fillText('生活碎片', 360, 240); c.fillText('设计收藏', 463, 240);
  const cards = [
    { x: 236, color: '#e8eddb', title: '留一点时间给自己', sub: 'LIFE / 慢下来，也是一种前进' },
    { x: 478, color: '#eadfce', title: '日常里的小确幸', sub: 'MOMENTS / 记录微小的美好' },
    { x: 720, color: '#dee6e2', title: '让好想法自然发生', sub: 'IDEAS / 保持好奇，继续探索' },
  ];
  for (const card of cards) {
    roundedRect(c, card.x, 277, 218, 276, 10); c.fillStyle = '#fff'; c.fill();
    roundedRect(c, card.x + 9, 286, 200, 178, 7); c.fillStyle = card.color; c.fill();
    c.save(); c.beginPath(); c.rect(card.x + 9, 286, 200, 178); c.clip();
    c.fillStyle = '#ffffff50'; c.beginPath(); c.arc(card.x + 165, 321, 56, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6f8668'; c.beginPath(); c.ellipse(card.x + 93, 379, 28, 64, -.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a4b296'; c.beginPath(); c.ellipse(card.x + 131, 389, 21, 48, .6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#c4b9a2'; roundedRect(c, card.x + 79, 409, 63, 62, 9); c.fill(); c.restore();
    c.fillStyle = '#53684e'; c.font = `bold 15px ${font}`; c.fillText(card.title, card.x + 15, 496);
    c.fillStyle = '#a0aa98'; c.font = `10px ${font}`; c.fillText(card.sub, card.x + 15, 525);
  }
  c.fillStyle = '#b1baaa'; c.font = `12px ${font}`; c.fillText('今天，也有值得收藏的好时光。', 236, 603);
  return canvas;
}

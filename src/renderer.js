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
export const defaults = Object.freeze({ mode: 'gradient', gradient: 0, color: '#e1f2ea', padding: 64, radius: 16, shadow: 40 });

export function outputSize(width, height, padding) {
  const rawWidth = width + padding * 2;
  const rawHeight = height + padding * 2;
  const scale = Math.min(1, MAX_OUTPUT_SIDE / rawWidth, MAX_OUTPUT_SIDE / rawHeight, Math.sqrt(MAX_OUTPUT_PIXELS / (rawWidth * rawHeight)));
  return { width: Math.max(1, Math.floor(rawWidth * scale)), height: Math.max(1, Math.floor(rawHeight * scale)), scale };
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2));
}

export function render(canvas, image, settings) {
  const size = outputSize(image.width, image.height, settings.padding);
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器无法绘制图片，请换用较新的浏览器。');
  if (settings.mode === 'gradient') {
    const background = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradients[settings.gradient].colors.forEach((color, index) => background.addColorStop(index, color));
    ctx.fillStyle = background;
  } else ctx.fillStyle = settings.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(size.scale, size.scale);
  const p = settings.padding;
  if (settings.shadow > 0) {
    ctx.save();
    // Shadow metrics use output pixels; paths use the scaled logical coordinate system.
    ctx.shadowColor = `rgba(23, 45, 37, ${settings.shadow / 100 * .5})`;
    ctx.shadowBlur = (12 + settings.shadow * .4) * size.scale;
    ctx.shadowOffsetY = (4 + settings.shadow * .16) * size.scale;
    roundedRect(ctx, p, p, image.width, image.height, settings.radius);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();
  }
  roundedRect(ctx, p, p, image.width, image.height, settings.radius);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, p, p, image.width, image.height);
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

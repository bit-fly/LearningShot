// Crops a full-viewport screenshot dataURL down to the user-selected rect.
// `rect` coordinates are in CSS pixels as reported by the content script;
// devicePixelRatio is applied to map them onto the physical-pixel screenshot.

export async function cropScreenshot(
  screenshotDataUrl: string,
  rect: { x: number; y: number; width: number; height: number; devicePixelRatio: number }
): Promise<string> {
  const img = await loadImage(screenshotDataUrl);
  const dpr = rect.devicePixelRatio || 1;

  const sx = rect.x * dpr;
  const sy = rect.y * dpr;
  const sw = rect.width * dpr;
  const sh = rect.height * dpr;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布上下文");

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("截图加载失败"));
    img.src = src;
  });
}

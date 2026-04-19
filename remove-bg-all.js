const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function processImage(inputPath, outputPath, threshold = 28, border = 10) {
  const img = await loadImage(inputPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const w = canvas.width, h = canvas.height;

  // 1. הסר רקע לבן
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    if (r > 255 - threshold && g > 255 - threshold && b > 255 - threshold) {
      data[i+3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  // 2. מצא את הגבולות של התוכן (bounding box)
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const outW  = cropW + border * 2;
  const outH  = cropH + border * 2;

  // 3. צור קנבס חדש עם גבול לבן
  const outCanvas = createCanvas(outW, outH);
  const outCtx = outCanvas.getContext('2d');

  // רקע לבן
  outCtx.fillStyle = '#ffffff';
  outCtx.fillRect(0, 0, outW, outH);

  // שרטט את החלק החתוך
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, border, border, cropW, cropH);

  await new Promise((res, rej) => {
    const out = fs.createWriteStream(outputPath);
    outCanvas.createPNGStream().pipe(out);
    out.on('finish', res);
    out.on('error', rej);
  });
  console.log('Done:', outputPath, `(${outW}x${outH})`);
}

(async () => {
  for (let i = 1; i <= 10; i++) {
    const src = `image-${i}.png.png`;
    const dst = `image-${i}-nobg.png`;
    if (fs.existsSync(src)) {
      await processImage(src, dst);
    } else {
      console.log('Not found:', src);
    }
  }
})();

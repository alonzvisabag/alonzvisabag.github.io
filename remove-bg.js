const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');

async function removeBg(inputPath, outputPath, threshold = 30) {
  const img = await loadImage(inputPath);
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    // אם הפיקסל קרוב ללבן — הפוך לשקוף
    if (r > 255 - threshold && g > 255 - threshold && b > 255 - threshold) {
      data[i+3] = 0;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const out = fs.createWriteStream(outputPath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => console.log('Done:', outputPath));
}

removeBg('rescue-bottle.png', 'rescue-bottle-nobg.png', 25);

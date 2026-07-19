// wm.js（浏览器版）—— 图片去水印像素算法（移植自 watermark.js）
(function () {
  // 分离式盒状模糊（多次叠加近似高斯），对 ImageData 就地处理
  function boxBlur(imageData, radius) {
    const { width, height, data } = imageData
    if (radius < 1) return
    const tmp = new Uint8ClampedArray(data.length)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, c = 0
        for (let k = -radius; k <= radius; k++) {
          const xx = x + k; const cx = xx < 0 ? 0 : xx >= width ? width - 1 : xx
          const i = (y * width + cx) * 4
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; c++
        }
        const o = (y * width + x) * 4
        tmp[o] = r / c; tmp[o + 1] = g / c; tmp[o + 2] = b / c; tmp[o + 3] = a / c
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, c = 0
        for (let k = -radius; k <= radius; k++) {
          const yy = y + k; const cy = yy < 0 ? 0 : yy >= height ? height - 1 : yy
          const i = (cy * width + x) * 4
          r += tmp[i]; g += tmp[i + 1]; b += tmp[i + 2]; a += tmp[i + 3]; c++
        }
        const o = (y * width + x) * 4
        data[o] = r / c; data[o + 1] = g / c; data[o + 2] = b / c; data[o + 3] = a / c
      }
    }
  }
  function mosaic(imageData, block) {
    const { width, height, data } = imageData
    for (let y = 0; y < height; y += block) {
      for (let x = 0; x < width; x += block) {
        let r = 0, g = 0, b = 0, a = 0, c = 0
        for (let yy = y; yy < Math.min(y + block, height); yy++) {
          for (let xx = x; xx < Math.min(x + block, width); xx++) {
            const i = (yy * width + xx) * 4
            r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; c++
          }
        }
        r /= c; g /= c; b /= c; a /= c
        for (let yy = y; yy < Math.min(y + block, height); yy++) {
          for (let xx = x; xx < Math.min(x + block, width); xx++) {
            const i = (yy * width + xx) * 4
            data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a
          }
        }
      }
    }
  }
  window.WM = { boxBlur, mosaic }
})()

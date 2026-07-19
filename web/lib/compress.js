// compress.js（浏览器版）—— 智能压缩：图片 / PDF / PPTX，纯前端零外网。
// 移植自 miniprogram/utils/{imgRecompress,pdfCompress,pptxCompress}.js，
// 把 wx.canvasToTempFilePath / fs 换成 canvas.toBlob + ArrayBuffer 直接处理。
(function () {
  // ---------- 图片重压：Uint8Array/Blob -> Uint8Array(JPEG) ----------
  // opts: { quality:0~1, maxEdge:可选目标长边像素 }
  function recompressImageBytes(bytes, opts) {
    return new Promise((resolve, reject) => {
      const quality = (opts && typeof opts.quality === 'number' && opts.quality > 0 && opts.quality <= 1) ? opts.quality : 0.6
      const maxEdge = opts && opts.maxEdge
      const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'image/jpeg' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height
          if (!w || !h) { URL.revokeObjectURL(url); return reject(new Error('图片尺寸异常')) }
          let tw = w, th = h
          if (typeof maxEdge === 'number' && maxEdge > 0) {
            const edge = Math.max(w, h)
            if (edge !== maxEdge) { const s = maxEdge / edge; tw = Math.max(1, Math.round(w * s)); th = Math.max(1, Math.round(h * s)) }
          }
          const cv = document.createElement('canvas'); cv.width = tw; cv.height = th
          const ctx = cv.getContext('2d')
          // 白底铺垫，避免 PNG 透明区变黑
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, tw, th)
          ctx.drawImage(img, 0, 0, tw, th)
          cv.toBlob(b => {
            URL.revokeObjectURL(url)
            if (!b) return reject(new Error('编码失败'))
            b.arrayBuffer().then(ab => resolve(new Uint8Array(ab))).catch(reject)
          }, 'image/jpeg', quality)
        } catch (e) { URL.revokeObjectURL(url); reject(e) }
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片解码失败')) }
      img.src = url
    })
  }

  // ---------- 单图压缩：File -> {blob, saved, name} ----------
  async function compressImageFile(file, opts) {
    const ab = await file.arrayBuffer()
    const orig = new Uint8Array(ab)
    const out = await recompressImageBytes(orig, opts)
    // 若压缩后反而更大（如原本已高度压缩的 JPEG），保留原图
    const use = out.length < orig.length ? out : orig
    const blob = new Blob([use], { type: 'image/jpeg' })
    return { blob, saved: Math.max(0, orig.length - use.length), origSize: orig.length, newSize: use.length }
  }

  // ---------- PDF 压缩 ----------
  const KW_STREAM = [115, 116, 114, 101, 97, 109]
  const KW_ENDSTREAM = [101, 110, 100, 115, 116, 114, 101, 97, 109]
  function bytesToAscii(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i] & 0x7f); return s }
  function findPattern(buf, pat, from) {
    const n = pat.length, lim = buf.length - n
    outer: for (let i = from; i <= lim; i++) { for (let j = 0; j < n; j++) { if (buf[i + j] !== pat[j]) continue outer } return i }
    return -1
  }
  function isWs(b) { return b === 32 || b === 9 || b === 10 || b === 13 }

  async function compressPdf(arrayBuffer, opts) {
    const quality = (opts && opts.quality) || 0.6
    const buf = new Uint8Array(arrayBuffer)
    const blocks = []
    let saved = 0, pos = 0
    while (pos < buf.length) {
      const si = findPattern(buf, KW_STREAM, pos)
      if (si < 0) break
      let dataStart
      if (buf[si + 6] === 0x0d && buf[si + 7] === 0x0a) { dataStart = si + 8 }
      else if (buf[si + 6] === 0x0a) { dataStart = si + 7 }
      else { pos = si + 6; continue }
      const endstreamIndex = findPattern(buf, KW_ENDSTREAM, dataStart)
      if (endstreamIndex < 0) { pos = si + 6; continue }
      let eolBefore = 0
      if (buf[endstreamIndex - 2] === 0x0d && buf[endstreamIndex - 1] === 0x0a) eolBefore = 2
      else if (buf[endstreamIndex - 1] === 0x0a) eolBefore = 1
      const dataEnd = endstreamIndex - eolBefore
      const endstreamEnd = endstreamIndex + 10
      let objIndex = -1
      for (let k = si - 1; k >= 0; k--) {
        if (buf[k] === 111 && buf[k + 1] === 98 && buf[k + 2] === 106) { if (k - 1 < 0 || isWs(buf[k - 1])) { objIndex = k; break } }
      }
      const dictStart = objIndex + 3
      const dictText = bytesToAscii(buf.subarray(dictStart, si))
      const isImage = /\/Subtype[^/]*\/Image/.test(dictText) || /\/Subtype\s+\/Image/.test(dictText)
      const isDCT = dictText.indexOf('/DCTDecode') >= 0
      const unsafeCS = /CMYK|DeviceN|Separation|CIEBased/.test(dictText)
      const block = { objIndex, dictStart, si, dataStart, endstreamIndex, dataEnd, endstreamEnd, changed: false, newData: null, newDictBytes: null }
      if (objIndex > 0 && isImage && isDCT && !unsafeCS) {
        const imageBytes = buf.subarray(dataStart, dataEnd)
        if (imageBytes.length > 1024) {
          try {
            const newData = await recompressImageBytes(imageBytes, { quality })
            if (newData.length > 0 && newData.length < imageBytes.length) {
              const lenMatch = dictText.match(/\/Length\s+(\d+)/)
              if (lenMatch) {
                const after = dictText.slice(lenMatch.index + lenMatch[0].length)
                if (!/^\s*\d+\s+R/.test(after)) {
                  const numStart = lenMatch.index + lenMatch[0].length - lenMatch[1].length
                  const numEnd = lenMatch.index + lenMatch[0].length
                  const newNum = String(newData.length)
                  const db = buf.subarray(dictStart, si)
                  const arr = []
                  for (let i = 0; i < numStart; i++) arr.push(db[i])
                  for (let i = 0; i < newNum.length; i++) arr.push(newNum.charCodeAt(i))
                  for (let i = numEnd; i < db.length; i++) arr.push(db[i])
                  block.changed = true; block.newData = newData; block.newDictBytes = new Uint8Array(arr)
                }
              }
            }
          } catch (e) { /* 保留原图 */ }
        }
      }
      if (block.changed) saved += (buf.subarray(dataStart, dataEnd).length - block.newData.length)
      blocks.push(block)
      pos = endstreamEnd
    }
    const chunks = []; let cur = 0
    for (const b of blocks) {
      if (b.changed) {
        chunks.push(buf.subarray(cur, b.dictStart)); chunks.push(b.newDictBytes)
        chunks.push(buf.subarray(b.si, b.dataStart)); chunks.push(b.newData)
        chunks.push(buf.subarray(b.dataEnd, b.endstreamEnd))
      } else { chunks.push(buf.subarray(cur, b.endstreamEnd)) }
      cur = b.endstreamEnd
    }
    chunks.push(buf.subarray(cur))
    let total = 0; for (const c of chunks) total += c.length
    const out = new Uint8Array(total); let off = 0
    for (const c of chunks) { out.set(c, off); off += c.length }
    return { data: out, saved }
  }

  // ---------- PPTX 压缩（ZIP 内 JPEG 重压）----------
  const IMAGE_RE = /\.jpe?g$/i
  async function compressPptx(arrayBuffer, opts) {
    const quality = (opts && opts.quality) || 0.6
    if (!window.fflate || !window.fflate.unzipSync) throw new Error('fflate 未加载')
    const files = window.fflate.unzipSync(new Uint8Array(arrayBuffer))
    const out = {}; let saved = 0
    for (const name in files) {
      const data = files[name]
      if (IMAGE_RE.test(name) && data.length > 1024) {
        try {
          const newData = await recompressImageBytes(data, { quality })
          if (newData.length > 0 && newData.length < data.length) { out[name] = newData; saved += (data.length - newData.length) }
          else out[name] = data
        } catch (e) { out[name] = data }
      } else { out[name] = data }
    }
    const zipped = window.fflate.zipSync(out, { level: 6 })
    return { data: zipped, saved }
  }

  window.Compress = { recompressImageBytes, compressImageFile, compressPdf, compressPptx }
})()

// pdf.js（浏览器版）—— 图片转 PDF，纯前端拼装 PDF 字节（移植自 img2pdf.js）
(function () {
  function buildPdf(images) {
    const chunks = []; let len = 0; const offsets = {}
    function pushStr(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; chunks.push(b); len += b.length }
    function pushBytes(b) { chunks.push(b); len += b.length }
    function obj(index, body) { offsets[index] = len; pushStr(index + ' 0 obj\n'); pushStr(body); pushStr('endobj\n') }
    const n = images.length; const total = 2 + n * 3
    pushStr('%PDF-1.4\n')
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>\n')
    const kids = []; for (let i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R')
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\n')
    for (let i = 0; i < n; i++) {
      const im = images[i]; const pageObj = 3 + i * 3; const imgObj = 4 + i * 3; const contentObj = 5 + i * 3
      const W = im.width; const H = im.height; const cs = im.components === 1 ? '/DeviceGray' : '/DeviceRGB'
      obj(pageObj, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + imgObj + ' 0 R >> >> /Contents ' + contentObj + ' 0 R >>\n')
      offsets[imgObj] = len; pushStr(imgObj + ' 0 obj\n')
      pushStr('<< /Type /XObject /Subtype /Image /Width ' + W + ' /Height ' + H + ' /ColorSpace ' + cs + ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>\n')
      pushStr('stream\n'); pushBytes(im.bytes); pushStr('\nendstream\nendobj\n')
      const content = 'q\n' + W + ' 0 0 ' + H + ' 0 0 cm\n/Im0 Do\nQ\n'
      obj(contentObj, '<< /Length ' + content.length + ' >>\nstream\n' + content + 'endstream\nendobj\n')
    }
    const xrefOff = len
    pushStr('xref\n'); pushStr('0 ' + (total + 1) + '\n'); pushStr('0000000000 65535 f \n')
    for (let i = 1; i <= total; i++) { let s = String(offsets[i] !== undefined ? offsets[i] : 0); while (s.length < 10) s = '0' + s; pushStr(s + ' 00000 n \n') }
    pushStr('trailer\n'); pushStr('<< /Size ' + (total + 1) + ' /Root 1 0 R >>\n'); pushStr('startxref\n'); pushStr(String(xrefOff) + '\n'); pushStr('%%EOF')
    const out = new Uint8Array(len); let p = 0
    for (const c of chunks) { out.set(c, p); p += c.length }
    return out
  }
  // 浏览器：选中的图片文件 -> {bytes(jpeg), width, height, components}
  async function loadImageFile(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const canvas = document.createElement('canvas'); canvas.width = bmp.width; canvas.height = bmp.height
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bmp, 0, 0)
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95))
    const buf = await blob.arrayBuffer()
    return { bytes: new Uint8Array(buf), width: canvas.width, height: canvas.height, components: 3 }
  }
  window.PdfUtil = { buildPdf, loadImageFile }
})()

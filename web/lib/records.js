// 解析记录本地存储（浏览器版，localStorage 替代 wx.Storage*）
(function () {
  const KEY = 'parse_records'
  const MAX = 500
  function getRecords() {
    try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch (e) { return [] }
  }
  function addRecord(rec) {
    const list = getRecords()
    const item = Object.assign({
      id: Date.now() + '_' + Math.floor(Math.random() * 1000),
      time: Date.now()
    }, rec)
    list.unshift(item)
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch (e) {}
    return list
  }
  function deleteRecord(id) {
    const list = getRecords().filter(r => r.id !== id)
    try { localStorage.setItem(KEY, JSON.stringify(list)) } catch (e) {}
    return list
  }
  function clearRecords() {
    try { localStorage.removeItem(KEY) } catch (e) {}
    return []
  }
  function getStorageInfo() {
    let used = 0
    try { used = new Blob([localStorage.getItem(KEY) || '']).size } catch (e) { used = 0 }
    const limit = 5 * 1024 * 1024 // 估算 5MB 可用
    const usedKB = used / 1024
    return {
      usedKB, limitKB: limit / 1024, remainingKB: (limit - used) / 1024,
      usedMB: usedKB.toFixed(2), limitMB: (limit / 1024 / 1024).toFixed(2),
      remainingMB: ((limit - used) / 1024 / 1024).toFixed(2),
      percent: Math.min(100, Math.round(usedKB / (limit / 1024) * 100))
    }
  }
  window.RecordsStore = { getRecords, addRecord, deleteRecord, clearRecords, getStorageInfo }
})()

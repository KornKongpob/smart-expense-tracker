const KEY = 'smart-expense-tracker:v1'

export const loadState = () => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export const saveState = (data) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export const exportJSON = (data) => {
  const str = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2))
  const a = document.createElement('a')
  a.href = str
  a.download = 'smart-expense-backup.json'
  a.click()
}

export const importJSONFromFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try { resolve(JSON.parse(reader.result)) }
      catch (e) { reject(e) }
    }
    reader.onerror = reject
    reader.readAsText(file)
  })

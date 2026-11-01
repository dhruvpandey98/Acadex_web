export function parseScalar(value) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true'
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    const number = Number(trimmed)
    if (Number.isFinite(number)) return number
  }
  return trimmed
}

export function parseCsv(contents) {
  const text = contents.replace(/^\uFEFF/, '')
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n' || character === '\r') {
      row.push(value)
      value = ''
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
      if (character === '\r' && text[index + 1] === '\n') index += 1
    } else {
      value += character
    }
  }

  if (quoted) throw new Error('CSV contains an unterminated quoted field.')
  row.push(value)
  if (row.some((cell) => cell.length > 0)) rows.push(row)
  if (rows.length === 0) return []

  const headers = rows[0].map((header) => header.trim())
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error('CSV headers must be non-empty and unique.')
  }

  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length) {
      throw new Error(`CSV row ${rowIndex + 2} has ${cells.length} fields; expected ${headers.length}.`)
    }
    return Object.fromEntries(headers.map((header, index) => [header, parseScalar(cells[index])]))
  })
}

const keyFields = {
  classes: ['class_id'],
  daily_attendance: ['Date', 'School_DBN'],
  guardians: ['guardian_id'],
  learning_style: ['student_id'],
  master_students: ['student_id'],
  performance_regression: ['student_id'],
  students: ['student_id'],
  student_health_attendance: ['student_id', 'Date'],
  student_performance_factors: ['student_id'],
  subject_counselling: ['student_id'],
  teachers: ['teacher_id'],
  uci_student_performance: ['student_id'],
}

export function datasetDocumentId(table, row) {
  const fields = keyFields[table]
  if (!fields) throw new Error(`No stable key is configured for dataset table "${table}".`)
  const values = fields.map((field) => row[field])
  if (values.some((value) => value === undefined || value === null || value === '')) {
    throw new Error(`A row in dataset table "${table}" is missing a stable key.`)
  }
  return `${table}:${values.map((value) => encodeURIComponent(String(value))).join(':')}`
}

export const datasetTableNames = Object.keys(keyFields)

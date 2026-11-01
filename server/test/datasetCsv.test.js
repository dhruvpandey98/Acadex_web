import assert from 'node:assert/strict'
import { test } from 'node:test'
import { datasetDocumentId, parseCsv, parseScalar } from '../src/services/datasetCsv.js'

test('CSV parser supports quoted delimiters, escaped quotes, and embedded newlines', () => {
  assert.deepEqual(parseCsv('id,name,note\r\n1,"Smith, Jordan","Said ""hello"""\r\n2,Ada,"line one\nline two"\r\n'), [
    { id: 1, name: 'Smith, Jordan', note: 'Said "hello"' },
    { id: 2, name: 'Ada', note: 'line one\nline two' },
  ])
})

test('CSV parser rejects rows whose field count does not match the header', () => {
  assert.throws(() => parseCsv('id,name\n1,Ada,extra'), /expected 2/)
})

test('scalar parsing keeps yes/no labels and converts numeric and boolean values', () => {
  assert.equal(parseScalar('42.5'), 42.5)
  assert.equal(parseScalar('true'), true)
  assert.equal(parseScalar('Yes'), 'Yes')
})

test('dataset document IDs are stable and include compound attendance keys', () => {
  assert.equal(datasetDocumentId('students', { student_id: 'STU1000' }), 'students:STU1000')
  assert.equal(datasetDocumentId('daily_attendance', { Date: '2025-07-01', School_DBN: '01M001' }), 'daily_attendance:2025-07-01:01M001')
  assert.throws(() => datasetDocumentId('students', {}), /missing a stable key/)
})

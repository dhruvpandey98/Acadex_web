import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { connectDatabase } from '../config/db.js'
import { datasetDocumentId, datasetTableNames, parseCsv } from '../services/datasetCsv.js'

const dataDirectory = fileURLToPath(new URL('../../data/acadex-dataset/', import.meta.url))
const batchSize = 250
const expectedRowCounts = {
  classes: 14,
  daily_attendance: 1568,
  guardians: 300,
  learning_style: 300,
  master_students: 300,
  performance_regression: 300,
  students: 300,
  student_health_attendance: 4500,
  student_performance_factors: 300,
  subject_counselling: 300,
  teachers: 14,
  uci_student_performance: 300,
}

export async function importDataset() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DATASET_IMPORT !== 'yes') {
    throw new Error('For a production import, set ALLOW_DATASET_IMPORT=yes for this command only.')
  }

  const tables = []
  for (const table of datasetTableNames) {
    const csvPath = path.join(dataDirectory, `${table}.csv`)
    const rows = parseCsv(await readFile(csvPath, 'utf8'))
    if (rows.length !== expectedRowCounts[table]) {
      throw new Error(`${table}.csv has ${rows.length} rows; expected ${expectedRowCounts[table]}.`)
    }

    const ids = new Set()
    for (const row of rows) {
      const id = datasetDocumentId(table, row)
      if (ids.has(id)) throw new Error(`${table}.csv contains duplicate source key "${id}".`)
      ids.add(id)
    }
    tables.push({ table, rows })
  }

  await connectDatabase()
  const summary = []

  for (const { table, rows } of tables) {
    const collection = mongoose.connection.collection(`dataset_${table}`)

    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const operations = rows.slice(offset, offset + batchSize).map((row) => {
        const id = datasetDocumentId(table, row)
        return {
          updateOne: {
            filter: { _id: id },
            update: { $set: { ...row, _dataset: 'acadex-mock-data' } },
            upsert: true,
          },
        }
      })
      if (operations.length) await collection.bulkWrite(operations, { ordered: true })
    }

    summary.push({ collection: `dataset_${table}`, imported: rows.length, stored: await collection.countDocuments() })
  }

  console.info(`Dataset import complete: ${summary.length} collections checked.`)
  for (const item of summary) console.info(`${item.collection}: ${item.imported} source rows; ${item.stored} stored rows.`)
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await importDataset()
  } catch (error) {
    console.error(`Dataset import failed: ${error.message}`)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

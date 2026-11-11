import assert from 'node:assert/strict'
import { test } from 'node:test'
import mongoose from 'mongoose'
import { assignmentVisibilityForStudents } from '../src/utils/assignmentVisibility.js'

test('assignment visibility includes class-wide work and only the selected students', () => {
  const studentIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()]
  assert.deepEqual(assignmentVisibilityForStudents(studentIds), {
    $or: [
      { targetStudents: { $size: 0 } },
      { targetStudents: { $in: studentIds } },
    ],
  })
})

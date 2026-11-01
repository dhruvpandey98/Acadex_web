import { Router } from 'express'
import { query } from 'express-validator'
import mongoose from 'mongoose'
import { authenticate, allowRoles } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { asyncHandler } from '../utils/errors.js'
import { datasetTableNames } from '../services/datasetCsv.js'

const router = Router()
const numberValue = (value) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const isAtRisk = (value) => value === true || value === 1 || ['yes', 'true', '1', 'at risk'].includes(String(value).trim().toLowerCase())

router.use(authenticate, allowRoles('admin'))

router.get('/insights',
  query('page').optional().isInt({ min: 1, max: 10000 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('search').optional().isString().isLength({ max: 100 }),
  validate,
  asyncHandler(async (req, res) => {
    const [tableCounts, studentRows, classRows] = await Promise.all([
      Promise.all(datasetTableNames.map(async (table) => ({
        table,
        count: await mongoose.connection.collection(`dataset_${table}`).countDocuments(),
      }))),
      mongoose.connection.collection('dataset_master_students').find({}, {
        projection: {
          _id: 0,
          student_id: 1,
          name: 1,
          class_id: 1,
          Exam_Score: 1,
          Attendance_Pct: 1,
          At_Risk: 1,
        },
      }).toArray(),
      mongoose.connection.collection('dataset_classes').find({}, {
        projection: { _id: 0, class_id: 1, grade: 1, section: 1 },
      }).toArray(),
    ])

    const classLabels = new Map(classRows.map((item) => [
      String(item.class_id),
      `Grade ${item.grade}-${item.section}`,
    ]))
    const groups = new Map()
    let scoreTotal = 0
    let scoreCount = 0
    let attendanceTotal = 0
    let attendanceCount = 0
    let atRiskCount = 0

    const students = studentRows.map((student) => {
      const examScore = numberValue(student.Exam_Score)
      const attendance = numberValue(student.Attendance_Pct)
      const atRisk = isAtRisk(student.At_Risk)
      const classId = String(student.class_id ?? '')
      const classLabel = classLabels.get(classId) || classId || 'Unassigned'
      const group = groups.get(classId) || { classId, classLabel, students: 0, atRisk: 0, scoreTotal: 0, scoreCount: 0 }

      group.students += 1
      if (atRisk) {
        group.atRisk += 1
        atRiskCount += 1
      }
      if (examScore !== null) {
        scoreTotal += examScore
        scoreCount += 1
        group.scoreTotal += examScore
        group.scoreCount += 1
      }
      if (attendance !== null) {
        attendanceTotal += attendance
        attendanceCount += 1
      }
      groups.set(classId, group)

      return {
        studentId: student.student_id,
        name: student.name,
        classLabel,
        examScore,
        attendance,
        atRisk,
      }
    })

    const search = String(req.query.search || '').trim().toLowerCase()
    const filteredStudents = search
      ? students.filter((student) => `${student.studentId} ${student.name} ${student.classLabel}`.toLowerCase().includes(search))
      : students
    const page = Number(req.query.page || 1)
    const limit = Number(req.query.limit || 10)
    const start = (page - 1) * limit
    const classSummary = [...groups.values()]
      .map(({ scoreTotal: total, scoreCount: count, ...group }) => ({
        ...group,
        averageExamScore: count ? Math.round((total / count) * 10) / 10 : null,
      }))
      .sort((left, right) => left.classLabel.localeCompare(right.classLabel, undefined, { numeric: true }))

    res.json({
      data: {
        summary: {
          students: studentRows.length,
          classes: classRows.length,
          atRisk: atRiskCount,
          averageExamScore: scoreCount ? Math.round((scoreTotal / scoreCount) * 10) / 10 : null,
          averageAttendance: attendanceCount ? Math.round((attendanceTotal / attendanceCount) * 10) / 10 : null,
        },
        collections: tableCounts,
        classes: classSummary,
        students: filteredStudents.slice(start, start + limit),
        pagination: {
          page,
          limit,
          total: filteredStudents.length,
          pages: Math.ceil(filteredStudents.length / limit),
        },
      },
    })
  }),
)

export default router

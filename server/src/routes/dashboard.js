import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'
import { Assignment, Attendance, Grade, Parent, SchoolClass, Student, Submission, Teacher } from '../models/index.js'
import { asyncHandler } from '../utils/errors.js'
import { attendancePercentage } from '../utils/attendance.js'

const router = Router()
router.use(authenticate)

async function attendanceStats(match = {}) {
  const [stats] = await Attendance.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } } } },
  ])
  const total = stats?.total || 0
  return { total, percentage: attendancePercentage(stats?.present || 0, total) }
}

router.get('/:role', asyncHandler(async (req, res) => {
  const role = req.params.role
  const user = req.user
  let data

  if (role === 'admin' && user.role === 'admin') {
    const [students, teachers, parents, classes, attendance, enrollment, performance, attendanceTrend, gradeDistribution] = await Promise.all([
      Student.countDocuments(),
      Teacher.countDocuments(),
      Parent.countDocuments(),
      SchoolClass.countDocuments(),
      attendanceStats({ date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Student.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m', date: '$admissionDate' } }, count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Grade.aggregate([{ $group: { _id: '$subjectId', average: { $avg: '$percentage' } } }, { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } }, { $unwind: { path: '$subject', preserveNullAndEmptyArrays: true } }, { $project: { _id: 0, subject: '$subject.name', average: { $round: ['$average', 1] } } }]),
      Attendance.aggregate([{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } }, total: { $sum: 1 } } }, { $sort: { _id: -1 } }, { $limit: 30 }, { $sort: { _id: 1 } }, { $project: { _id: 0, date: '$_id', present: { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 1] }, absent: { $subtract: [100, { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 1] }] } } }]),
      Grade.aggregate([{ $bucket: { groupBy: '$percentage', boundaries: [0, 40, 50, 60, 70, 80, 90, 101], default: 'ungraded', output: { count: { $sum: 1 } } } }]),
    ])
    data = { students, teachers, parents, classes, attendance, enrollment, performance, attendanceTrend, gradeDistribution }
  } else if (role === 'teacher' && user.role === 'teacher') {
    const teacher = await Teacher.findOne({ userId: user.id }).select('_id assignedClasses')
    const classIds = teacher?.assignedClasses || []
    const [students, attendance, assignments, pendingSubmissions, recentSubmissions, performance] = await Promise.all([
      Student.countDocuments({ classId: { $in: classIds } }),
      attendanceStats({ classId: { $in: classIds }, date: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
      Assignment.countDocuments({ teacherId: teacher?._id, status: 'published' }),
      Submission.countDocuments({ status: 'submitted', assignmentId: { $in: await Assignment.find({ classId: { $in: classIds } }).distinct('_id') } }),
      Submission.find({ assignmentId: { $in: await Assignment.find({ classId: { $in: classIds } }).distinct('_id') } }).sort({ submittedAt: -1 }).limit(10).populate('studentId', 'name'),
      Grade.aggregate([{ $match: { classId: { $in: classIds } } }, { $group: { _id: '$classId', average: { $avg: '$percentage' } } }]),
    ])
    data = { classes: classIds.length, students, attendance, assignments, pendingSubmissions, recentSubmissions, performance }
  } else if (role === 'student' && user.role === 'student') {
    const student = await Student.findOne({ userId: user.id }).select('_id classId')
    if (!student) {
      return res.json({ data: { attendance: { total: 0, percentage: 0 }, pendingAssignments: 0, grades: [], subjectPerformance: [] } })
    }
    const studentId = student._id
    const [attendance, pendingAssignments, grades, subjectPerformance] = await Promise.all([
      attendanceStats({ studentId }),
      Assignment.countDocuments({ classId: student?.classId, status: 'published', dueDate: { $gte: new Date() }, _id: { $nin: await Submission.find({ studentId }).distinct('assignmentId') } }),
      Grade.find({ studentId }).sort({ createdAt: -1 }).limit(10).populate('subjectId', 'name'),
      Grade.aggregate([{ $match: { studentId } }, { $group: { _id: '$subjectId', average: { $avg: '$percentage' } } }, { $lookup: { from: 'subjects', localField: '_id', foreignField: '_id', as: 'subject' } }, { $unwind: { path: '$subject', preserveNullAndEmptyArrays: true } }, { $project: { _id: 0, subject: '$subject.name', average: { $round: ['$average', 1] } } }]),
    ])
    data = { attendance, pendingAssignments, grades, subjectPerformance }
  } else if (role === 'parent' && user.role === 'parent') {
    const parent = await Parent.findOne({ userId: user.id }).select('children')
    const childIds = parent?.children || []
    const [children, grades, attendance, assignments] = await Promise.all([
      Student.find({ _id: { $in: childIds } }).select('name classId'),
      Grade.find({ studentId: { $in: childIds } }).sort({ createdAt: -1 }).limit(20).populate('studentId', 'name').populate('subjectId', 'name'),
      Attendance.aggregate([{ $match: { studentId: { $in: childIds } } }, { $group: { _id: '$studentId', total: { $sum: 1 }, present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } } } }, { $project: { _id: 1, percentage: { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 1] } } }]),
      Assignment.find({ classId: { $in: await Student.find({ _id: { $in: childIds } }).distinct('classId') }, dueDate: { $gte: new Date() } }).sort({ dueDate: 1 }).limit(10),
    ])
    data = { children, grades, attendance, assignments }
  } else {
    return res.status(403).json({ error: { message: 'You do not have permission to view this dashboard.' } })
  }

  res.json({ data })
}))

export default router

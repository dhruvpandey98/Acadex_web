import { Router } from 'express'
import { body, param, query } from 'express-validator'
import {
  Assignment, SchoolClass, Student, Submission, Subject, Teacher, Upload,
} from '../models/index.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { AppError, asyncHandler } from '../utils/errors.js'

const router = Router()
router.use(authenticate)

async function teacherContext(user) {
  if (user.role !== 'teacher') return null
  const teacher = await Teacher.findOne({ userId: user.id }).select('_id assignedClasses subjects')
  if (!teacher) throw new AppError(403, 'Your teacher profile is not linked to this account.')
  return teacher
}

function assignmentScope(user, teacher, student) {
  if (user.role === 'admin') return {}
  if (user.role === 'teacher') {
    return { $or: [{ teacherId: teacher._id }, { classId: { $in: teacher.assignedClasses } }] }
  }
  if (user.role === 'student' && student) {
    return {
      classId: student.classId,
      status: { $in: ['published', 'closed'] },
      $or: [{ targetStudents: { $size: 0 } }, { targetStudents: student._id }],
    }
  }
  return { _id: null }
}

function submissionStatus(submission, assignment) {
  if (!submission) return 'pending'
  if (submission.status === 'graded' || submission.status === 'reviewed') return submission.status
  return new Date(submission.submittedAt) > new Date(assignment.dueDate) ? 'late' : 'submitted'
}

async function fileDetails(ids = []) {
  if (!ids.length) return []
  const files = await Upload.find({ _id: { $in: ids } }).select('originalName mimeType size')
  return files.map((file) => ({
    id: file.id,
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: `/api/uploads/${file.id}`,
  }))
}

async function assignmentPayload(assignment, students, submissions, includeRoster) {
  const roster = students.filter((student) => (
    student.classId?.toString() === assignment.classId._id.toString()
    && (!assignment.targetStudents.length || assignment.targetStudents.some((id) => id.toString() === student.id))
  ))
  const assignmentSubmissions = submissions.filter((submission) => (
    submission.assignmentId.toString() === assignment.id
  ))
  const submissionsByStudent = new Map(assignmentSubmissions.map((item) => [item.studentId.toString(), item]))
  const rows = await Promise.all(roster.map(async (student) => {
    const submission = submissionsByStudent.get(student.id)
    if (!submission) return { student: studentSummary(student), status: 'pending', submission: null }
    return {
      student: studentSummary(student),
      status: submissionStatus(submission, assignment),
      submission: {
        id: submission.id,
        submissionText: submission.submissionText,
        submittedAt: submission.submittedAt,
        marksObtained: submission.marksObtained,
        feedback: submission.feedback,
        status: submissionStatus(submission, assignment),
        history: submission.history,
        attachments: await fileDetails(submission.attachments),
      },
    }
  }))
  const counts = {
    assigned: roster.length,
    submitted: rows.filter((row) => row.submission).length,
    pending: rows.filter((row) => row.status === 'pending').length,
    late: rows.filter((row) => row.status === 'late').length,
    graded: rows.filter((row) => row.status === 'graded').length,
  }
  counts.progress = counts.assigned ? Math.round(counts.submitted * 100 / counts.assigned) : 0
  const ownSubmission = includeRoster ? null : rows[0]?.submission || null
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description,
    instructions: assignment.instructions,
    subject: assignment.subjectId?.name || '—',
    subjectId: assignment.subjectId?._id || assignment.subjectId,
    className: assignment.classId?.section ? `${assignment.classId.name} · ${assignment.classId.section}` : assignment.classId?.name,
    classId: assignment.classId?._id || assignment.classId,
    teacher: assignment.teacherId?.name || 'Teacher',
    teacherId: assignment.teacherId?._id || assignment.teacherId,
    assignedAt: assignment.createdAt,
    dueDate: assignment.dueDate,
    totalMarks: assignment.totalMarks,
    allowResubmission: assignment.allowResubmission,
    status: assignment.status,
    attachments: await fileDetails(assignment.attachments),
    counts,
    submissions: includeRoster ? rows : undefined,
    submission: ownSubmission,
    submissionStatus: includeRoster ? undefined : rows[0]?.status || 'pending',
  }
}

function studentSummary(student) {
  return {
    id: student.id,
    name: student.name,
    rollNumber: student.rollNumber,
    email: student.email,
  }
}

router.get('/',
  query('classId').optional().isMongoId(),
  query('subjectId').optional().isMongoId(),
  query('assignmentId').optional().isMongoId(),
  query('status').optional().isIn(['all', 'pending', 'submitted', 'late', 'reviewed', 'graded']),
  validate,
  asyncHandler(async (req, res) => {
    const teacher = await teacherContext(req.user)
    const student = req.user.role === 'student'
      ? await Student.findOne({ userId: req.user.id }).select('_id name rollNumber email classId')
      : null
    if (req.user.role === 'student' && !student) throw new AppError(403, 'Your student profile is not linked to this account.')
    if (!['admin', 'teacher', 'student'].includes(req.user.role)) throw new AppError(403, 'Assignments are not available for this role.')

    const scope = assignmentScope(req.user, teacher, student)
    if (req.query.classId) scope.classId = req.query.classId
    if (req.query.subjectId) scope.subjectId = req.query.subjectId
    if (req.query.assignmentId) scope._id = req.query.assignmentId
    let assignments = await Assignment.find(scope)
      .sort({ dueDate: 1 })
      .populate('subjectId', 'name')
      .populate('classId', 'name section')
      .populate('teacherId', 'name')
    if (req.user.role === 'student') assignments = assignments.filter((assignment) => assignment.status === 'published' || assignment.status === 'closed')

    const assignmentIds = assignments.map((assignment) => assignment._id)
    const classIds = [...new Set(assignments.map((assignment) => assignment.classId?._id?.toString()).filter(Boolean))]
    const [students, submissions] = await Promise.all([
      req.user.role === 'student'
        ? Promise.resolve(student ? [student] : [])
        : Student.find({ classId: { $in: classIds }, status: 'active' }).select('_id name rollNumber email classId'),
      Submission.find({
        assignmentId: { $in: assignmentIds },
        ...(student ? { studentId: student._id } : {}),
      }).sort({ submittedAt: -1 }),
    ])
    let data = await Promise.all(assignments.map((assignment) => assignmentPayload(assignment, students, submissions, req.user.role !== 'student')))

    if (req.query.status && req.query.status !== 'all') {
      data = req.user.role === 'student'
        ? data.filter((assignment) => assignment.submissionStatus === req.query.status)
        : data.map((assignment) => ({
          ...assignment,
          submissions: assignment.submissions.filter((row) => row.status === req.query.status),
        })).filter((assignment) => assignment.submissions.length)
    }

    let options = {}
    if (req.user.role === 'teacher') {
      const classIdsForTeacher = teacher.assignedClasses
      const [classes, subjects, roster] = await Promise.all([
        SchoolClass.find({ _id: { $in: classIdsForTeacher } }).select('name section'),
        Subject.find({ classId: { $in: classIdsForTeacher } }).select('name classId'),
        Student.find({ classId: { $in: classIdsForTeacher }, status: 'active' }).select('_id name rollNumber classId'),
      ])
      options = {
        classes,
        subjects,
        students: roster.map((item) => ({ ...studentSummary(item), classId: item.classId })),
      }
    }
    res.json({ data, options })
  }),
)

router.post('/',
  body('title').trim().isLength({ min: 2, max: 200 }),
  body('description').optional().isString().isLength({ max: 10000 }),
  body('instructions').optional().isString().isLength({ max: 10000 }),
  body('classId').isMongoId(),
  body('subjectId').isMongoId(),
  body('teacherId').optional().isMongoId(),
  body('targetStudents').optional().isArray({ max: 500 }),
  body('targetStudents.*').optional().isMongoId(),
  body('dueDate').isISO8601(),
  body('totalMarks').isFloat({ min: 1, max: 100000 }),
  body('attachments').optional().isArray({ max: 10 }),
  body('attachments.*').optional().isMongoId(),
  body('allowResubmission').optional().isBoolean(),
  validate,
  asyncHandler(async (req, res) => {
    if (!['admin', 'teacher'].includes(req.user.role)) throw new AppError(403, 'Only teachers can create assignments.')
    const teacher = await teacherContext(req.user)
    const teacherId = req.user.role === 'teacher' ? teacher.id : req.body.teacherId
    if (!teacherId) throw new AppError(400, 'Choose a teacher for this assignment.')
    const [assignedTeacher, schoolClass, subject] = await Promise.all([
      Teacher.findById(teacherId).select('_id assignedClasses'),
      SchoolClass.findById(req.body.classId).select('_id'),
      Subject.findById(req.body.subjectId).select('_id classId'),
    ])
    if (!assignedTeacher || !schoolClass || !subject || subject.classId.toString() !== schoolClass.id) {
      throw new AppError(400, 'Choose a valid class, subject, and teacher.')
    }
    if (!assignedTeacher.assignedClasses.some((id) => id.toString() === schoolClass.id)) {
      throw new AppError(403, 'The selected teacher is not assigned to this class.')
    }
    if (teacher && !teacher.assignedClasses.some((id) => id.toString() === schoolClass.id)) {
      throw new AppError(403, 'You can only create assignments for your assigned classes.')
    }

    const targetStudents = req.body.targetStudents || []
    const targetCount = targetStudents.length
      ? await Student.countDocuments({ _id: { $in: targetStudents }, classId: schoolClass.id, status: 'active' })
      : 0
    if (targetStudents.length && targetCount !== new Set(targetStudents).size) {
      throw new AppError(400, 'One or more selected students are not active members of this class.')
    }
    const attachments = req.body.attachments || []
    const attachedFiles = attachments.length
      ? await Upload.countDocuments({ _id: { $in: attachments }, storedBy: req.user.id })
      : 0
    if (attachedFiles !== new Set(attachments).size) throw new AppError(400, 'One or more reference files are invalid.')

    const dueDate = new Date(req.body.dueDate)
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.body.dueDate)) dueDate.setHours(23, 59, 59, 999)
    const assignment = await Assignment.create({
      title: req.body.title,
      description: req.body.description || '',
      instructions: req.body.instructions || '',
      classId: schoolClass.id,
      subjectId: subject.id,
      teacherId: assignedTeacher.id,
      targetStudents,
      dueDate,
      totalMarks: Number(req.body.totalMarks),
      attachments,
      allowResubmission: req.body.allowResubmission !== false,
      status: 'published',
    })
    res.status(201).json({ data: { id: assignment.id } })
  }),
)

router.post('/:assignmentId/submissions',
  param('assignmentId').isMongoId(),
  body('attachments').isArray({ min: 1, max: 5 }),
  body('attachments.*').isMongoId(),
  body('submissionText').optional().isString().isLength({ max: 20000 }),
  validate,
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') throw new AppError(403, 'Only students can submit assignments.')
    const student = await Student.findOne({ userId: req.user.id }).select('_id classId')
    if (!student) throw new AppError(403, 'Your student profile is not linked to this account.')
    const assignment = await Assignment.findOne({
      _id: req.params.assignmentId,
      classId: student.classId,
      status: 'published',
      $or: [{ targetStudents: { $size: 0 } }, { targetStudents: student.id }],
    })
    if (!assignment) throw new AppError(404, 'Assignment not found.')
    const fileCount = await Upload.countDocuments({ _id: { $in: req.body.attachments }, storedBy: req.user.id })
    if (fileCount !== new Set(req.body.attachments).size) throw new AppError(400, 'One or more submission files are invalid.')

    let submission = await Submission.findOne({ assignmentId: assignment.id, studentId: student.id })
    if (submission && !assignment.allowResubmission) {
      throw new AppError(409, 'This assignment does not allow resubmissions.')
    }
    const submittedAt = new Date()
    const status = submittedAt > assignment.dueDate ? 'late' : 'submitted'
    if (submission) {
      submission.history.push({
        submissionText: submission.submissionText,
        attachments: submission.attachments,
        submittedAt: submission.submittedAt,
        marksObtained: submission.marksObtained,
        feedback: submission.feedback,
        status: submission.status,
        reviewedBy: submission.reviewedBy,
      })
      submission.submissionText = req.body.submissionText || ''
      submission.attachments = req.body.attachments
      submission.submittedAt = submittedAt
      submission.marksObtained = null
      submission.feedback = ''
      submission.status = status
      submission.reviewedBy = null
      await submission.save()
    } else {
      submission = await Submission.create({
        assignmentId: assignment.id,
        studentId: student.id,
        submissionText: req.body.submissionText || '',
        attachments: req.body.attachments,
        submittedAt,
        status,
      })
    }
    res.status(201).json({ data: { id: submission.id, status } })
  }),
)

router.put('/submissions/:submissionId/review',
  param('submissionId').isMongoId(),
  body('status').optional().isIn(['reviewed', 'graded']),
  body('marksObtained').optional({ nullable: true }).isFloat({ min: 0 }),
  body('feedback').optional().isString().isLength({ max: 5000 }),
  validate,
  asyncHandler(async (req, res) => {
    if (!['admin', 'teacher'].includes(req.user.role)) throw new AppError(403, 'Only teachers can evaluate submissions.')
    const submission = await Submission.findById(req.params.submissionId)
    if (!submission) throw new AppError(404, 'Submission not found.')
    const assignment = await Assignment.findById(submission.assignmentId).select('teacherId classId totalMarks')
    if (!assignment) throw new AppError(404, 'Assignment not found.')
    if (req.user.role === 'teacher') {
      const teacher = await teacherContext(req.user)
      const managesAssignment = assignment.teacherId.toString() === teacher.id
        || teacher.assignedClasses.some((id) => id.toString() === assignment.classId.toString())
      if (!managesAssignment) throw new AppError(403, 'You can only evaluate assignments you manage.')
    }
    const marksProvided = req.body.marksObtained !== undefined && req.body.marksObtained !== null
    if (marksProvided && req.body.marksObtained > assignment.totalMarks) {
      throw new AppError(400, 'Marks cannot exceed the assignment total.')
    }
    const status = req.body.status || (marksProvided ? 'graded' : 'reviewed')
    if (status === 'graded' && !marksProvided && submission.marksObtained == null) {
      throw new AppError(400, 'Enter marks to mark this submission as graded.')
    }
    if (marksProvided) submission.marksObtained = Number(req.body.marksObtained)
    if (req.body.feedback !== undefined) submission.feedback = req.body.feedback
    submission.status = status
    submission.reviewedBy = req.user.id
    await submission.save()
    res.json({ data: { id: submission.id, status: submission.status, marksObtained: submission.marksObtained, feedback: submission.feedback } })
  }),
)

export default router

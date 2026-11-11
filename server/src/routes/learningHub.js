import { Router } from 'express'
import { body, param, query } from 'express-validator'
import {
  AcademicDigest, Announcement, Assignment, LearningPlan, Parent, ParentDigest, PortfolioEntry,
  Student, Submission, SupportRequest, Teacher, Upload,
} from '../models/index.js'
import { authenticate } from '../middleware/auth.js'
import { aiRateLimiter } from '../middleware/aiRateLimiter.js'
import { validate } from '../middleware/validate.js'
import { generateStudyPlan, generateWeeklyDigest, suggestRevisionSteps } from '../services/learningHubAI.js'
import { AppError, asyncHandler } from '../utils/errors.js'

const router = Router()
router.use(authenticate)

function currentWeekStart() {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return date.toISOString().slice(0, 10)
}

async function getStudent(user) {
  if (user.role !== 'student') throw new AppError(403, 'This Learning Hub feature is for student accounts.')
  const student = await Student.findOne({ userId: user.id }).select('_id classId name')
  if (!student) throw new AppError(403, 'Your student profile is not linked to this account.')
  return student
}

async function getTeacher(user) {
  if (user.role !== 'teacher') throw new AppError(403, 'Only teachers can manage student support requests.')
  const teacher = await Teacher.findOne({ userId: user.id }).select('_id assignedClasses')
  if (!teacher) throw new AppError(403, 'Your teacher profile is not linked to this account.')
  return teacher
}

async function getParentStudent(user, studentId) {
  if (user.role !== 'parent') throw new AppError(403, 'Only parents can view a child’s weekly digest.')
  const parent = await Parent.findOne({ userId: user.id }).select('children')
  if (!parent) throw new AppError(403, 'Your parent profile is not linked to this account.')
  const children = await Student.find({ _id: { $in: parent.children } }).select('_id name classId').lean()
  const selectedId = studentId || children[0]?._id?.toString()
  if (!selectedId) return { children, student: null }
  const student = children.find((item) => item._id.toString() === String(selectedId))
  if (!student) throw new AppError(403, 'You can only view digests for children linked to your account.')
  return { children, student }
}

function visibleAssignmentQuery(student) {
  return {
    classId: student.classId,
    status: 'published',
    $or: [{ targetStudents: { $size: 0 } }, { targetStudents: { $exists: false } }, { targetStudents: student._id }],
  }
}

async function assignmentSnapshot(student) {
  const assignments = await Assignment.find(visibleAssignmentQuery(student))
    .sort({ dueDate: 1 })
    .populate('subjectId', 'name')
    .populate('teacherId', 'name')
    .select('title subjectId teacherId dueDate totalMarks description')
    .lean()
  const submissions = await Submission.find({
    studentId: student._id,
    assignmentId: { $in: assignments.map((item) => item._id) },
  }).select('assignmentId submittedAt status marksObtained feedback nextSteps attachments')
    .lean()
  const byAssignment = new Map(submissions.map((item) => [item.assignmentId.toString(), item]))
  return assignments.map((item) => {
    const submission = byAssignment.get(item._id.toString())
    const status = !submission ? 'pending'
      : ['graded', 'reviewed'].includes(submission.status) ? submission.status
        : new Date(submission.submittedAt) > new Date(item.dueDate) ? 'late' : 'submitted'
    return {
      id: item._id.toString(),
      title: item.title,
      subject: item.subjectId?.name || 'Classwork',
      teacher: item.teacherId?.name || 'Your teacher',
      dueDate: item.dueDate,
      totalMarks: item.totalMarks,
      status,
      marksObtained: submission?.marksObtained ?? null,
      feedback: submission?.feedback || '',
      nextSteps: submission?.nextSteps || [],
      submissionId: submission?._id?.toString() || null,
      attachments: submission?.attachments || [],
    }
  })
}

async function fileDetails(ids = []) {
  if (!ids.length) return []
  const files = await Upload.find({ _id: { $in: ids } }).select('originalName mimeType size').lean()
  return files.map((file) => ({
    id: file._id.toString(),
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    url: `/api/uploads/${file._id}`,
  }))
}

function serializePortfolio(entry) {
  const submission = entry.submissionId
  const assignment = submission?.assignmentId
  return {
    id: entry._id.toString(),
    submissionId: submission?._id?.toString() || null,
    reflection: entry.reflection,
    createdAt: entry.createdAt,
    assignment: assignment ? {
      id: assignment._id.toString(),
      title: assignment.title,
      subject: assignment.subjectId?.name || 'Classwork',
      totalMarks: assignment.totalMarks,
    } : null,
    marksObtained: submission?.marksObtained ?? null,
    feedback: submission?.feedback || '',
    files: submission ? submission.attachments : [],
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const student = await getStudent(req.user)
  const weekStarting = currentWeekStart()
  const [assignments, plan, digest, entries, announcements, requests] = await Promise.all([
    assignmentSnapshot(student),
    LearningPlan.findOne({ studentId: student.id, weekStarting }).lean(),
    AcademicDigest.findOne({ userId: req.user.id, weekStarting }).lean(),
    PortfolioEntry.find({ studentId: student.id }).sort({ createdAt: -1 })
      .populate({ path: 'submissionId', select: 'assignmentId marksObtained feedback attachments', populate: { path: 'assignmentId', select: 'title totalMarks subjectId', populate: { path: 'subjectId', select: 'name' } } })
      .lean(),
    Announcement.find({
      publishedAt: { $gte: new Date(`${weekStarting}T00:00:00.000Z`) },
      $and: [
        { $or: [{ targetRoles: { $size: 0 } }, { targetRoles: { $exists: false } }, { targetRoles: 'student' }] },
        { $or: [{ targetClasses: { $size: 0 } }, { targetClasses: { $exists: false } }, { targetClasses: student.classId }] },
      ],
    }).sort({ publishedAt: -1 }).limit(10).select('title content publishedAt').lean(),
    SupportRequest.find({ studentId: student.id }).sort({ createdAt: -1 }).limit(20)
      .populate('assignmentId', 'title').lean(),
  ])
  const portfolio = await Promise.all(entries.map(async (entry) => {
    const item = serializePortfolio(entry)
    if (item.files?.length) item.files = await fileDetails(item.files)
    return item
  }))
  res.json({
    data: {
      weekStarting,
      assignments,
      plan: plan ? { ...plan, id: plan._id.toString() } : null,
      digest: digest ? { ...digest, id: digest._id.toString() } : null,
      portfolio,
      announcements,
      supportRequests: requests.map((request) => ({
        id: request._id.toString(),
        assignmentId: request.assignmentId?._id?.toString() || request.assignmentId?.toString(),
        assignment: request.assignmentId?.title || 'Assignment',
        message: request.message,
        responseMessage: request.responseMessage,
        status: request.status,
        createdAt: request.createdAt,
      })),
    },
  })
}))

router.get('/parent-digest',
  query('studentId').optional().isMongoId(),
  validate,
  asyncHandler(async (req, res) => {
    const { children, student } = await getParentStudent(req.user, req.query.studentId)
    const weekStarting = currentWeekStart()
    const digest = student
      ? await ParentDigest.findOne({ userId: req.user.id, studentId: student._id, weekStarting }).lean()
      : null
    res.json({
      data: {
        weekStarting,
        children: children.map((item) => ({ id: item._id.toString(), name: item.name })),
        selectedStudentId: student?._id.toString() || '',
        digest: digest ? { ...digest, id: digest._id.toString() } : null,
      },
    })
  }),
)

router.post('/plan', aiRateLimiter, asyncHandler(async (req, res) => {
  const student = await getStudent(req.user)
  const weekStarting = currentWeekStart()
  const weekEnding = new Date(`${weekStarting}T00:00:00.000Z`)
  weekEnding.setUTCDate(weekEnding.getUTCDate() + 6)
  const assignments = (await assignmentSnapshot(student))
    .filter((item) => ['pending', 'late'].includes(item.status) && new Date(item.dueDate) <= weekEnding)
  if (!assignments.length) throw new AppError(400, 'You have no outstanding assignments due this week.')
  const plan = await generateStudyPlan({ assignments, weekStarting })
  const saved = await LearningPlan.findOneAndUpdate(
    { studentId: student.id, weekStarting },
    { $set: { summary: plan.summary, items: plan.items, generatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )
  res.json({ data: saved })
}))

router.post('/digest', aiRateLimiter, asyncHandler(async (req, res) => {
  const student = await getStudent(req.user)
  const weekStarting = currentWeekStart()
  const [assignments, announcements] = await Promise.all([
    assignmentSnapshot(student),
    Announcement.find({
      publishedAt: { $gte: new Date(`${weekStarting}T00:00:00.000Z`) },
      $and: [
        { $or: [{ targetRoles: { $size: 0 } }, { targetRoles: { $exists: false } }, { targetRoles: 'student' }] },
        { $or: [{ targetClasses: { $size: 0 } }, { targetClasses: { $exists: false } }, { targetClasses: student.classId }] },
      ],
    }).sort({ publishedAt: -1 }).limit(10).select('title content publishedAt').lean(),
  ])
  const content = await generateWeeklyDigest({
    weekStarting,
    assignments: assignments.map(({ title, subject, dueDate, status, marksObtained, feedback }) => ({
      title, subject, dueDate: new Date(dueDate).toISOString().slice(0, 10), status, marksObtained, feedback,
    })),
    announcements: announcements.map(({ title, publishedAt }) => ({
      title, date: publishedAt.toISOString().slice(0, 10),
    })),
  })
  const digest = await ParentDigest.findOneAndUpdate(
    { userId: req.user.id, studentId: student.id, weekStarting },
    { $set: { content, generatedAt: new Date() } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  )
  res.json({ data: digest })
}))

router.post('/parent-digest',
  aiRateLimiter,
  body('studentId').isMongoId(),
  validate,
  asyncHandler(async (req, res) => {
    const { student } = await getParentStudent(req.user, req.body.studentId)
    if (!student) throw new AppError(404, 'No linked student profile was found.')
    const weekStarting = currentWeekStart()
    const [assignments, announcements] = await Promise.all([
      assignmentSnapshot(student),
      Announcement.find({
        publishedAt: { $gte: new Date(`${weekStarting}T00:00:00.000Z`) },
        $and: [
          { $or: [{ targetRoles: { $size: 0 } }, { targetRoles: { $exists: false } }, { targetRoles: 'parent' }] },
          { $or: [{ targetClasses: { $size: 0 } }, { targetClasses: { $exists: false } }, { targetClasses: student.classId }] },
        ],
      }).sort({ publishedAt: -1 }).limit(10).select('title publishedAt').lean(),
    ])
    const content = await generateWeeklyDigest({
      weekStarting,
      audience: 'parent',
      assignments: assignments.map(({ title, subject, dueDate, status, marksObtained, feedback }) => ({
        title, subject, dueDate: new Date(dueDate).toISOString().slice(0, 10), status, marksObtained, feedback,
      })),
      announcements: announcements.map(({ title, publishedAt }) => ({
        title, date: publishedAt.toISOString().slice(0, 10),
      })),
    })
    const digest = await AcademicDigest.findOneAndUpdate(
      { userId: req.user.id, weekStarting },
      { $set: { content, generatedAt: new Date() } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
    res.json({ data: digest })
  }),
)

router.post('/portfolio',
  body('submissionId').isMongoId(),
  body('reflection').optional().isString().isLength({ max: 2000 }),
  validate,
  asyncHandler(async (req, res) => {
    const student = await getStudent(req.user)
    const submission = await Submission.findOne({ _id: req.body.submissionId, studentId: student.id })
      .populate('assignmentId', 'classId targetStudents')
    if (!submission || !submission.assignmentId) throw new AppError(404, 'Your assignment submission was not found.')
    const entry = await PortfolioEntry.findOneAndUpdate(
      { studentId: student.id, submissionId: submission.id },
      { $set: { reflection: req.body.reflection || '' } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    )
    res.status(201).json({ data: { id: entry.id } })
  }),
)

router.delete('/portfolio/:entryId',
  param('entryId').isMongoId(),
  validate,
  asyncHandler(async (req, res) => {
    const student = await getStudent(req.user)
    const entry = await PortfolioEntry.findOneAndDelete({ _id: req.params.entryId, studentId: student.id })
    if (!entry) throw new AppError(404, 'Portfolio item not found.')
    res.status(204).end()
  }),
)

router.post('/support-requests',
  body('assignmentId').isMongoId(),
  body('message').isString().trim().isLength({ min: 5, max: 1000 }),
  validate,
  asyncHandler(async (req, res) => {
    const student = await getStudent(req.user)
    const assignment = await Assignment.findOne({
      _id: req.body.assignmentId,
      ...visibleAssignmentQuery(student),
    }).select('_id')
    if (!assignment) throw new AppError(404, 'Assignment not found.')
    const openRequest = await SupportRequest.exists({ studentId: student.id, assignmentId: assignment.id, status: 'open' })
    if (openRequest) throw new AppError(409, 'You already have an open help request for this assignment.')
    const request = await SupportRequest.create({
      studentId: student.id,
      assignmentId: assignment.id,
      message: req.body.message,
    })
    res.status(201).json({ data: { id: request.id, status: request.status } })
  }),
)

router.get('/support-requests', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req.user)
  const assignments = await Assignment.find({
    $or: [{ teacherId: teacher.id }, { classId: { $in: teacher.assignedClasses } }],
  }).select('_id')
  const requests = await SupportRequest.find({ assignmentId: { $in: assignments.map((item) => item.id) } })
    .sort({ createdAt: -1 })
    .populate('studentId', 'name rollNumber')
    .populate('assignmentId', 'title')
    .lean()
  res.json({
    data: requests.map((item) => ({
      id: item._id.toString(),
      student: item.studentId?.name || 'Student',
      rollNumber: item.studentId?.rollNumber || '',
      assignment: item.assignmentId?.title || 'Assignment',
      message: item.message,
      responseMessage: item.responseMessage,
      status: item.status,
      createdAt: item.createdAt,
    })),
  })
}))

router.get('/class-workload', asyncHandler(async (req, res) => {
  const teacher = await getTeacher(req.user)
  const now = new Date()
  now.setUTCDate(now.getUTCDate() - 7)
  const horizon = new Date()
  horizon.setUTCDate(horizon.getUTCDate() + 30)
  const assignments = await Assignment.find({
    status: 'published',
    dueDate: { $gte: now, $lte: horizon },
    $or: [{ teacherId: teacher.id }, { classId: { $in: teacher.assignedClasses } }],
  }).populate('classId', 'name section')
    .populate('subjectId', 'name')
    .sort({ dueDate: 1 })
    .select('title classId subjectId dueDate targetStudents')
    .lean()
  const workload = await Promise.all(assignments.map(async (assignment) => {
    const targetStudents = assignment.targetStudents || []
    const rosterQuery = { classId: assignment.classId._id, status: 'active' }
    if (targetStudents.length) rosterQuery._id = { $in: targetStudents }
    const assigned = await Student.countDocuments(rosterQuery)
    const submitted = await Submission.countDocuments({
      assignmentId: assignment._id,
      ...(targetStudents.length ? { studentId: { $in: targetStudents } } : {}),
    })
    return {
      id: assignment._id.toString(),
      title: assignment.title,
      className: assignment.classId?.section ? `${assignment.classId.name} · ${assignment.classId.section}` : assignment.classId?.name || 'Class',
      subject: assignment.subjectId?.name || 'Subject',
      dueDate: assignment.dueDate,
      assigned,
      submitted,
      pending: Math.max(0, assigned - submitted),
    }
  }))
  res.json({ data: workload })
}))

router.put('/support-requests/:requestId/respond',
  param('requestId').isMongoId(),
  body('responseMessage').isString().trim().isLength({ min: 5, max: 2000 }),
  validate,
  asyncHandler(async (req, res) => {
    const teacher = await getTeacher(req.user)
    const request = await SupportRequest.findById(req.params.requestId)
    if (!request) throw new AppError(404, 'Support request not found.')
    const assignment = await Assignment.findById(request.assignmentId).select('teacherId classId')
    if (!assignment || (assignment.teacherId.toString() !== teacher.id
      && !teacher.assignedClasses.some((id) => id.toString() === assignment.classId.toString()))) {
      throw new AppError(403, 'You can only reply to requests for assignments you manage.')
    }
    request.responseMessage = req.body.responseMessage
    request.respondedBy = req.user.id
    request.status = 'replied'
    await request.save()
    res.json({ data: { id: request.id, status: request.status } })
  }),
)

router.post('/improvement-steps',
  aiRateLimiter,
  body('submissionId').isMongoId(),
  body('feedback').isString().trim().isLength({ min: 5, max: 5000 }),
  validate,
  asyncHandler(async (req, res) => {
    if (!['teacher', 'admin'].includes(req.user.role)) throw new AppError(403, 'Only teachers can draft revision steps.')
    const submission = await Submission.findById(req.body.submissionId).select('assignmentId')
    if (!submission) throw new AppError(404, 'Submission not found.')
    const assignment = await Assignment.findById(submission.assignmentId)
      .populate('subjectId', 'name')
      .select('teacherId classId title subjectId')
    if (!assignment) throw new AppError(404, 'Assignment not found.')
    if (req.user.role === 'teacher') {
      const teacher = await getTeacher(req.user)
      if (assignment.teacherId.toString() !== teacher.id
        && !teacher.assignedClasses.some((id) => id.toString() === assignment.classId.toString())) {
        throw new AppError(403, 'You can only draft steps for assignments you manage.')
      }
    }
    const nextSteps = await suggestRevisionSteps({
      assignment: { title: assignment.title, subject: assignment.subjectId?.name || 'Classwork' },
      feedback: req.body.feedback,
    })
    res.json({ data: { nextSteps } })
  }),
)

router.patch('/submissions/:submissionId/next-steps/:stepIndex',
  param('submissionId').isMongoId(),
  param('stepIndex').isInt({ min: 0, max: 4 }),
  body('completed').isBoolean(),
  validate,
  asyncHandler(async (req, res) => {
    const student = await getStudent(req.user)
    const submission = await Submission.findOne({ _id: req.params.submissionId, studentId: student.id })
    if (!submission) throw new AppError(404, 'Your submission was not found.')
    const step = submission.nextSteps[Number(req.params.stepIndex)]
    if (!step) throw new AppError(404, 'Revision step not found.')
    step.completed = req.body.completed
    await submission.save()
    res.json({ data: { completed: step.completed } })
  }),
)

export default router

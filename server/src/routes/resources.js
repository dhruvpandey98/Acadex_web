import { Router } from 'express'
import { body, param, query } from 'express-validator'
import bcrypt from 'bcryptjs'
import {
  Announcement, Assignment, Attendance, Conversation, Fee, Grade, Message,
  Notification, Parent, SchoolClass, Student, Submission, Subject, Teacher, Timetable, User,
} from '../models/index.js'
import { authenticate, allowRoles } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { assignmentVisibilityForStudents } from '../utils/assignmentVisibility.js'
import { AppError, asyncHandler } from '../utils/errors.js'

const router = Router()
const specs = {
  parents: { model: Parent, roles: ['admin', 'parent'], write: ['admin'], fields: ['userId', 'name', 'email', 'phone', 'occupation', 'address', 'children'] },
  students: { model: Student, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin'], fields: ['admissionNumber', 'userId', 'name', 'email', 'phone', 'dateOfBirth', 'gender', 'classId', 'section', 'rollNumber', 'parentIds', 'admissionDate', 'address', 'status'] },
  teachers: { model: Teacher, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin'], fields: ['employeeId', 'userId', 'name', 'email', 'phone', 'department', 'subjects', 'assignedClasses', 'joiningDate', 'qualification', 'status'] },
  classes: { model: SchoolClass, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin'], fields: ['name', 'section', 'academicYear', 'classTeacherId', 'students', 'subjects'] },
  subjects: { model: Subject, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin'], fields: ['name', 'subjectCode', 'classId', 'teacherId', 'description'] },
  attendance: { model: Attendance, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin', 'teacher'], fields: ['studentId', 'classId', 'date', 'status', 'remarks'] },
  assignments: { model: Assignment, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin', 'teacher'], fields: ['title', 'description', 'subjectId', 'classId', 'teacherId', 'dueDate', 'attachments', 'totalMarks', 'status'] },
  submissions: { model: Submission, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin', 'teacher', 'student'], fields: ['assignmentId', 'studentId', 'submissionText', 'attachments', 'marksObtained', 'feedback', 'status', 'reviewedBy'] },
  grades: { model: Grade, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin', 'teacher'], fields: ['studentId', 'subjectId', 'classId', 'examName', 'marksObtained', 'totalMarks', 'grade', 'teacherId', 'remarks'] },
  announcements: { model: Announcement, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin', 'teacher'], fields: ['title', 'content', 'targetRoles', 'targetClasses', 'attachments'] },
  notifications: { model: Notification, roles: ['admin', 'teacher', 'student', 'parent'], write: [], fields: [] },
  fees: { model: Fee, roles: ['admin', 'student', 'parent'], write: ['admin'], fields: ['studentId', 'academicYear', 'feeType', 'amount', 'dueDate', 'paidAmount', 'status', 'paymentDate', 'transactionReference'] },
  timetable: { model: Timetable, roles: ['admin', 'teacher', 'student', 'parent'], write: ['admin'], fields: ['classId', 'subjectId', 'teacherId', 'dayOfWeek', 'startTime', 'endTime', 'room'] },
}

function announcementScope(role, classes) {
  return {
    $or: [
      { targetRoles: role, targetClasses: { $size: 0 } },
      { targetRoles: { $size: 0 }, targetClasses: { $size: 0 } },
      { targetClasses: { $in: classes }, $or: [{ targetRoles: role }, { targetRoles: { $size: 0 } }] },
    ],
  }
}

async function accessScope(key, user) {
  if (user.role === 'admin') return {}
  if (user.role === 'teacher') {
    const teacher = await Teacher.findOne({ userId: user.id }).select('_id assignedClasses')
    const classes = teacher?.assignedClasses || []
    if (key === 'teachers') return { userId: user.id }
    if (key === 'students' || key === 'classes' || key === 'subjects' || key === 'timetable') {
      return key === 'students' ? { classId: { $in: classes } } : key === 'classes' ? { _id: { $in: classes } } : { classId: { $in: classes } }
    }
    if (key === 'assignments' || key === 'attendance' || key === 'grades') {
      return key === 'assignments' ? { $or: [{ teacherId: teacher?._id }, { classId: { $in: classes } }] } : { classId: { $in: classes } }
    }
    if (key === 'submissions') {
      const assignments = await Assignment.find({ classId: { $in: classes } }).distinct('_id')
      return { assignmentId: { $in: assignments } }
    }
    if (key === 'announcements') return announcementScope(user.role, classes)
    if (key === 'notifications') return { userId: user.id }
    if (key === 'fees') return { _id: null }
    if (key === 'timetable') return { classId: { $in: classes } }
    return {}
  }

  let studentIds = []
  let ownStudent
  if (user.role === 'student') {
    ownStudent = await Student.findOne({ userId: user.id }).select('_id classId')
    if (ownStudent) studentIds = [ownStudent._id]
  } else {
    const parent = await Parent.findOne({ userId: user.id }).select('children')
    studentIds = parent?.children || []
  }
  const ownClasses = studentIds.length ? await Student.find({ _id: { $in: studentIds } }).distinct('classId') : []
  const student = user.role === 'student'
  if (key === 'parents') return { userId: user.id }
  if (key === 'teachers') {
    const [subjectTeacherIds, classTeacherIds] = await Promise.all([
      Subject.find({ classId: { $in: ownClasses } }).distinct('teacherId'),
      SchoolClass.find({ _id: { $in: ownClasses } }).distinct('classTeacherId'),
    ])
    return { _id: { $in: [...subjectTeacherIds, ...classTeacherIds].filter(Boolean) } }
  }
  if (key === 'students') return student ? { userId: user.id } : { _id: { $in: studentIds } }
  if (key === 'assignments') {
    return {
      classId: { $in: ownClasses },
      status: { $in: ['published', 'closed'] },
      ...assignmentVisibilityForStudents(studentIds),
    }
  }
  if (key === 'attendance' || key === 'grades' || key === 'fees') return { studentId: { $in: studentIds } }
  if (key === 'submissions') return { studentId: { $in: studentIds } }
  if (key === 'classes') return { _id: { $in: ownClasses } }
  if (key === 'subjects' || key === 'timetable') return { classId: { $in: ownClasses } }
  if (key === 'teachers') return {}
  if (key === 'announcements') return announcementScope(user.role, ownClasses)
  if (key === 'notifications') return { userId: user.id }
  return {}
}

function pickFields(bodyValue, fields) {
  if (!bodyValue || typeof bodyValue !== 'object' || Array.isArray(bodyValue)) {
    throw new AppError(400, 'Request body must be an object.')
  }
  return Object.fromEntries(Object.entries(bodyValue).filter(([key]) => fields.includes(key)))
}

function resourceProjection(key, role) {
  if (key === 'assignments' && role !== 'admin' && role !== 'teacher') return '-targetStudents'
  if (key === 'teachers' && role !== 'admin' && role !== 'teacher') {
    return 'userId name department qualification subjects assignedClasses status'
  }
  if (key === 'students' && role === 'parent') {
    return 'name classId section rollNumber status'
  }
  return undefined
}

function populateResource(key, queryBuilder) {
  const paths = {
    parents: [['userId', 'name email isActive'], ['children', 'name admissionNumber classId']],
    students: [['userId', 'name email isActive'], ['classId', 'name section'], ['parentIds', 'name email']],
    teachers: [['userId', 'name email isActive'], ['subjects', 'name'], ['assignedClasses', 'name section']],
    classes: [['classTeacherId', 'name'], ['subjects', 'name'], ['students', 'name']],
    subjects: [['classId', 'name section'], ['teacherId', 'name']],
    attendance: [['studentId', 'name email'], ['classId', 'name section']],
    assignments: [['subjectId', 'name'], ['classId', 'name section students'], ['teacherId', 'name']],
    submissions: [['assignmentId', 'title totalMarks'], ['studentId', 'name email']],
    grades: [['studentId', 'name email'], ['subjectId', 'name'], ['classId', 'name section'], ['teacherId', 'name']],
    announcements: [['createdBy', 'name']],
    fees: [['studentId', 'name']],
    timetable: [['classId', 'name section'], ['subjectId', 'name'], ['teacherId', 'name']],
  }
  for (const [path, select] of paths[key] || []) queryBuilder.populate(path, select)
  return queryBuilder
}

function startOfUtcDay(value) {
  const date = new Date(value)
  date.setUTCHours(0, 0, 0, 0)
  return date
}

async function validateResourceReferences(key, fields, user) {
  const teacher = user.role === 'teacher' ? await Teacher.findOne({ userId: user.id }).select('_id assignedClasses') : null
  const assignedClasses = teacher?.assignedClasses || []
  if (user.role === 'teacher' && ['attendance', 'assignments', 'grades'].includes(key)) {
    if (!fields.classId || !assignedClasses.some((classId) => classId.toString() === fields.classId.toString())) {
      throw new AppError(403, 'You can only manage records in your assigned classes.')
    }
  }
  if (key === 'attendance') {
    const student = await Student.findById(fields.studentId).select('classId')
    if (!student || student.classId?.toString() !== fields.classId?.toString()) {
      throw new AppError(400, 'Student does not belong to the supplied class.')
    }
  }
  if (key === 'students') {
    const [account, schoolClass, parentCount] = await Promise.all([
      User.findById(fields.userId).select('role'),
      fields.classId ? SchoolClass.exists({ _id: fields.classId }) : true,
      fields.parentIds?.length ? Parent.countDocuments({ _id: { $in: fields.parentIds } }) : 0,
    ])
    if (!account || account.role !== 'student' || !schoolClass || (fields.parentIds?.length && parentCount !== fields.parentIds.length)) {
      throw new AppError(400, 'Student account, class, or parent reference is invalid.')
    }
  }
  if (key === 'teachers') {
    const [account, classCount, subjectCount, unassignedSubjects] = await Promise.all([
      User.findById(fields.userId).select('role'),
      SchoolClass.countDocuments({ _id: { $in: fields.assignedClasses || [] } }),
      Subject.countDocuments({ _id: { $in: fields.subjects || [] } }),
      fields.subjects?.length
        ? Subject.countDocuments({ _id: { $in: fields.subjects }, classId: { $nin: fields.assignedClasses || [] } })
        : 0,
    ])
    if (!account || account.role !== 'teacher' || classCount !== (fields.assignedClasses || []).length || subjectCount !== (fields.subjects || []).length || unassignedSubjects) {
      throw new AppError(400, 'Teacher account or class assignment is invalid. Assign each subject’s class to the teacher first.')
    }
  }
  if (key === 'parents') {
    const [account, childCount] = await Promise.all([
      User.findById(fields.userId).select('role'),
      Student.countDocuments({ _id: { $in: fields.children || [] } }),
    ])
    if (!account || account.role !== 'parent' || childCount !== (fields.children || []).length) {
      throw new AppError(400, 'Parent account or child reference is invalid.')
    }
  }
  if (key === 'classes') {
    const [teacherExists, studentCount, subjectCount] = await Promise.all([
      fields.classTeacherId ? Teacher.exists({ _id: fields.classTeacherId }) : true,
      Student.countDocuments({ _id: { $in: fields.students || [] } }),
      Subject.countDocuments({ _id: { $in: fields.subjects || [] } }),
    ])
    if (!teacherExists || studentCount !== (fields.students || []).length || subjectCount !== (fields.subjects || []).length) {
      throw new AppError(400, 'Class teacher, student, or subject reference is invalid.')
    }
    if (fields.subjects?.length && await Subject.countDocuments({ _id: { $in: fields.subjects }, classId: { $ne: fields._id } })) {
      throw new AppError(400, 'Every subject assigned to a class must belong to that class.')
    }
  }
  if (key === 'subjects') {
    const [classExists, teacher] = await Promise.all([
      SchoolClass.exists({ _id: fields.classId }),
      fields.teacherId ? Teacher.findById(fields.teacherId).select('assignedClasses') : null,
    ])
    const teacherAssigned = !fields.teacherId || teacher?.assignedClasses.some((classId) => classId.toString() === fields.classId?.toString())
    if (!classExists || !teacherAssigned) {
      throw new AppError(400, 'Subject class is invalid or its teacher is not assigned to that class.')
    }
  }
  if (key === 'assignments') {
    const [classExists, subject, assignedTeacher] = await Promise.all([
      SchoolClass.exists({ _id: fields.classId }),
      Subject.findById(fields.subjectId).select('classId'),
      teacher ? Promise.resolve(true) : Teacher.exists({ _id: fields.teacherId }),
    ])
    if (!classExists || !subject || !assignedTeacher || subject.classId.toString() !== fields.classId?.toString()) {
      throw new AppError(400, 'Assignment class or subject is invalid.')
    }
    if (teacher) fields.teacherId = teacher.id
  }
  if (key === 'grades') {
    if (teacher) fields.teacherId = teacher.id
    const student = await Student.findById(fields.studentId).select('classId')
    const subject = await Subject.findById(fields.subjectId).select('classId')
    const assignedTeacher = await Teacher.exists({ _id: fields.teacherId })
    if (!student || !subject || !assignedTeacher || fields.totalMarks <= 0 || fields.marksObtained > fields.totalMarks || student.classId?.toString() !== fields.classId?.toString() || subject.classId.toString() !== fields.classId?.toString()) {
      throw new AppError(400, 'Grade student, class, or subject relationship is invalid.')
    }
  }
  if (key === 'fees' && !await Student.exists({ _id: fields.studentId })) {
    throw new AppError(400, 'Fee student does not exist.')
  }
  if (key === 'announcements') {
    const targetClasses = fields.targetClasses || []
    if (targetClasses.length && await SchoolClass.countDocuments({ _id: { $in: targetClasses } }) !== targetClasses.length) {
      throw new AppError(400, 'One or more announcement classes do not exist.')
    }
    if (teacher && targetClasses.some((classId) => !assignedClasses.some((assigned) => assigned.toString() === classId.toString()))) {
      throw new AppError(403, 'You can only target announcements to your assigned classes.')
    }
  }
  if (key === 'timetable') {
    const [schoolClass, subject, assignedTeacher] = await Promise.all([
      SchoolClass.exists({ _id: fields.classId }),
      Subject.findById(fields.subjectId).select('classId'),
      Teacher.exists({ _id: fields.teacherId }),
    ])
    if (!schoolClass || !subject || !assignedTeacher || subject.classId.toString() !== fields.classId?.toString()) {
      throw new AppError(400, 'Timetable class, subject, or teacher is invalid.')
    }
  }
  if (key === 'submissions') {
    const student = await Student.findById(fields.studentId).select('classId userId')
    const assignment = await Assignment.findById(fields.assignmentId).select('classId')
    if (!student || !assignment || student.classId?.toString() !== assignment.classId.toString()) {
      throw new AppError(400, 'Submission student or assignment is invalid.')
    }
    if (user.role === 'student' && student.userId?.toString() !== user.id) {
      throw new AppError(403, 'You can only submit your own work.')
    }
    if (teacher && !assignedClasses.some((classId) => classId.toString() === assignment.classId.toString())) {
      throw new AppError(403, 'You can only review submissions in your assigned classes.')
    }
  }
}

async function syncStudentRelationships(student, previous = {}) {
  const studentId = student._id
  const previousClassId = previous.classId?.toString()
  const nextClassId = student.classId?.toString()
  if (previousClassId !== nextClassId) {
    if (previousClassId) await SchoolClass.updateOne({ _id: previousClassId }, { $pull: { students: studentId } })
    if (nextClassId) {
      const schoolClass = await SchoolClass.findById(nextClassId).select('section')
      await SchoolClass.updateOne({ _id: nextClassId }, { $addToSet: { students: studentId } })
      if (schoolClass && !student.section) {
        student.section = schoolClass.section
        await student.save()
      }
    } else if (student.section) {
      student.section = ''
      await student.save()
    }
  }

  const previousParentIds = (previous.parentIds || []).map((id) => id.toString())
  const nextParentIds = (student.parentIds || []).map((id) => id.toString())
  await Parent.updateMany(
    { children: studentId, _id: { $nin: nextParentIds } },
    { $pull: { children: studentId } },
  )
  if (nextParentIds.length) {
    await Parent.updateMany({ _id: { $in: nextParentIds } }, { $addToSet: { children: studentId } })
  }
  return previousParentIds
}

async function syncParentRelationships(parent) {
  const nextChildren = parent.children || []
  await Student.updateMany(
    { parentIds: parent._id, _id: { $nin: nextChildren } },
    { $pull: { parentIds: parent._id } },
  )
  if (nextChildren.length) {
    await Student.updateMany({ _id: { $in: nextChildren } }, { $addToSet: { parentIds: parent._id } })
  }
  return undefined
}

async function syncClassTeacher(schoolClass, previousTeacherId = null) {
  const previousId = previousTeacherId?.toString()
  const nextId = schoolClass.classTeacherId?.toString()
  if (previousId && previousId !== nextId) {
    await Teacher.updateOne({ _id: previousId }, { $pull: { assignedClasses: schoolClass._id } })
  }
  if (nextId) {
    await Teacher.updateOne({ _id: nextId }, { $addToSet: { assignedClasses: schoolClass._id } })
  }
}

async function syncTeacherClassAccess(teacher) {
  const classTeacherClasses = await SchoolClass.find({ classTeacherId: teacher._id }).distinct('_id')
  const assignedClasses = [...new Set([
    ...(teacher.assignedClasses || []).map((id) => id.toString()),
    ...classTeacherClasses.map((id) => id.toString()),
  ])]
  await Teacher.updateOne({ _id: teacher._id }, { $set: { assignedClasses } })
}

async function syncClassRoster(schoolClass) {
  const selectedIds = schoolClass.students || []
  const selected = new Set(selectedIds.map((id) => id.toString()))
  const previousStudents = await Student.find({ classId: schoolClass._id }).select('_id')
  const removedIds = previousStudents
    .map((student) => student._id)
    .filter((id) => !selected.has(id.toString()))
  if (removedIds.length) {
    await Student.updateMany(
      { _id: { $in: removedIds }, classId: schoolClass._id },
      { $set: { classId: null, section: '' } },
    )
  }
  const selectedStudents = selectedIds.length
    ? await Student.find({ _id: { $in: selectedIds } }).select('_id classId')
    : []
  const previousClassIds = [...new Set(selectedStudents
    .map((student) => student.classId?.toString())
    .filter((id) => id && id !== schoolClass.id))]
  if (previousClassIds.length) {
    await SchoolClass.updateMany(
      { _id: { $in: previousClassIds } },
      { $pull: { students: { $in: selectedIds } } },
    )
  }
  if (selectedIds.length) {
    await Student.updateMany(
      { _id: { $in: selectedIds } },
      { $set: { classId: schoolClass._id, section: schoolClass.section } },
    )
  }
  await SchoolClass.updateOne({ _id: schoolClass._id }, { $set: { students: selectedIds } })
}

async function syncSubjectRelationships(subject, previous = {}) {
  const previousClassId = previous.classId?.toString()
  const nextClassId = subject.classId?.toString()
  if (previousClassId && previousClassId !== nextClassId) {
    await SchoolClass.updateOne({ _id: previousClassId }, { $pull: { subjects: subject._id } })
  }
  if (nextClassId) {
    await SchoolClass.updateOne({ _id: nextClassId }, { $addToSet: { subjects: subject._id } })
  }

  const previousTeacherId = previous.teacherId?.toString()
  const nextTeacherId = subject.teacherId?.toString()
  if (previousTeacherId && previousTeacherId !== nextTeacherId) {
    await Teacher.updateOne({ _id: previousTeacherId }, { $pull: { subjects: subject._id } })
  }
  if (nextTeacherId) {
    await Teacher.updateMany(
      { _id: { $ne: nextTeacherId }, subjects: subject._id },
      { $pull: { subjects: subject._id } },
    )
    await Teacher.updateOne({ _id: nextTeacherId }, { $addToSet: { subjects: subject._id } })
  }
}

async function syncTeacherSubjects(teacher, previousSubjects = []) {
  const nextSubjects = teacher.subjects || []
  const nextIds = new Set(nextSubjects.map((id) => id.toString()))
  const removedIds = previousSubjects.filter((id) => !nextIds.has(id.toString()))
  if (removedIds.length) {
    await Subject.updateMany(
      { _id: { $in: removedIds }, teacherId: teacher._id },
      { $set: { teacherId: null } },
    )
  }
  if (nextSubjects.length) {
    await Subject.updateMany(
      { _id: { $in: nextSubjects } },
      { $set: { teacherId: teacher._id } },
    )
    await Teacher.updateMany(
      { _id: { $ne: teacher._id }, subjects: { $in: nextSubjects } },
      { $pull: { subjects: { $in: nextSubjects } } },
    )
  }
}

async function notifyUsers(app, userIds, title, message, type, relatedEntity, eventName) {
  const distinctUserIds = [...new Set(userIds.map((id) => id.toString()))]
  if (!distinctUserIds.length) return
  const rows = distinctUserIds.map((userId) => ({ userId, title, message, type, relatedEntity }))
  const notifications = await Notification.insertMany(rows)
  const io = app.get('io')
  if (io) {
    notifications.forEach((notification) => {
      const payload = { title, message, type, relatedEntity }
      io.to(`user:${notification.userId}`).emit('notification:new', payload)
      if (eventName) io.to(`user:${notification.userId}`).emit(eventName, { relatedEntity })
    })
  }
}

async function hasDependentRecords(key, id) {
  const checks = {
    parents: [Student.exists({ parentIds: id })],
    students: [
      Attendance.exists({ studentId: id }),
      Submission.exists({ studentId: id }),
      Grade.exists({ studentId: id }),
      Fee.exists({ studentId: id }),
      Parent.exists({ children: id }),
    ],
    teachers: [
      Assignment.exists({ teacherId: id }),
      Grade.exists({ teacherId: id }),
      Timetable.exists({ teacherId: id }),
      Subject.exists({ teacherId: id }),
      SchoolClass.exists({ classTeacherId: id }),
    ],
    classes: [
      Student.exists({ classId: id }),
      Subject.exists({ classId: id }),
      Attendance.exists({ classId: id }),
      Assignment.exists({ classId: id }),
      Grade.exists({ classId: id }),
      Timetable.exists({ classId: id }),
      Teacher.exists({ assignedClasses: id }),
    ],
    subjects: [
      Assignment.exists({ subjectId: id }),
      Grade.exists({ subjectId: id }),
      Timetable.exists({ subjectId: id }),
      SchoolClass.exists({ subjects: id }),
    ],
    assignments: [Submission.exists({ assignmentId: id })],
  }
  const dependencies = checks[key] || []
  const results = await Promise.all(dependencies)
  return results.some(Boolean)
}

async function mayContact(firstUser, secondUser) {
  if (firstUser.role === 'admin' || secondUser.role === 'admin') return true
  const [teacherUser, studentUser, parentUser] = [
    firstUser.role === 'teacher' ? firstUser : secondUser.role === 'teacher' ? secondUser : null,
    firstUser.role === 'student' ? firstUser : secondUser.role === 'student' ? secondUser : null,
    firstUser.role === 'parent' ? firstUser : secondUser.role === 'parent' ? secondUser : null,
  ]
  if (teacherUser && studentUser) {
    const [teacher, student] = await Promise.all([
      Teacher.findOne({ userId: teacherUser.id }).select('assignedClasses'),
      Student.findOne({ userId: studentUser.id }).select('classId'),
    ])
    return Boolean(student && teacher?.assignedClasses.some((classId) => classId.toString() === student.classId?.toString()))
  }
  if (parentUser && studentUser) {
    const [parent, student] = await Promise.all([
      Parent.findOne({ userId: parentUser.id }).select('children'),
      Student.findOne({ userId: studentUser.id }).select('_id'),
    ])
    return Boolean(student && parent?.children.some((id) => id.toString() === student.id))
  }
  if (parentUser && teacherUser) {
    const [parent, teacher] = await Promise.all([
      Parent.findOne({ userId: parentUser.id }).select('children'),
      Teacher.findOne({ userId: teacherUser.id }).select('assignedClasses'),
    ])
    const classes = parent?.children.length
      ? await Student.find({ _id: { $in: parent.children } }).distinct('classId')
      : []
    return Boolean(teacher && classes.some((classId) => teacher.assignedClasses.some((assigned) => assigned.toString() === classId.toString())))
  }
  return firstUser.role === 'teacher' && secondUser.role === 'teacher'
}

const resourceCreateValidators = {
  students: [
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8, max: 128 })
      .custom((value) => Buffer.byteLength(value, 'utf8') <= 72),
    body('admissionNumber').trim().isLength({ min: 1, max: 64 }),
    body('classId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body('parentIds').optional().isArray({ max: 10 }),
    body('parentIds.*').isMongoId(),
  ],
  teachers: [
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8, max: 128 })
      .custom((value) => Buffer.byteLength(value, 'utf8') <= 72),
    body('employeeId').trim().isLength({ min: 1, max: 64 }),
    body('assignedClasses').optional().isArray({ max: 100 }),
    body('assignedClasses.*').isMongoId(),
    body('subjects').optional().isArray({ max: 100 }),
    body('subjects.*').isMongoId(),
  ],
  parents: [
    body('name').trim().isLength({ min: 2, max: 120 }),
    body('email').trim().isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8, max: 128 })
      .custom((value) => Buffer.byteLength(value, 'utf8') <= 72),
    body('children').optional().isArray({ max: 20 }),
    body('children.*').isMongoId(),
  ],
  classes: [
    body('name').trim().isLength({ min: 1, max: 120 }),
    body('section').trim().isLength({ min: 1, max: 32 }),
    body('academicYear').trim().isLength({ min: 4, max: 32 }),
    body('classTeacherId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
    body('students').optional().isArray({ max: 500 }),
    body('students.*').isMongoId(),
  ],
  subjects: [
    body('name').trim().isLength({ min: 1, max: 120 }),
    body('subjectCode').trim().isLength({ min: 1, max: 32 }),
    body('classId').isMongoId(),
    body('teacherId').optional({ nullable: true, checkFalsy: true }).isMongoId(),
  ],
}

function resourceRoute(key, spec) {
  const resource = Router()
  resource.use(authenticate, allowRoles(...spec.roles))
  resource.get('/', query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 }), validate,
    asyncHandler(async (req, res) => {
      const page = Number(req.query.page || 1)
      const limit = Number(req.query.limit || 25)
      const scope = await accessScope(key, req.user)
      let listQuery = populateResource(key, spec.model.find(scope))
      const projection = resourceProjection(key, req.user.role)
      if (projection) listQuery = listQuery.select(projection)
      const records = await listQuery.sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
      const total = await spec.model.countDocuments(scope)
      res.json({ data: records, pagination: { page, limit, total, pages: Math.ceil(total / limit) } })
    }),
  )
  resource.post('/', allowRoles(...spec.write), ...(resourceCreateValidators[key] || []), validate, asyncHandler(async (req, res) => {
    if (key === 'submissions' && req.user.role === 'student') {
      throw new AppError(400, 'Use the assignment submission endpoint to upload your work.')
    }
    const fields = pickFields(req.body, spec.fields)
    let linkedAccount
    const accountRole = { students: 'student', teachers: 'teacher', parents: 'parent' }[key]
    if (accountRole && req.user.role === 'admin') {
      if (typeof req.body.password !== 'string' || req.body.password.length < 8 || req.body.password.length > 128 || Buffer.byteLength(req.body.password, 'utf8') > 72) {
        throw new AppError(400, 'A password with 8 to 128 characters and at most 72 UTF-8 bytes is required when creating an account.')
      }
      linkedAccount = await User.create({
        name: fields.name,
        email: fields.email,
        passwordHash: await bcrypt.hash(req.body.password, 12),
        role: accountRole,
        phone: fields.phone || '',
        address: fields.address || '',
      })
      fields.userId = linkedAccount.id
    }
    if (key === 'attendance') {
      fields.markedBy = req.user.id
      fields.date = startOfUtcDay(fields.date)
    }
    if (key === 'announcements') fields.createdBy = req.user.id
    if (key === 'submissions' && req.user.role !== 'student') {
      throw new AppError(403, 'Use the submission review endpoint to grade work.')
    }
    if (key === 'submissions' && req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user.id }).select('_id')
      if (!student) throw new AppError(403, 'Student profile is not linked to this account.')
      fields.studentId = student.id
      fields.marksObtained = null
      fields.feedback = ''
      fields.status = 'submitted'
      fields.reviewedBy = null
    }
    if (key === 'submissions' && req.user.role !== 'student') {
      throw new AppError(403, 'Only students may create submissions.')
    }
    let created
    try {
      await validateResourceReferences(key, fields, req.user)
      created = await spec.model.create(fields)
      if (key === 'students') await syncStudentRelationships(created)
      if (key === 'parents') await syncParentRelationships(created)
      if (key === 'teachers') {
        await syncTeacherSubjects(created)
        await syncTeacherClassAccess(created)
      }
      if (key === 'classes') {
        await syncClassRoster(created)
        await syncClassTeacher(created)
      }
      if (key === 'subjects') await syncSubjectRelationships(created)
    } catch (error) {
      if (created) await spec.model.findByIdAndDelete(created.id)
      if (linkedAccount) await User.findByIdAndDelete(linkedAccount.id)
      throw error
    }
    if (key === 'assignments') {
      const students = await Student.find({ classId: created.classId }).select('_id userId')
      const parents = await Parent.find({ children: { $in: students.map((student) => student._id) } }).distinct('userId')
      const userIds = [...students.map((student) => student.userId), ...parents]
      await notifyUsers(req.app, userIds, 'New assignment', created.title, 'assignment', created.id, 'assignment:new')
    } else if (key === 'announcements') {
      const roles = created.targetRoles.length ? created.targetRoles : ['admin', 'teacher', 'student', 'parent']
      let userIds
      if (created.targetClasses.length) {
        const students = roles.includes('student')
          ? await Student.find({ classId: { $in: created.targetClasses } }).select('_id userId')
          : []
        const parents = roles.includes('parent') && students.length
          ? await Parent.find({ children: { $in: students.map((student) => student._id) } }).distinct('userId')
          : []
        const teachers = roles.includes('teacher')
          ? await Teacher.find({ assignedClasses: { $in: created.targetClasses } }).distinct('userId')
          : []
        const admins = roles.includes('admin') ? await User.find({ role: 'admin' }).distinct('_id') : []
        userIds = [...students.map((student) => student.userId), ...parents, ...teachers, ...admins]
      } else {
        userIds = await User.find({ role: { $in: roles }, isActive: true }).distinct('_id')
      }
      await notifyUsers(req.app, userIds.filter((id) => id.toString() !== req.user.id), created.title, created.content, 'announcement', created.id, 'announcement:new')
    } else if (key === 'attendance') {
      const student = await Student.findById(created.studentId).select('userId parentIds')
      const parentUserIds = student?.parentIds.length
        ? await Parent.find({ _id: { $in: student.parentIds } }).distinct('userId')
        : []
      const message = `Attendance was marked ${created.status}.`
      await notifyUsers(req.app, [student?.userId, ...parentUserIds].filter(Boolean), 'Attendance updated', message, 'attendance', created.id, 'attendance:update')
    }
    res.status(201).json({ data: created })
  }))
  resource.get('/:id', param('id').isMongoId(), validate, asyncHandler(async (req, res) => {
    const scope = await accessScope(key, req.user)
    let recordQuery = populateResource(key, spec.model.findOne({ _id: req.params.id, ...scope }))
    const projection = resourceProjection(key, req.user.role)
    if (projection) recordQuery = recordQuery.select(projection)
    const record = await recordQuery
    if (!record) throw new AppError(404, 'Record not found.')
    res.json({ data: record })
  }))
  resource.put('/:id', allowRoles(...spec.write), param('id').isMongoId(), validate, asyncHandler(async (req, res) => {
    if (key === 'submissions' && req.user.role === 'student') {
      throw new AppError(400, 'Use the assignment submission endpoint to update your work.')
    }
    const scope = await accessScope(key, req.user)
    const changes = pickFields(req.body, spec.fields)
    const current = await spec.model.findOne({ _id: req.params.id, ...scope })
    if (!current) throw new AppError(404, 'Record not found.')
    const previous = current.toObject()
    if (key === 'submissions' && req.user.role !== 'student') {
      throw new AppError(400, 'Use the submission review endpoint to grade work.')
    }
    if (key === 'attendance') {
      delete changes.markedBy
      if (changes.date) changes.date = startOfUtcDay(changes.date)
    }
    if (['students', 'teachers', 'parents'].includes(key)) delete changes.userId
    if (key === 'grades' && changes.marksObtained !== undefined) {
      changes.percentage = Math.round(changes.marksObtained * 10000 / current.totalMarks) / 100
    }
    if (key === 'announcements') delete changes.createdBy
    if (key === 'submissions' && req.user.role === 'student') {
      delete changes.studentId
      delete changes.marksObtained
      delete changes.feedback
      delete changes.status
      delete changes.reviewedBy
    }
    if (key === 'submissions' && req.user.role === 'student') {
      if (!current || current.status === 'reviewed') throw new AppError(404, 'Editable submission not found.')
      changes.assignmentId = current.assignmentId
      changes.studentId = current.studentId
    }
    await validateResourceReferences(key, { ...current.toObject(), ...changes }, req.user)
    let record
    const profileResource = ['students', 'teachers', 'parents'].includes(key)
    if (profileResource && (changes.name || changes.email)) {
      if (changes.email && await User.exists({ email: changes.email.toLowerCase(), _id: { $ne: current.userId } })) {
        throw new AppError(409, 'A user with this email address already exists.')
      }
      current.set(changes)
      await current.validate()
      const accountChanges = {}
      if (changes.name) accountChanges.name = changes.name
      if (changes.email) accountChanges.email = changes.email
      if (changes.phone !== undefined) accountChanges.phone = changes.phone
      if (changes.address !== undefined) accountChanges.address = changes.address
      await User.findByIdAndUpdate(current.userId, accountChanges, { runValidators: true })
      record = await current.save()
    } else {
      record = await spec.model.findOneAndUpdate({ _id: req.params.id, ...scope }, changes, { new: true, runValidators: true })
    }
    if (!record) throw new AppError(404, 'Record not found.')
    if (key === 'students') await syncStudentRelationships(record, previous)
    if (key === 'parents') await syncParentRelationships(record)
    if (key === 'teachers') {
      await syncTeacherSubjects(record, previous.subjects)
      await syncTeacherClassAccess(record)
    }
    if (key === 'classes') {
      await syncClassRoster(record)
      await syncClassTeacher(record, previous.classTeacherId)
    }
    if (key === 'subjects') await syncSubjectRelationships(record, previous)
    res.json({ data: record })
  }))
  resource.delete('/:id', allowRoles(...spec.write), param('id').isMongoId(), validate, asyncHandler(async (req, res) => {
    const scope = await accessScope(key, req.user)
    const record = await spec.model.findOne({ _id: req.params.id, ...scope })
    if (!record) throw new AppError(404, 'Record not found.')
    if (await hasDependentRecords(key, record.id)) {
      throw new AppError(409, 'This record is in use and cannot be deleted until its dependent records are reassigned.')
    }
    if (key === 'students' && record.classId) {
      await SchoolClass.updateOne({ _id: record.classId }, { $pull: { students: record.id } })
    }
    await record.deleteOne()
    if (['students', 'teachers', 'parents'].includes(key)) {
      const account = await User.findById(record.userId).select('+tokenVersion +refreshTokenHashes')
      if (account) {
        account.isActive = false
        account.tokenVersion += 1
        account.refreshTokenHashes = []
        await account.save()
      }
    }
    res.status(204).end()
  }))
  return resource
}

router.post('/attendance/bulk', authenticate, allowRoles('admin', 'teacher'),
  body('records').isArray({ min: 1, max: 500 }),
  body('records.*.studentId').isMongoId(),
  body('records.*.classId').isMongoId(),
  body('records.*.date').isISO8601(),
  body('records.*.status').isIn(['present', 'absent', 'late', 'excused']),
  body('records.*.remarks').optional().isString().isLength({ max: 1000 }),
  validate,
  asyncHandler(async (req, res) => {
    const records = req.body.records.map((record) => ({
      studentId: record.studentId,
      classId: record.classId,
      date: startOfUtcDay(record.date),
      status: record.status,
      remarks: record.remarks || '',
      markedBy: req.user.id,
    }))
    const ids = [...new Set(records.map((record) => record.studentId))]
    const students = await Student.find({ _id: { $in: ids } }).select('_id classId')
    if (students.length !== ids.length) throw new AppError(400, 'One or more students do not exist.')
    const classByStudent = new Map(students.map((student) => [student.id, student.classId?.toString()]))
    if (records.some((record) => classByStudent.get(record.studentId) !== record.classId)) {
      throw new AppError(400, 'A student does not belong to the supplied class.')
    }
    if (req.user.role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: req.user.id }).select('assignedClasses')
      const assigned = new Set((teacher?.assignedClasses || []).map((classId) => classId.toString()))
      if (records.some((record) => !assigned.has(record.classId))) {
        throw new AppError(403, 'You can only mark attendance for your assigned classes.')
      }
    }
    const result = await Attendance.insertMany(records, { ordered: true })
    res.status(201).json({ data: result })
  }),
)

router.patch('/notifications/read-all', authenticate, asyncHandler(async (req, res) => {
  const result = await Notification.updateMany({ userId: req.user.id }, { $set: { isRead: true } })
  res.json({ modifiedCount: result.modifiedCount })
}))

router.patch('/notifications/:id/read', authenticate, param('id').isMongoId(), validate, asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { $set: { isRead: true } },
    { new: true },
  )
  if (!notification) throw new AppError(404, 'Notification not found.')
  res.json({ data: notification })
}))

router.get('/conversations', authenticate, asyncHandler(async (req, res) => {
  const data = await Conversation.find({ participants: req.user.id }).sort({ lastMessageAt: -1 }).populate('participants', 'name role profileImage')
  res.json({ data })
}))

router.get('/messages/:conversationId', authenticate, param('conversationId').isMongoId(), validate, asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.conversationId, participants: req.user.id })
  if (!conversation) throw new AppError(404, 'Conversation not found.')
  const data = await Message.find({ conversationId: conversation.id }).sort({ sentAt: 1 }).limit(200)
  res.json({ data })
}))

router.patch('/messages/:id/read', authenticate, param('id').isMongoId(), validate, asyncHandler(async (req, res) => {
  const message = await Message.findOneAndUpdate(
    { _id: req.params.id, receiverId: req.user.id },
    { $set: { isRead: true } },
    { new: true },
  )
  if (!message) throw new AppError(404, 'Message not found.')
  res.json({ data: message })
}))

router.post('/messages', authenticate,
  body('conversationId').isMongoId(),
  body('receiverId').isMongoId(),
  body('message').trim().isLength({ min: 1, max: 5000 }),
  validate,
  asyncHandler(async (req, res) => {
    const conversation = await Conversation.findOne({ _id: req.body.conversationId, participants: req.user.id })
    if (!conversation || !conversation.participants.some((id) => id.toString() === req.body.receiverId)) {
      throw new AppError(403, 'You are not a participant in this conversation.')
    }
    const receiver = await User.findById(req.body.receiverId).select('role isActive')
    if (!receiver?.isActive || !await mayContact(req.user, receiver)) {
      throw new AppError(403, 'You are not allowed to message this user.')
    }
    const message = await Message.create({
      conversationId: conversation.id,
      senderId: req.user.id,
      receiverId: req.body.receiverId,
      message: req.body.message,
    })
    conversation.lastMessage = message.message
    conversation.lastMessageAt = message.sentAt
    await conversation.save()
    await Notification.create({
      userId: req.body.receiverId,
      title: 'New message',
      message: `${req.user.name} sent you a message.`,
      type: 'message',
      relatedEntity: message.id,
    })
    req.app.get('io')?.to(`conversation:${conversation.id}`).emit('message:new', message)
    req.app.get('io')?.to(`user:${req.body.receiverId}`).emit('notification:new', {
      title: 'New message',
      message: `${req.user.name} sent you a message.`,
      type: 'message',
      relatedEntity: message.id,
    })
    res.status(201).json({ data: message })
  }),
)

router.post('/conversations', authenticate,
  body('participantId').isMongoId(),
  validate,
  asyncHandler(async (req, res) => {
    if (req.body.participantId === req.user.id) throw new AppError(400, 'A conversation requires another participant.')
    const other = await User.findOne({ _id: req.body.participantId, isActive: true }).select('role')
    if (!other) throw new AppError(404, 'Participant not found.')
    if (!await mayContact(req.user, other)) throw new AppError(403, 'You are not allowed to start a conversation with this user.')
    const participants = [req.user.id, req.body.participantId].sort()
    const participantKey = participants.join(':')
    let conversation = await Conversation.findOneAndUpdate(
      { participantKey },
      { $setOnInsert: { participants, participantKey } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    res.status(200).json({ data: conversation })
  }),
)

router.get('/attendance/summary', authenticate, asyncHandler(async (req, res) => {
  const scope = await accessScope('attendance', req.user)
  const summary = await Attendance.aggregate([
    { $match: scope },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])
  res.json({ data: summary })
}))

router.get('/fees/student/:studentId', authenticate, param('studentId').isMongoId(), validate, asyncHandler(async (req, res) => {
  const studentScope = await accessScope('students', req.user)
  const student = await Student.findOne({ _id: req.params.studentId, ...studentScope })
  if (!student) throw new AppError(404, 'Student record not found.')
  const records = await Fee.find({ studentId: student.id }).sort({ dueDate: -1 }).limit(100)
  res.json({ data: records })
}))

router.put('/submissions/:id/review', authenticate, allowRoles('admin', 'teacher'), param('id').isMongoId(),
  body('marksObtained').isFloat({ min: 0 }),
  body('feedback').optional().isString().isLength({ max: 5000 }),
  validate,
  asyncHandler(async (req, res) => {
    const submission = await Submission.findById(req.params.id)
    if (!submission) throw new AppError(404, 'Submission not found.')
    const assignment = await Assignment.findById(submission.assignmentId).select('classId totalMarks')
    if (!assignment) throw new AppError(400, 'Submission assignment is not available.')
    if (req.body.marksObtained > assignment.totalMarks) throw new AppError(400, 'Marks cannot exceed the assignment total.')
    if (req.user.role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: req.user.id }).select('_id assignedClasses')
      if (!teacher || !teacher.assignedClasses.some((id) => id.toString() === assignment.classId.toString())) {
        throw new AppError(403, 'You can only review submissions in your assigned classes.')
      }
    }
    submission.marksObtained = req.body.marksObtained
    submission.feedback = req.body.feedback || ''
    submission.status = 'reviewed'
    submission.reviewedBy = req.user.id
    await submission.save()
    res.json({ data: submission })
  }),
)

router.patch('/users/:id/status', authenticate, allowRoles('admin'), param('id').isMongoId(),
  body('isActive').isBoolean(),
  validate,
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id && req.body.isActive === false) {
      throw new AppError(400, 'You cannot deactivate your own account.')
    }
    const user = await User.findById(req.params.id).select('+tokenVersion +refreshTokenHashes')
    if (!user) throw new AppError(404, 'User not found.')
    user.isActive = req.body.isActive
    if (!user.isActive) {
      user.tokenVersion += 1
      user.refreshTokenHashes = []
    }
    await user.save()
    res.json({ data: { id: user.id, isActive: user.isActive } })
  }),
)

router.get('/attendance/student/:studentId', authenticate, param('studentId').isMongoId(), validate, asyncHandler(async (req, res) => {
  const studentScope = await accessScope('students', req.user)
  const student = await Student.findOne({ _id: req.params.studentId, ...studentScope })
  if (!student) throw new AppError(404, 'Student record not found.')
  const records = await Attendance.find({ studentId: student.id }).sort({ date: -1 }).limit(200)
  res.json({ data: records })
}))

for (const [key, spec] of Object.entries(specs)) {
  router.use(`/${key}`, resourceRoute(key, spec))
}

export default router

import assert from 'node:assert/strict'
import { test } from 'node:test'
import mongoose from 'mongoose'
import { AcademicDigest, Assignment, AssistantConversation, Attendance, Conversation, Grade, LearningPlan, ParentDigest, PortfolioEntry, PasswordReset, RegistrationVerification, Submission, SupportRequest, Timetable, Upload, User } from '../src/models/index.js'

test('attendance schema enforces one record per student and date', () => {
  const uniqueAttendanceIndex = Attendance.schema.indexes().find(([keys, options]) => (
    keys.studentId === 1 && keys.date === 1 && options.unique === true
  ))
  assert.ok(uniqueAttendanceIndex)
})

test('private credential fields are excluded from normal user queries', () => {
  assert.equal(User.schema.path('passwordHash').options.select, false)
  assert.equal(User.schema.path('refreshTokenHashes').options.select, false)
  assert.equal(User.schema.path('tokenVersion').options.select, false)
})

test('upload contents are stored in MongoDB and excluded from ordinary queries', () => {
  assert.equal(Upload.schema.path('fileData').instance, 'Buffer')
  assert.equal(Upload.schema.path('fileData').options.select, false)
})

test('password reset and conversation uniqueness have database indexes', () => {
  assert.equal(PasswordReset.schema.path('expiresAt').options.expires, 0)
  assert.equal(Conversation.schema.path('participantKey').options.unique, true)
})

test('registration codes expire and Google users can be passwordless', () => {
  assert.equal(RegistrationVerification.schema.path('expiresAt').options.expires, 0)
  assert.equal(RegistrationVerification.schema.path('userId').options.unique, true)
  assert.equal(RegistrationVerification.schema.path('codeHash').options.select, false)
  assert.equal(User.schema.path('passwordHash').options.required, undefined)
})

test('assignments support student targeting and resubmission while submissions keep version history', () => {
  assert.deepEqual(new Assignment().targetStudents, [])
  assert.equal(new Assignment().allowResubmission, true)
  assert.equal(Submission.schema.path('history').instance, 'Array')
  assert.equal(Submission.schema.path('history').schema.path('attachments').instance, 'Array')
  assert.equal(Submission.schema.path('nextSteps').instance, 'Array')
})

test('Learning Hub records are scoped and enforce one weekly plan and digest per learner', () => {
  assert.equal(LearningPlan.schema.path('studentId').options.required, true)
  assert.equal(LearningPlan.schema.path('items').instance, 'Array')
  assert.ok(LearningPlan.schema.indexes().some(([keys, options]) => keys.studentId === 1 && keys.weekStarting === 1 && options.unique))
  assert.ok(AcademicDigest.schema.indexes().some(([keys, options]) => keys.userId === 1 && keys.weekStarting === 1 && options.unique))
  assert.ok(ParentDigest.schema.indexes().some(([keys, options]) => keys.userId === 1 && keys.studentId === 1 && keys.weekStarting === 1 && options.unique))
  assert.ok(PortfolioEntry.schema.indexes().some(([keys, options]) => keys.studentId === 1 && keys.submissionId === 1 && options.unique))
  assert.equal(SupportRequest.schema.path('message').options.maxlength, 1000)
  assert.ok(SupportRequest.schema.indexes().some(([keys, options]) => keys.studentId === 1 && keys.assignmentId === 1 && options.unique && options.partialFilterExpression.status === 'open'))
})

test('study chat records are owned and keep a bounded, typed message history', () => {
  assert.equal(AssistantConversation.schema.path('userId').options.required, true)
  assert.equal(AssistantConversation.schema.path('messages').schema.path('role').enumValues.join(','), 'user,assistant')
  assert.equal(AssistantConversation.schema.path('messages').schema.path('content').options.maxlength, 12000)
})

test('grades calculate percentages and reject marks above the total', async () => {
  const refs = {
    studentId: new mongoose.Types.ObjectId(),
    subjectId: new mongoose.Types.ObjectId(),
    classId: new mongoose.Types.ObjectId(),
    teacherId: new mongoose.Types.ObjectId(),
  }
  const grade = new Grade({ ...refs, examName: 'Quiz', marksObtained: 75, totalMarks: 100, percentage: 0, grade: 'B' })
  await grade.validate()
  assert.equal(grade.percentage, 75)
  const invalidGrade = new Grade({ ...refs, examName: 'Quiz', marksObtained: 101, totalMarks: 100, percentage: 101, grade: 'A' })
  await assert.rejects(invalidGrade.validate(), /Marks obtained cannot exceed total marks/)
})

test('grades reject missing marks and zero totals without dividing by zero', async () => {
  const refs = {
    studentId: new mongoose.Types.ObjectId(),
    subjectId: new mongoose.Types.ObjectId(),
    classId: new mongoose.Types.ObjectId(),
    teacherId: new mongoose.Types.ObjectId(),
  }
  const missingMarks = new Grade({ ...refs, examName: 'Quiz', marksObtained: null, totalMarks: 100, percentage: 0, grade: '—' })
  await assert.rejects(missingMarks.validate(), /marksObtained/)
  const zeroTotal = new Grade({ ...refs, examName: 'Quiz', marksObtained: 0, totalMarks: 0, percentage: 0, grade: '—' })
  await assert.rejects(zeroTotal.validate(), /Total marks must be greater than zero/)
})

test('attendance percentage handles valid records and an empty denominator', async () => {
  const { attendancePercentage } = await import('../src/utils/attendance.js')
  assert.equal(attendancePercentage(9, 10), 90)
  assert.equal(attendancePercentage(0, 0), 0)
  assert.equal(attendancePercentage(null, 0), 0)
})

test('timetable entries require a valid end time after the start time', async () => {
  const timetable = new Timetable({
    classId: new mongoose.Types.ObjectId(),
    subjectId: new mongoose.Types.ObjectId(),
    teacherId: new mongoose.Types.ObjectId(),
    dayOfWeek: 1,
    startTime: '11:00',
    endTime: '10:00',
  })
  await assert.rejects(timetable.validate(), /End time must be later than start time/)
})

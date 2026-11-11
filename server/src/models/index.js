import mongoose from 'mongoose'

const { Schema } = mongoose
const roles = ['admin', 'teacher', 'student', 'parent']
const timestamps = { timestamps: true, strict: 'throw' }

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: roles, required: true, immutable: true },
  profileImage: { type: String, default: '' },
  phone: { type: String, trim: true, maxlength: 32, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' },
  isActive: { type: Boolean, default: true },
  isEmailVerified: { type: Boolean, default: false },
  lastLogin: Date,
  refreshTokenHashes: { type: [String], select: false, default: [] },
  tokenVersion: { type: Number, default: 0, select: false },
}, timestamps)

const studentSchema = new Schema({
  admissionNumber: { type: String, required: true, unique: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  dateOfBirth: Date,
  gender: { type: String, enum: ['female', 'male', 'nonbinary', 'unspecified'], default: 'unspecified' },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', default: null },
  section: { type: String, trim: true, default: '' },
  rollNumber: { type: String, trim: true, default: '' },
  parentIds: [{ type: Schema.Types.ObjectId, ref: 'Parent' }],
  admissionDate: { type: Date, default: Date.now },
  address: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'inactive', 'graduated', 'transferred'], default: 'active' },
}, timestamps)
studentSchema.index({ classId: 1, rollNumber: 1 }, { sparse: true })

const teacherSchema = new Schema({
  employeeId: { type: String, required: true, unique: true, trim: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  department: { type: String, trim: true, default: '' },
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
  assignedClasses: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  joiningDate: Date,
  qualification: { type: String, trim: true, default: '' },
  status: { type: String, enum: ['active', 'inactive', 'on_leave'], default: 'active' },
}, timestamps)

const parentSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true, default: '' },
  occupation: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  children: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
}, timestamps)

const classSchema = new Schema({
  name: { type: String, required: true, trim: true },
  section: { type: String, required: true, trim: true },
  academicYear: { type: String, required: true, trim: true },
  classTeacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
  students: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  subjects: [{ type: Schema.Types.ObjectId, ref: 'Subject' }],
}, timestamps)
classSchema.index({ name: 1, section: 1, academicYear: 1 }, { unique: true })

const subjectSchema = new Schema({
  name: { type: String, required: true, trim: true },
  subjectCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
}, timestamps)

const attendanceSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true },
  markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  remarks: { type: String, trim: true, maxlength: 1000, default: '' },
}, timestamps)
attendanceSchema.index({ studentId: 1, date: 1 }, { unique: true })
attendanceSchema.index({ classId: 1, date: 1 })

const assignmentSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 10000, default: '' },
  instructions: { type: String, trim: true, maxlength: 10000, default: '' },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  targetStudents: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
  dueDate: { type: Date, required: true },
  attachments: [{ type: String, trim: true }],
  totalMarks: { type: Number, min: 0, required: true },
  allowResubmission: { type: Boolean, default: true },
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published' },
}, timestamps)

const submissionVersionSchema = new Schema({
  submissionText: { type: String, trim: true, maxlength: 20000, default: '' },
  attachments: [{ type: String, trim: true }],
  submittedAt: { type: Date, required: true },
  marksObtained: { type: Number, min: 0, default: null },
  feedback: { type: String, trim: true, maxlength: 5000, default: '' },
  status: { type: String, enum: ['submitted', 'late', 'reviewed', 'graded', 'returned'], required: true },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false })

const submissionSchema = new Schema({
  assignmentId: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  submissionText: { type: String, trim: true, maxlength: 20000, default: '' },
  attachments: [{ type: String, trim: true }],
  submittedAt: { type: Date, default: Date.now },
  marksObtained: { type: Number, min: 0, default: null },
  feedback: { type: String, trim: true, maxlength: 5000, default: '' },
  status: { type: String, enum: ['submitted', 'late', 'reviewed', 'graded', 'returned'], default: 'submitted' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  history: { type: [submissionVersionSchema], default: [] },
}, timestamps)
submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true })

const gradeSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  examName: { type: String, required: true, trim: true },
  marksObtained: { type: Number, min: 0, required: true },
  totalMarks: { type: Number, min: 0, required: true },
  percentage: { type: Number, min: 0, max: 100, required: true },
  grade: { type: String, trim: true, required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  remarks: { type: String, trim: true, maxlength: 2000, default: '' },
}, timestamps)
gradeSchema.pre('validate', function validateGrade(next) {
  if (this.totalMarks <= 0) this.invalidate('totalMarks', 'Total marks must be greater than zero.')
  if (this.marksObtained > this.totalMarks) this.invalidate('marksObtained', 'Marks obtained cannot exceed total marks.')
  if (this.totalMarks > 0) this.percentage = Math.round((this.marksObtained / this.totalMarks) * 10000) / 100
  next()
})

const announcementSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 200 },
  content: { type: String, required: true, trim: true, maxlength: 10000 },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  targetRoles: [{ type: String, enum: roles }],
  targetClasses: [{ type: Schema.Types.ObjectId, ref: 'Class' }],
  attachments: [{ type: String, trim: true }],
  publishedAt: { type: Date, default: Date.now },
}, timestamps)

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  type: { type: String, enum: ['general', 'assignment', 'attendance', 'message', 'announcement'], default: 'general' },
  isRead: { type: Boolean, default: false },
  relatedEntity: { type: Schema.Types.ObjectId, default: null },
}, timestamps)
notificationSchema.index({ userId: 1, createdAt: -1 })

const conversationSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
  participantKey: { type: String, unique: true, select: false },
  lastMessage: { type: String, trim: true, maxlength: 2000, default: '' },
  lastMessageAt: Date,
}, timestamps)
conversationSchema.index({ participants: 1, lastMessageAt: -1 })

const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, trim: true, maxlength: 5000 },
  attachments: [{ type: String, trim: true }],
  isRead: { type: Boolean, default: false },
  sentAt: { type: Date, default: Date.now },
}, timestamps)
messageSchema.index({ conversationId: 1, sentAt: -1 })

const feeSchema = new Schema({
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
  academicYear: { type: String, required: true, trim: true },
  feeType: { type: String, required: true, trim: true },
  amount: { type: Number, min: 0, required: true },
  dueDate: { type: Date, required: true },
  paidAmount: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['pending', 'partial', 'paid', 'overdue'], default: 'pending' },
  paymentDate: Date,
  transactionReference: { type: String, trim: true, default: '' },
}, timestamps)

const timetableSchema = new Schema({
  classId: { type: Schema.Types.ObjectId, ref: 'Class', required: true },
  subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', required: true },
  dayOfWeek: { type: Number, min: 0, max: 6, required: true },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  room: { type: String, trim: true, maxlength: 80, default: '' },
}, timestamps)
timetableSchema.pre('validate', function validateTimeRange(next) {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    this.invalidate('endTime', 'End time must be later than start time.')
  }
  next()
})

const passwordResetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true })

const uploadSchema = new Schema({
  storedName: { type: String, required: true, unique: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  fileData: { type: Buffer, select: false },
  storedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true })

const assistantMessageSchema = new Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true, trim: true, maxlength: 12000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true })

const assistantConversationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, trim: true, maxlength: 120, default: 'New study chat' },
  messages: { type: [assistantMessageSchema], default: [] },
  lastMessageAt: { type: Date, default: Date.now },
}, timestamps)
assistantConversationSchema.index({ userId: 1, lastMessageAt: -1 })

function model(name, schema) {
  return mongoose.models[name] || mongoose.model(name, schema)
}

export const User = model('User', userSchema)
export const Student = model('Student', studentSchema)
export const Teacher = model('Teacher', teacherSchema)
export const Parent = model('Parent', parentSchema)
export const SchoolClass = model('Class', classSchema)
export const Subject = model('Subject', subjectSchema)
export const Attendance = model('Attendance', attendanceSchema)
export const Assignment = model('Assignment', assignmentSchema)
export const Submission = model('Submission', submissionSchema)
export const Grade = model('Grade', gradeSchema)
export const Announcement = model('Announcement', announcementSchema)
export const Notification = model('Notification', notificationSchema)
export const Conversation = model('Conversation', conversationSchema)
export const Message = model('Message', messageSchema)
export const Fee = model('Fee', feeSchema)
export const Timetable = model('Timetable', timetableSchema)
export const PasswordReset = model('PasswordReset', passwordResetSchema)
export const Upload = model('Upload', uploadSchema)
export const AssistantConversation = model('AssistantConversation', assistantConversationSchema)

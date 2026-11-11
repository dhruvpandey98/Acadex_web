import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { validateEnvironment } from '../config/env.js'
import { connectDatabase } from '../config/db.js'
import {
  Announcement, Assignment, Attendance, Fee, Grade, Notification, Parent,
  SchoolClass, Student, Submission, Subject, Teacher, Timetable, User,
} from '../models/index.js'

if (process.env.NODE_ENV !== 'development') {
  throw new Error('Set NODE_ENV=development to run the demo seed script.')
}

validateEnvironment()
const demoPassword = process.env.DEMO_PASSWORD
if (!demoPassword || Buffer.byteLength(demoPassword, 'utf8') < 12 || Buffer.byteLength(demoPassword, 'utf8') > 72) {
  throw new Error('DEMO_PASSWORD must be configured with 12 to 72 UTF-8 bytes before seeding demo accounts.')
}
await connectDatabase()
const passwordHash = await bcrypt.hash(demoPassword, 12)

async function seedUser(name, email, role) {
  return User.findOneAndUpdate(
    { email },
    { $setOnInsert: { name, email, role, passwordHash, isActive: true, isEmailVerified: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
}

try {
  const adminUser = await seedUser('Alex Morgan', 'admin@acadex.demo', 'admin')
  const adminTeacher = await seedUser('Sophie Anderson', 'teacher@acadex.demo', 'teacher')
  const demoStudentUser = await seedUser('Olivia Chen', 'student@acadex.demo', 'student')
  const demoParentUser = await seedUser('Jamie Chen', 'parent@acadex.demo', 'parent')

  const teachers = []
  for (let index = 0; index < 10; index += 1) {
    const user = index === 0 ? adminTeacher : await seedUser(`Teacher ${index + 1}`, `teacher${index + 1}@acadex.demo`, 'teacher')
    const teacher = await Teacher.findOneAndUpdate(
      { userId: user.id },
      { $setOnInsert: { employeeId: `EMP-${String(index + 1).padStart(3, '0')}`, userId: user.id, name: user.name, email: user.email, department: ['Mathematics', 'Science', 'English', 'Arts'][index % 4], status: 'active' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    teachers.push(teacher)
  }

  const classes = []
  for (let index = 0; index < 10; index += 1) {
    const schoolClass = await SchoolClass.findOneAndUpdate(
      { name: `Grade ${Math.floor(index / 2) + 6}`, section: index % 2 === 0 ? 'A' : 'B', academicYear: '2026-2027' },
      { $setOnInsert: { name: `Grade ${Math.floor(index / 2) + 6}`, section: index % 2 === 0 ? 'A' : 'B', academicYear: '2026-2027', classTeacherId: teachers[index]._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    classes.push(schoolClass)
  }
  await Promise.all(teachers.map((teacher, index) => {
    teacher.assignedClasses = [classes[index]._id]
    return teacher.save()
  }))

  const subjects = []
  for (let index = 0; index < classes.length; index += 1) {
    for (const [subjectIndex, name] of ['Mathematics', 'Science', 'English'].entries()) {
      const subject = await Subject.findOneAndUpdate(
        { subjectCode: `G${index + 6}${classes[index].section}-${subjectIndex + 1}` },
        { $setOnInsert: { name, subjectCode: `G${index + 6}${classes[index].section}-${subjectIndex + 1}`, classId: classes[index]._id, teacherId: teachers[index]._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      subjects.push(subject)
    }
  }
  await Promise.all(classes.map(async (schoolClass, index) => {
    const classSubjects = subjects.slice(index * 3, index * 3 + 3)
    schoolClass.subjects = classSubjects.map((subject) => subject._id)
    await schoolClass.save()
    teachers[index].subjects = classSubjects.map((subject) => subject._id)
    await teachers[index].save()
  }))

  const students = []
  const parents = []
  for (let index = 0; index < 100; index += 1) {
    const classIndex = index % classes.length
    const user = index === 0 ? demoStudentUser : await seedUser(`Student ${String(index + 1).padStart(3, '0')}`, `student${String(index + 1).padStart(3, '0')}@acadex.demo`, 'student')
    const student = await Student.findOneAndUpdate(
      { userId: user.id },
      { $setOnInsert: { admissionNumber: `AC-${String(index + 1).padStart(5, '0')}`, userId: user.id, name: user.name, email: user.email, classId: classes[classIndex]._id, section: classes[classIndex].section, rollNumber: String(index + 1), admissionDate: new Date('2026-04-01'), status: 'active' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    students.push(student)
  }

  for (let index = 0; index < 20; index += 1) {
    const user = index === 0 ? demoParentUser : await seedUser(`Parent ${String(index + 1).padStart(2, '0')}`, `parent${String(index + 1).padStart(2, '0')}@acadex.demo`, 'parent')
    const children = students.slice(index * 5, index * 5 + 5)
    const parent = await Parent.findOneAndUpdate(
      { userId: user.id },
      { $set: { name: user.name, email: user.email, children: children.map((child) => child._id) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    parents.push(parent)
    await Student.updateMany({ _id: { $in: children.map((child) => child._id) } }, { $addToSet: { parentIds: parent._id } })
  }
  await Promise.all(classes.map((schoolClass) => Student.find({ classId: schoolClass._id }).distinct('_id')
    .then((studentIds) => SchoolClass.updateOne({ _id: schoolClass._id }, { $set: { students: studentIds } }))))

  const assignments = []
  for (let index = 0; index < classes.length; index += 1) {
    const assignment = await Assignment.findOneAndUpdate(
      { title: `Practice set ${index + 1}`, classId: classes[index]._id },
      { $setOnInsert: { title: `Practice set ${index + 1}`, description: 'Complete the assigned practice problems and show your working.', subjectId: subjects[index * 3]._id, classId: classes[index]._id, teacherId: teachers[index]._id, dueDate: new Date(Date.now() + 14 * 86400000), totalMarks: 100, status: 'published' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    assignments.push(assignment)
  }

  const attendanceDate = new Date()
  attendanceDate.setHours(0, 0, 0, 0)
  const attendanceBulk = []
  for (const [index, student] of students.entries()) {
    attendanceBulk.push({
      updateOne: {
        filter: { studentId: student._id, date: attendanceDate },
        update: { $setOnInsert: { studentId: student._id, classId: student.classId, date: attendanceDate, status: index % 12 === 0 ? 'absent' : 'present', markedBy: adminUser._id } },
        upsert: true,
      },
    })
    const assigned = assignments[index % assignments.length]
    await Grade.findOneAndUpdate(
      { studentId: student._id, subjectId: assigned.subjectId, examName: 'Term 1 assessment' },
      { $setOnInsert: { studentId: student._id, subjectId: assigned.subjectId, classId: student.classId, examName: 'Term 1 assessment', marksObtained: 70 + (index % 31), totalMarks: 100, percentage: 70 + (index % 31), grade: index % 31 > 20 ? 'A' : 'B', teacherId: teachers[index % teachers.length]._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    await Fee.findOneAndUpdate(
      { studentId: student._id, academicYear: '2026-2027', feeType: 'Tuition' },
      { $setOnInsert: { studentId: student._id, academicYear: '2026-2027', feeType: 'Tuition', amount: 2400, dueDate: new Date('2027-01-15'), paidAmount: index % 3 === 0 ? 2400 : 0, status: index % 3 === 0 ? 'paid' : 'pending' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    if (index < 10) {
      await Submission.findOneAndUpdate(
        { assignmentId: assigned._id, studentId: student._id },
        { $setOnInsert: { assignmentId: assigned._id, studentId: student._id, submissionText: 'Demo submission for review.', status: 'submitted' } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
    }
  }
  await Attendance.bulkWrite(attendanceBulk, { ordered: false })

  for (const [index, schoolClass] of classes.entries()) {
    await Timetable.findOneAndUpdate(
      { classId: schoolClass._id, subjectId: subjects[index * 3]._id, dayOfWeek: 1, startTime: '09:00' },
      { $setOnInsert: { classId: schoolClass._id, subjectId: subjects[index * 3]._id, teacherId: teachers[index]._id, dayOfWeek: 1, startTime: '09:00', endTime: '09:50', room: `Room ${101 + index}` } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )
  }

  await Announcement.findOneAndUpdate(
    { title: 'Welcome to Acadex', createdBy: adminUser._id },
    { $setOnInsert: { title: 'Welcome to Acadex', content: 'The new academic year is underway. Please review your classes and upcoming assignments.', createdBy: adminUser._id, targetRoles: ['admin', 'teacher', 'student', 'parent'], targetClasses: [], publishedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
  await Notification.findOneAndUpdate(
    { userId: demoStudentUser._id, title: 'Welcome to Acadex' },
    { $setOnInsert: { userId: demoStudentUser._id, title: 'Welcome to Acadex', message: 'Your student portal is ready.', type: 'general' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )

  console.log('Acadex demo data is ready.')
  console.log('Demo accounts use the configured DEMO_PASSWORD.')
  console.log('Admin: admin@acadex.demo; teacher: teacher@acadex.demo; student: student@acadex.demo; parent: parent@acadex.demo')
} finally {
  await mongoose.disconnect()
}

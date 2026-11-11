import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { Assignment, Student, Submission, Teacher, Upload } from '../models/index.js'
import { AppError, asyncHandler } from '../utils/errors.js'

const router = Router()
const directory = path.resolve(process.cwd(), 'uploads')
const acceptedFiles = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.zip': ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.gif': ['image/gif'],
  '.bmp': ['image/bmp'],
  '.tif': ['image/tiff'],
  '.tiff': ['image/tiff'],
  '.avif': ['image/avif'],
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(path.basename(file.originalname)).toLowerCase()
    const acceptedMimes = acceptedFiles[extension]
    if (!acceptedMimes || !acceptedMimes.includes(file.mimetype)) {
      return callback(new AppError(400, 'Upload a PDF, DOC, DOCX, PPT, PPTX, ZIP, or supported image file.'))
    }
    return callback(null, true)
  },
})

router.use(authenticate)

router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, 'A file is required.')
  const data = await Upload.create({
    storedName: randomUUID(),
    originalName: path.basename(req.file.originalname),
    mimeType: req.file.mimetype,
    size: req.file.size,
    fileData: req.file.buffer,
    storedBy: req.user.id,
  })
  res.status(201).json({ data: { id: data.id, name: data.originalName, url: `/api/uploads/${data.id}` } })
}))

router.get('/:id', asyncHandler(async (req, res) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) throw new AppError(400, 'Upload identifier is invalid.')
  const file = await Upload.findById(req.params.id).select('+fileData')
  if (!file) throw new AppError(404, 'File not found.')
  if (file.storedBy.toString() !== req.user.id) {
    let permitted = req.user.role === 'admin'
    if (!permitted && req.user.role === 'teacher') {
      const teacher = await Teacher.findOne({ userId: req.user.id }).select('_id assignedClasses')
      if (teacher) {
        const assignmentIds = await Assignment.find({
          $or: [{ teacherId: teacher._id }, { classId: { $in: teacher.assignedClasses } }],
        }).distinct('_id')
        permitted = Boolean(await Assignment.exists({ _id: { $in: assignmentIds }, attachments: file.id }))
        if (!permitted) permitted = Boolean(await Submission.exists({ assignmentId: { $in: assignmentIds }, attachments: file.id }))
      }
    } else if (!permitted && req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user.id }).select('_id classId')
      if (student) {
        const assigned = await Assignment.exists({
          classId: student.classId,
          attachments: file.id,
          $or: [{ targetStudents: { $size: 0 } }, { targetStudents: student.id }],
        })
        permitted = Boolean(assigned || await Submission.exists({ studentId: student.id, attachments: file.id }))
      }
    }
    if (!permitted) throw new AppError(404, 'File not found.')
  }
  res.type(file.mimeType)
  const inline = req.query.inline === 'true' && (file.mimeType === 'application/pdf' || file.mimeType.startsWith('image/'))
  res.set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`)
  if (file.fileData) return res.send(file.fileData)
  res.sendFile(path.join(directory, file.storedName))
}))

export default router

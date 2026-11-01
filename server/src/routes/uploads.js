import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { authenticate } from '../middleware/auth.js'
import { Upload } from '../models/index.js'
import { AppError, asyncHandler } from '../utils/errors.js'

const router = Router()
const directory = path.resolve(process.cwd(), 'uploads')
const acceptedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!acceptedTypes.has(file.mimetype)) return callback(new AppError(400, 'Only PDF, PNG, JPEG, WebP, or plain-text files are accepted.'))
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
  const file = await Upload.findOne({ _id: req.params.id, storedBy: req.user.id }).select('+fileData')
  if (!file) throw new AppError(404, 'File not found.')
  res.type(file.mimeType)
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`)
  if (file.fileData) return res.send(file.fileData)
  res.sendFile(path.join(directory, file.storedName))
}))

export default router

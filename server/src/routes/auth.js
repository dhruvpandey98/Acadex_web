import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import { PasswordReset, Student, User } from '../models/index.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { AppError, asyncHandler } from '../utils/errors.js'
import { cookieOptions, signAccessToken, signRefreshToken, tokenDigest } from '../utils/auth.js'
import { getClientUrl } from '../config/clientUrl.js'

const router = Router()
const accessCookie = 'acadex_access'
const refreshCookie = 'acadex_refresh'
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false })
const passwordPolicy = body('password')
  .isLength({ min: 8, max: 128 })
  .custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72)
  .withMessage('Password must be 8 to 128 characters and at most 72 UTF-8 bytes.')

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profileImage: user.profileImage,
    isEmailVerified: user.isEmailVerified,
  }
}

function issueSession(res, user, refreshHashes) {
  const accessToken = signAccessToken(user)
  const refreshToken = signRefreshToken(user)
  refreshHashes.push(tokenDigest(refreshToken))
  user.refreshTokenHashes = refreshHashes.slice(-5)
  return user.save().then(() => {
    res.cookie(accessCookie, accessToken, cookieOptions(15 * 60 * 1000))
    res.cookie(refreshCookie, refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000))
  })
}

router.post('/register',
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('email').trim().isEmail().normalizeEmail(),
  passwordPolicy,
  validate,
  asyncHandler(async (req, res) => {
    const name = req.body.name
    const email = req.body.email.toLowerCase()
    const passwordHash = await bcrypt.hash(req.body.password, 12)
    const user = await User.create({ name, email, passwordHash, role: 'student' })
    try {
      await Student.create({
        admissionNumber: `REG-${randomBytes(8).toString('hex').toUpperCase()}`,
        userId: user.id,
        name,
        email,
      })
    } catch (error) {
      await User.deleteOne({ _id: user.id })
      throw error
    }

    await issueSession(res, user, [])
    res.status(201).json({ user: publicUser(user) })
  }),
)

router.post('/login', loginLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 1, max: 128 }).custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72),
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() })
      .select('+passwordHash +refreshTokenHashes +tokenVersion')
    const passwordMatches = user ? await bcrypt.compare(req.body.password, user.passwordHash) : false
    if (!user || !passwordMatches || !user.isActive) {
      throw new AppError(401, 'Email or password is incorrect.')
    }

    user.lastLogin = new Date()
    await issueSession(res, user, user.refreshTokenHashes || [])
    res.json({ user: publicUser(user) })
  }),
)

router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[refreshCookie]
  if (!refreshToken) throw new AppError(401, 'Refresh token is missing.')

  let payload
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
  } catch {
    throw new AppError(401, 'Refresh token is invalid or expired.')
  }

  const user = await User.findById(payload.sub).select('+refreshTokenHashes +tokenVersion')
  const digest = tokenDigest(refreshToken)
  if (!user || !user.isActive || user.tokenVersion !== payload.ver || !user.refreshTokenHashes.includes(digest)) {
    throw new AppError(401, 'Refresh token is no longer active.')
  }

  const remainingHashes = user.refreshTokenHashes.filter((hash) => hash !== digest)
  await issueSession(res, user, remainingHashes)
  res.json({ user: publicUser(user) })
}))

router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[refreshCookie]
  if (refreshToken) {
    let payload
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    } catch {
      payload = null
    }
    if (payload) {
      const user = await User.findById(payload.sub).select('+refreshTokenHashes +tokenVersion')
      if (user && user.refreshTokenHashes.includes(tokenDigest(refreshToken))) {
        user.tokenVersion += 1
        user.refreshTokenHashes = []
        await user.save()
      }
    }
  }
  res.clearCookie(accessCookie, cookieOptions(0))
  res.clearCookie(refreshCookie, cookieOptions(0))
  res.status(204).end()
}))

router.get('/me', authenticate, (req, res) => {
  res.json({ user: publicUser(req.user) })
})

router.patch('/change-password', authenticate,
  body('currentPassword').isString().isLength({ min: 1, max: 128 }).custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72),
  passwordPolicy,
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).select('+passwordHash +tokenVersion +refreshTokenHashes')
    if (!user || !await bcrypt.compare(req.body.currentPassword, user.passwordHash)) {
      throw new AppError(400, 'Current password is incorrect.')
    }
    user.passwordHash = await bcrypt.hash(req.body.password, 12)
    user.tokenVersion += 1
    user.refreshTokenHashes = []
    await user.save()
    res.clearCookie(accessCookie, cookieOptions(0))
    res.clearCookie(refreshCookie, cookieOptions(0))
    res.status(204).end()
  }),
)

router.post('/forgot-password', resetLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  validate,
  asyncHandler(async (req, res) => {
    const smtpReady = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM
    if (!smtpReady) throw new AppError(503, 'Password-reset email is not configured on this server.')

    const user = await User.findOne({ email: req.body.email.toLowerCase(), isActive: true })
    if (user) {
      const rawToken = randomBytes(32).toString('base64url')
      await PasswordReset.deleteMany({ userId: user.id })
      await PasswordReset.create({
        userId: user.id,
        tokenHash: tokenDigest(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      })
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      })
      const resetUrl = new URL('/reset-password', getClientUrl())
      resetUrl.searchParams.set('token', rawToken)
      resetUrl.searchParams.set('email', user.email)
      await transporter.sendMail({
        from: process.env.MAIL_FROM,
        to: user.email,
        subject: 'Reset your Acadex password',
        text: `Use this link within 30 minutes to reset your password: ${resetUrl}`,
      })
    }
    res.json({ message: 'If an active account exists for that email, password reset instructions have been sent.' })
  }),
)

router.post('/reset-password', resetLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  body('token').isString().isLength({ min: 20, max: 200 }),
  passwordPolicy,
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase(), isActive: true })
    const reset = user && await PasswordReset.findOne({
      userId: user.id,
      tokenHash: tokenDigest(req.body.token),
      expiresAt: { $gt: new Date() },
    })
    if (!user || !reset) throw new AppError(400, 'Reset link is invalid or expired.')

    user.passwordHash = await bcrypt.hash(req.body.password, 12)
    user.tokenVersion += 1
    user.refreshTokenHashes = []
    await user.save()
    await PasswordReset.deleteMany({ userId: user.id })
    res.status(204).end()
  }),
)

export default router

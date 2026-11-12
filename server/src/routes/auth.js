import { randomBytes, randomInt } from 'node:crypto'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { body } from 'express-validator'
import { PasswordReset, RegistrationVerification, Student, User } from '../models/index.js'
import { authenticate } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { AppError, asyncHandler } from '../utils/errors.js'
import { cookieOptions, signAccessToken, signRefreshToken, tokenDigest } from '../utils/auth.js'
import { getClientUrl } from '../config/clientUrl.js'
import { isMailConfigured, sendMail } from '../utils/mail.js'
import { isSchoolEmail } from '../utils/emailDomains.js'

const router = Router()
const accessCookie = 'acadex_access'
const refreshCookie = 'acadex_refresh'
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false })
const registrationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false })
const verificationLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false })
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

function requireMailConfiguration() {
  if (!isMailConfigured()) throw new AppError(503, 'Account email is not configured on this server.')
}

function requireAdminEmail() {
  if (!process.env.ADMIN_EMAIL) throw new AppError(503, 'Admin notifications are not configured on this server.')
}

async function createStudentProfile(user) {
  await Student.create({
    admissionNumber: `REG-${randomBytes(8).toString('hex').toUpperCase()}`,
    userId: user.id,
    name: user.name,
    email: user.email,
  })
}

async function notifyAdminOfExternalRegistration(user) {
  await sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: 'New student account outside school domains',
    text: `${user.name} (${user.email}) created a student account using an address outside the configured school domains.`,
  })
}

async function notifyAccountCreated(user) {
  await sendMail({
    to: user.email,
    subject: 'Your Acadex account is ready',
    text: `Your Acadex account has been created. You can now sign in at ${getClientUrl()}/login.`,
  })
}

router.post('/register', registrationLimiter,
  body('name').trim().isLength({ min: 2, max: 120 }),
  body('email').trim().isEmail().normalizeEmail(),
  passwordPolicy,
  validate,
  asyncHandler(async (req, res) => {
    requireMailConfiguration()
    const name = req.body.name
    const email = req.body.email.toLowerCase()
    const schoolEmail = isSchoolEmail(email)
    if (!schoolEmail) requireAdminEmail()
    if (await User.exists({ email })) throw new AppError(409, 'An account with this email already exists.')

    const passwordHash = await bcrypt.hash(req.body.password, 12)
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: 'student',
      isActive: false,
      approvalStatus: 'pending',
    })
    const code = String(randomInt(100000, 1000000))
    try {
      await createStudentProfile(user)
      await RegistrationVerification.create({
        userId: user.id,
        codeHash: await bcrypt.hash(code, 10),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      })
      await sendMail({
        to: user.email,
        subject: 'Verify your Acadex email',
        text: `Your Acadex verification code is ${code}. It expires in 10 minutes.`,
      })
    } catch (error) {
      await Promise.all([
        RegistrationVerification.deleteOne({ userId: user.id }),
        Student.deleteOne({ userId: user.id }),
      ])
      await User.deleteOne({ _id: user.id })
      throw error
    }

    res.status(201).json({ message: 'A verification code has been sent to your email.' })
  }),
)

router.post('/verify-registration', verificationLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  body('code').isString().matches(/^\d{6}$/),
  validate,
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase()
    const user = await User.findOne({ email, isEmailVerified: false })
    const verification = user && await RegistrationVerification.findOne({
      userId: user.id,
      expiresAt: { $gt: new Date() },
    }).select('+codeHash')
    if (!user || !verification) throw new AppError(400, 'Verification code is invalid or expired.')
    requireMailConfiguration()
    if (!isSchoolEmail(email)) requireAdminEmail()
    if (verification.attempts >= 5) {
      await RegistrationVerification.deleteOne({ _id: verification.id })
      throw new AppError(400, 'Too many incorrect codes. Start registration again.')
    }
    if (!await bcrypt.compare(req.body.code, verification.codeHash)) {
      await RegistrationVerification.updateOne({ _id: verification.id }, { $inc: { attempts: 1 } })
      throw new AppError(400, 'Verification code is invalid or expired.')
    }

    const consumed = await RegistrationVerification.findOneAndDelete({
      _id: verification.id,
      codeHash: verification.codeHash,
    })
    if (!consumed) throw new AppError(400, 'Verification code is invalid or expired.')

    if (!isSchoolEmail(email)) await notifyAdminOfExternalRegistration(user)
    await notifyAccountCreated(user)
    user.isEmailVerified = true
    user.isActive = true
    user.approvalStatus = 'approved'
    await user.save()
    await issueSession(res, user, [])
    return res.status(200).json({ user: publicUser(user) })
  }),
)

router.post('/resend-registration-code', registrationLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase(), isEmailVerified: false })
    if (user) {
      requireMailConfiguration()
      if (user.approvalStatus === 'pending' && !isSchoolEmail(user.email)) requireAdminEmail()
      const code = String(randomInt(100000, 1000000))
      await RegistrationVerification.findOneAndUpdate(
        { userId: user.id },
        { codeHash: await bcrypt.hash(code, 10), attempts: 0, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
        { upsert: true, runValidators: true },
      )
      await sendMail({
        to: user.email,
        subject: 'Verify your Acadex email',
        text: `Your Acadex verification code is ${code}. It expires in 10 minutes.`,
      })
    }
    res.json({ message: 'If your account still needs email verification, a new code has been sent.' })
  }),
)

router.post('/google', registrationLimiter,
  body('credential').isString().isLength({ min: 20, max: 5000 }),
  validate,
  asyncHandler(async (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) throw new AppError(503, 'Google sign-up is not configured on this server.')
    const googleResponse = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: req.body.credential }),
      signal: AbortSignal.timeout(5000),
    })
    if (!googleResponse.ok) throw new AppError(401, 'Google sign-in could not verify this account.')
    const claims = await googleResponse.json()
    const validIssuer = ['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    if (claims.aud !== clientId || !validIssuer || ![true, 'true'].includes(claims.email_verified) || !claims.email || !claims.sub) {
      throw new AppError(401, 'Google sign-in could not verify this account.')
    }

    const email = claims.email.toLowerCase()
    const schoolEmail = isSchoolEmail(email)
    let user = await User.findOne({ email }).select('+refreshTokenHashes +tokenVersion')
    if (!user) {
      requireMailConfiguration()
      if (!schoolEmail) requireAdminEmail()
      user = await User.create({
        name: claims.name || claims.given_name || email.split('@')[0],
        email,
        role: 'student',
        isEmailVerified: false,
        isActive: false,
        approvalStatus: 'pending',
      })
      try {
        await createStudentProfile(user)
      } catch (error) {
        await User.deleteOne({ _id: user.id })
        throw error
      }

      if (!schoolEmail) await notifyAdminOfExternalRegistration(user)
      await notifyAccountCreated(user)
      user.isEmailVerified = true
      user.isActive = true
      user.approvalStatus = 'approved'
      await user.save()
    } else if (user.approvalStatus === 'pending') {
      const emailWasVerified = user.isEmailVerified
      requireMailConfiguration()
      if (!schoolEmail && !emailWasVerified) {
        requireAdminEmail()
        await notifyAdminOfExternalRegistration(user)
      }
      await notifyAccountCreated(user)
      user.isEmailVerified = true
      user.isActive = true
      user.approvalStatus = 'approved'
      await user.save()
    } else if (!user.isActive) {
      throw new AppError(403, 'This account is paused. Contact your school administrator.')
    }

    user.lastLogin = new Date()
    await issueSession(res, user, user.refreshTokenHashes || [])
    res.json({ user: publicUser(user) })
  }),
)

router.post('/login', loginLimiter,
  body('email').trim().isEmail().normalizeEmail(),
  body('password').isString().isLength({ min: 1, max: 128 }).custom((value) => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72),
  validate,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() })
      .select('+passwordHash +refreshTokenHashes +tokenVersion')
    const passwordMatches = user?.passwordHash ? await bcrypt.compare(req.body.password, user.passwordHash) : false
    if (user && passwordMatches && !user.isEmailVerified) {
      throw new AppError(403, 'Verify your email address before signing in.')
    }
    if (user && passwordMatches && user.approvalStatus === 'pending' && user.isEmailVerified) {
      requireMailConfiguration()
      await notifyAccountCreated(user)
      user.isActive = true
      user.approvalStatus = 'approved'
    }
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
    if (!user || !user.passwordHash || !await bcrypt.compare(req.body.currentPassword, user.passwordHash)) {
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
      const resetUrl = new URL('/reset-password', getClientUrl())
      resetUrl.searchParams.set('token', rawToken)
      resetUrl.searchParams.set('email', user.email)
      await sendMail({
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

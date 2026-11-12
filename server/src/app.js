import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import mongoose from 'mongoose'
import rateLimit from 'express-rate-limit'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import authRoutes from './routes/auth.js'
import assignmentWorkflowRoutes from './routes/assignmentWorkflow.js'
import learningHubRoutes from './routes/learningHub.js'
import resourceRoutes from './routes/resources.js'
import dashboardRoutes from './routes/dashboard.js'
import uploadRoutes from './routes/uploads.js'
import datasetRoutes from './routes/dataset.js'
import aiRoutes from './routes/ai.js'
import academicAiRoutes from './routes/aiRoutes.js'
import { errorHandler, notFound } from './utils/errors.js'
import { getClientUrl } from './config/clientUrl.js'

export async function createApp() {
  await mkdir(path.resolve(process.cwd(), 'uploads'), { recursive: true })
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', process.env.NODE_ENV === 'production' ? 1 : false)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://accounts.google.com/gsi/client'],
        'frame-src': ["'self'", 'https://accounts.google.com/gsi/'],
        'connect-src': ["'self'", 'https://accounts.google.com/gsi/'],
      },
    },
  }))
  app.use(cors({
    origin: getClientUrl().split(',').map((url) => url.trim()),
    credentials: true,
  }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.get('/api/health', (req, res) => {
    const connected = mongoose.connection.readyState === 1
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'error',
      database: connected ? 'connected' : 'disconnected',
    })
  })
  app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }), authRoutes)
  app.use('/api/assignment-workflow', assignmentWorkflowRoutes)
  app.use('/api/learning-hub', learningHubRoutes)
  app.use('/api', resourceRoutes)
  app.use('/api/dashboard', dashboardRoutes)
  app.use('/api/uploads', uploadRoutes)
  app.use('/api/dataset', datasetRoutes)
  app.use('/api/ai', aiRoutes)
  app.use('/api/ai', academicAiRoutes)

  const swaggerDocument = swaggerJsdoc({
    definition: {
      openapi: '3.0.3',
      info: { title: 'Acadex API', version: '1.0.0' },
      servers: [{ url: '/api' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          accessCookie: { type: 'apiKey', in: 'cookie', name: 'acadex_access' },
        },
      },
    },
    apis: [],
  })
  swaggerDocument.paths = {
    '/health': { get: { summary: 'API health', responses: { 200: { description: 'Service and database are available.' }, 503: { description: 'Database is unavailable.' } } } },
    '/dataset/insights': { get: { summary: 'Read admin-only synthetic dataset insights', security: [{ accessCookie: [] }], responses: { 200: { description: 'Dataset summary and paginated synthetic student indicators.' }, 403: { description: 'Admin role required.' } } } },
    '/auth/register': { post: { summary: 'Request a student account and email verification code', responses: { 201: { description: 'Verification code sent.' } } } },
    '/auth/verify-registration': { post: { summary: 'Verify and activate a new student account email', responses: { 200: { description: 'Account created and authenticated.' } } } },
    '/auth/resend-registration-code': { post: { summary: 'Send a replacement account verification code', responses: { 200: { description: 'Replacement code sent when verification is pending.' } } } },
    '/auth/google': { post: { summary: 'Create or sign in to a student account with Google', responses: { 200: { description: 'Authenticated.' } } } },
    '/auth/login': { post: { summary: 'Create a session', responses: { 200: { description: 'Authenticated.' } } } },
    '/auth/logout': { post: { summary: 'End the current session', responses: { 204: { description: 'Session ended.' } } } },
    '/auth/refresh': { post: { summary: 'Rotate refresh token', responses: { 200: { description: 'Session refreshed.' } } } },
    '/auth/forgot-password': { post: { summary: 'Request password reset email', responses: { 200: { description: 'Reset instructions sent when account exists.' } } } },
    '/auth/reset-password': { post: { summary: 'Reset password with a one-time token', responses: { 204: { description: 'Password changed.' } } } },
    '/auth/me': { get: { summary: 'Get current user', security: [{ accessCookie: [] }], responses: { 200: { description: 'Current user.' } } } },
    '/auth/change-password': { patch: { summary: 'Change password', security: [{ accessCookie: [] }], responses: { 204: { description: 'Password changed.' } } } },
    '/attendance/bulk': { post: { summary: 'Mark attendance for multiple students', security: [{ accessCookie: [] }], responses: { 201: { description: 'Attendance records created.' } } } },
    '/attendance/summary': { get: { summary: 'Get attendance counts', security: [{ accessCookie: [] }], responses: { 200: { description: 'Status totals.' } } } },
    '/attendance/student/{studentId}': {
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Get one student’s attendance', security: [{ accessCookie: [] }], responses: { 200: { description: 'Attendance records.' } } },
    },
    '/fees/student/{studentId}': {
      parameters: [{ name: 'studentId', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Get one student’s fees', security: [{ accessCookie: [] }], responses: { 200: { description: 'Fee records.' } } },
    },
    '/submissions/{id}/review': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      put: { summary: 'Review a student submission', security: [{ accessCookie: [] }], responses: { 200: { description: 'Submission reviewed.' } } },
    },
    '/assignment-workflow': {
      get: { summary: 'List role-scoped assignments, rosters, and submissions', security: [{ accessCookie: [] }], responses: { 200: { description: 'Assignments and submission progress for the current student or teacher.' } } },
      post: { summary: 'Publish an assignment to an assigned class or selected students', security: [{ accessCookie: [] }], responses: { 201: { description: 'Assignment published.' } } },
    },
    '/assignment-workflow/{assignmentId}/submissions': {
      parameters: [{ name: 'assignmentId', in: 'path', required: true, schema: { type: 'string' } }],
      post: { summary: 'Submit files for an assigned student assignment', security: [{ accessCookie: [] }], responses: { 201: { description: 'Submission created or resubmitted.' } } },
    },
    '/assignment-workflow/submissions/{submissionId}/review': {
      parameters: [{ name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } }],
      put: { summary: 'Record a review, marks, and feedback for an assignment submission', security: [{ accessCookie: [] }], responses: { 200: { description: 'Submission evaluation saved.' } } },
    },
    '/learning-hub': {
      get: { summary: 'Read the current student’s workload, portfolio, announcements, and help requests', security: [{ accessCookie: [] }], responses: { 200: { description: 'Private Learning Hub overview.' } } },
    },
    '/learning-hub/plan': {
      post: { summary: 'Generate and save a Gemini-assisted weekly study plan', security: [{ accessCookie: [] }], responses: { 200: { description: 'Study plan saved.' }, 503: { description: 'Gemini is not configured.' } } },
    },
    '/learning-hub/digest': {
      post: { summary: 'Generate and save a weekly academic digest', security: [{ accessCookie: [] }], responses: { 200: { description: 'Weekly digest saved.' }, 503: { description: 'Gemini is not configured.' } } },
    },
    '/learning-hub/parent-digest': {
      get: { summary: 'Read a weekly digest for a child linked to the current parent', security: [{ accessCookie: [] }], responses: { 200: { description: 'Role-scoped family digest and child choices.' }, 403: { description: 'Child is not linked to the parent.' } } },
      post: { summary: 'Generate a weekly digest for a linked child', security: [{ accessCookie: [] }], responses: { 200: { description: 'Family digest saved.' }, 403: { description: 'Child is not linked to the parent.' } } },
    },
    '/learning-hub/portfolio': {
      post: { summary: 'Add a student-owned submission and reflection to their portfolio', security: [{ accessCookie: [] }], responses: { 201: { description: 'Portfolio item saved.' } } },
    },
    '/learning-hub/portfolio/{entryId}': {
      parameters: [{ name: 'entryId', in: 'path', required: true, schema: { type: 'string' } }],
      delete: { summary: 'Remove one portfolio item owned by the current student', security: [{ accessCookie: [] }], responses: { 204: { description: 'Portfolio item removed.' } } },
    },
    '/learning-hub/support-requests': {
      get: { summary: 'List help requests for the current teacher’s classes', security: [{ accessCookie: [] }], responses: { 200: { description: 'Scoped student requests.' } } },
      post: { summary: 'Ask a teacher for help with an assigned assignment', security: [{ accessCookie: [] }], responses: { 201: { description: 'Help request created.' } } },
    },
    '/learning-hub/support-requests/{requestId}/respond': {
      parameters: [{ name: 'requestId', in: 'path', required: true, schema: { type: 'string' } }],
      put: { summary: 'Reply to a student help request for a managed assignment', security: [{ accessCookie: [] }], responses: { 200: { description: 'Teacher reply saved.' } } },
    },
    '/learning-hub/class-workload': {
      get: { summary: 'Read anonymous class-level upcoming assignment submission counts', security: [{ accessCookie: [] }], responses: { 200: { description: 'Workload summaries without student identifiers.' } } },
    },
    '/learning-hub/submissions/{submissionId}/next-steps/{stepIndex}': {
      parameters: [
        { name: 'submissionId', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'stepIndex', in: 'path', required: true, schema: { type: 'integer' } },
      ],
      patch: { summary: 'Update a revision checklist item owned by the current student', security: [{ accessCookie: [] }], responses: { 200: { description: 'Revision step updated.' } } },
    },
    '/learning-hub/improvement-steps': {
      post: { summary: 'Draft teacher-editable revision steps using Gemini', security: [{ accessCookie: [] }], responses: { 200: { description: 'Suggested steps.' }, 503: { description: 'Gemini is not configured.' } } },
    },
    '/notifications/read-all': { patch: { summary: 'Mark all notifications read', security: [{ accessCookie: [] }], responses: { 200: { description: 'Read status updated.' } } } },
    '/notifications/{id}/read': { patch: { summary: 'Mark one notification read', security: [{ accessCookie: [] }], responses: { 200: { description: 'Read status updated.' } } } },
    '/conversations': {
      get: { summary: 'List the current user’s conversations', security: [{ accessCookie: [] }], responses: { 200: { description: 'Conversation list.' } } },
      post: { summary: 'Start an authorized conversation', security: [{ accessCookie: [] }], responses: { 200: { description: 'Conversation opened.' } } },
    },
    '/ai/conversations': {
      get: { summary: 'List the current user’s AI study chats', security: [{ accessCookie: [] }], responses: { 200: { description: 'Private study chat summaries.' } } },
      post: { summary: 'Create a private AI study chat', security: [{ accessCookie: [] }], responses: { 201: { description: 'Study chat created.' } } },
    },
    '/ai/conversations/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Read an owned AI study chat', security: [{ accessCookie: [] }], responses: { 200: { description: 'Study chat with messages.' }, 404: { description: 'Chat not found.' } } },
      delete: { summary: 'Delete an owned AI study chat', security: [{ accessCookie: [] }], responses: { 204: { description: 'Study chat deleted.' } } },
    },
    '/ai/conversations/{id}/messages': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      post: {
        summary: 'Ask the AI study buddy',
        security: [{ accessCookie: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string', maxLength: 4000 } } } } } },
        responses: { 200: { description: 'User prompt and AI response.' }, 503: { description: 'AI provider is not configured or unavailable.' } },
      },
    },
    '/messages/{conversationId}': {
      parameters: [{ name: 'conversationId', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'List messages in an authorized conversation', security: [{ accessCookie: [] }], responses: { 200: { description: 'Message list.' } } },
    },
    '/messages': { post: { summary: 'Send a message', security: [{ accessCookie: [] }], responses: { 201: { description: 'Message sent.' } } } },
    '/messages/{id}/read': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      patch: { summary: 'Mark a message read', security: [{ accessCookie: [] }], responses: { 200: { description: 'Message read.' } } },
    },
    '/users/{id}/status': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      patch: { summary: 'Activate or deactivate a user', security: [{ accessCookie: [] }], responses: { 200: { description: 'Account status updated.' } } },
    },
    '/uploads': {
      post: { summary: 'Upload an authenticated attachment', security: [{ accessCookie: [] }], responses: { 201: { description: 'Upload metadata.' } } },
    },
    '/uploads/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: 'Download an owned upload', security: [{ accessCookie: [] }], responses: { 200: { description: 'File content.' } } },
    },
  }
  for (const resource of ['parents', 'students', 'teachers', 'classes', 'subjects', 'attendance', 'assignments', 'submissions', 'grades', 'announcements', 'notifications', 'fees', 'timetable']) {
    const collectionPath = swaggerDocument.paths[`/${resource}`] = {
      get: { summary: `List ${resource}`, security: [{ accessCookie: [] }], responses: { 200: { description: 'Paginated records.' } } },
    }
    const detailPath = swaggerDocument.paths[`/${resource}/{id}`] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      get: { summary: `Get ${resource} record`, security: [{ accessCookie: [] }], responses: { 200: { description: 'Record.' } } },
    }
    if (resource !== 'notifications') {
      collectionPath.post = { summary: `Create ${resource} record`, security: [{ accessCookie: [] }], responses: { 201: { description: 'Record created.' } } }
      detailPath.put = { summary: `Update ${resource} record`, security: [{ accessCookie: [] }], responses: { 200: { description: 'Record updated.' } } }
      detailPath.delete = { summary: `Delete ${resource} record`, security: [{ accessCookie: [] }], responses: { 204: { description: 'Record deleted.' } } }
    }
  }
  for (const role of ['admin', 'teacher', 'student', 'parent']) {
    swaggerDocument.paths[`/dashboard/${role}`] = {
      get: { summary: `Get ${role} analytics`, security: [{ accessCookie: [] }], responses: { 200: { description: 'Dashboard data.' } } },
    }
  }
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))
  if (process.env.NODE_ENV === 'production') {
    const frontendDirectory = fileURLToPath(new URL('../../dist/', import.meta.url))
    app.use(express.static(frontendDirectory))
    app.get('/{*path}', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) return next()
      return res.sendFile(path.join(frontendDirectory, 'index.html'), (error) => {
        if (error) next(error)
      })
    })
  }
  app.use(notFound)
  app.use(errorHandler)
  return app
}

import { getGeminiConfig } from '../config/gemini.js'
import { AppError } from '../utils/errors.js'

const REQUEST_TIMEOUT_MS = 30_000

function requireGemini() {
  const config = getGeminiConfig()
  if (!config.configured || !config.client) {
    throw new AppError(503, 'Gemini features are not configured. Set GEMINI_API_KEY on the server.')
  }
  return config
}

async function generateText({ contents, systemInstruction, maxOutputTokens = 900, responseMimeType }) {
  const { client, model } = requireGemini()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens,
        temperature: 0.3,
        ...(responseMimeType ? { responseMimeType } : {}),
        abortSignal: controller.signal,
      },
    })
    if (typeof response?.text !== 'string' || !response.text.trim()) {
      throw new AppError(502, 'Gemini returned an empty response. Please try again.')
    }
    return response.text.trim()
  } catch (error) {
    if (error instanceof AppError) throw error
    if (error.name === 'AbortError') throw new AppError(504, 'Gemini took too long to respond. Please try again.')
    const status = Number(error.status || error.code)
    if (status === 429) throw new AppError(503, 'Gemini is busy. Please try again shortly.')
    if (status === 401 || status === 403) throw new AppError(503, 'Gemini rejected the configured server credentials.')
    console.error(`Gemini Learning Hub request failed${Number.isFinite(status) ? ` (${status})` : ''}.`)
    throw new AppError(502, 'Gemini could not complete this request. Please try again.')
  } finally {
    clearTimeout(timeout)
  }
}

function stripJsonFence(text) {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
}

export function parseLearningPlan(responseText, assignments, weekStarting) {
  let parsed
  try {
    parsed = JSON.parse(stripJsonFence(responseText))
  } catch {
    throw new AppError(502, 'Gemini returned an invalid study plan. Please try again.')
  }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.schedule)
    || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
    throw new AppError(502, 'Gemini returned an incomplete study plan. Please try again.')
  }
  const allowedAssignments = new Set(assignments.map((item) => String(item.id)))
  const assignmentsById = new Map(assignments.map((item) => [String(item.id), item]))
  const start = new Date(`${weekStarting}T00:00:00.000Z`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  const items = (Array.isArray(parsed.schedule) ? parsed.schedule : [])
    .filter((item) => {
      if (!item || typeof item !== 'object') return false
      const date = new Date(`${item.date}T00:00:00.000Z`)
      const assignment = assignmentsById.get(String(item.assignmentId))
      const dueDate = assignment?.dueDate ? new Date(assignment.dueDate) : null
      const hasDueDate = dueDate && !Number.isNaN(dueDate.getTime())
      const isPastDeadline = hasDueDate && dueDate < start
      return allowedAssignments.has(String(item.assignmentId))
      && Number.isInteger(item.minutes)
      && item.minutes >= 15
      && item.minutes <= 120
      && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
      && !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === item.date
      && date >= start
      && date <= end
      && (isPastDeadline || !hasDueDate || date <= new Date(`${dueDate.toISOString().slice(0, 10)}T00:00:00.000Z`))
      && typeof item.focus === 'string'
      && item.focus.trim()
    })
    .slice(0, 28)
    .map((item) => ({
      assignmentId: String(item.assignmentId),
      date: item.date,
      minutes: item.minutes,
      focus: item.focus.trim().slice(0, 240),
    }))
  if (assignments.length && !items.length) {
    throw new AppError(502, 'Gemini did not return a usable study plan. Please try again.')
  }
  return {
    summary: parsed.summary.trim().slice(0, 1000) || 'A balanced plan for your upcoming assignments.',
    items,
  }
}

export async function generateStudyPlan({ assignments, weekStarting }) {
  const taskReferences = assignments.map((assignment, index) => ({
    ...assignment,
    reference: `task-${index + 1}`,
  }))
  const tasks = taskReferences.map(({ reference, title, subject, dueDate, status }) => ({
    id: reference,
    title,
    subject,
    dueDate: new Date(dueDate).toISOString().slice(0, 10),
    status,
  }))
  const text = await generateText({
    systemInstruction: [
      'You are Acadex Learning Planner, a supportive study-planning assistant for school students.',
      'Create a realistic, balanced weekly plan. Never shame students, diagnose, or invent tasks or deadlines.',
      'Use only the supplied assignment IDs and schedule dates from the requested Monday through Sunday.',
      'A plan is a suggestion, not a judgment. Do not solve or write graded work.',
      'Return only valid JSON with shape {"summary":"...","schedule":[{"assignmentId":"...","date":"YYYY-MM-DD","minutes":25,"focus":"..."}]}.',
      'Use at most 14 sessions, 15-120 minutes each, and keep each focus note brief.',
    ].join(' '),
    contents: JSON.stringify({ weekStarting, assignments: tasks }),
    maxOutputTokens: 1200,
    responseMimeType: 'application/json',
  })
  const plan = parseLearningPlan(text, taskReferences.map((item) => ({ ...item, id: item.reference })), weekStarting)
  const realIdsByReference = new Map(taskReferences.map((item) => [item.reference, String(item.id)]))
  return {
    ...plan,
    items: plan.items.map((item) => ({ ...item, assignmentId: realIdsByReference.get(item.assignmentId) })),
  }
}

export async function generateWeeklyDigest(data) {
  const audience = data.audience === 'parent'
    ? 'Write for a parent, refer to the learner as their child, and suggest supportive conversations rather than pressure.'
    : 'Write directly to the student, using age-appropriate, encouraging language.'
  const digest = await generateText({
    systemInstruction: [
      'You are Acadex, writing a calm, concise weekly academic digest.',
      audience,
      'Use only the provided deadlines, statuses, marks, teacher feedback, and announcements. Do not infer ability or risk.',
      'Use warm, plain language and provide a few concrete next actions. Never invent dates or school policies.',
      'Do not repeat private identifiers. Keep the digest under 180 words.',
    ].join(' '),
    contents: JSON.stringify(data),
    maxOutputTokens: 500,
  })
  return digest.slice(0, 4000)
}

export async function suggestRevisionSteps({ assignment, feedback }) {
  const response = await generateText({
    systemInstruction: [
      'You are Acadex, helping a teacher turn their feedback into actionable revision steps.',
      'The teacher will review and edit your suggestions before sharing them with the student.',
      'Use only the supplied assignment context and teacher-written feedback; do not assess uploaded work.',
      'Never invent a rubric, marks, or claims about a student. Keep each action specific and supportive.',
      'Return 3 to 5 short steps, one per line, without numbering.',
    ].join(' '),
    contents: JSON.stringify({
      assignment: { title: assignment.title, subject: assignment.subject },
      teacherFeedback: feedback,
    }),
    maxOutputTokens: 300,
  })
  const steps = response.split('\n')
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length >= 5)
    .slice(0, 5)
    .map((text) => ({ text: text.slice(0, 500), completed: false }))
  if (!steps.length) throw new AppError(502, 'Gemini did not return usable revision steps. Please try again.')
  return steps
}

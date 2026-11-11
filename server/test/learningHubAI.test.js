import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseLearningPlan } from '../src/services/learningHubAI.js'

test('study plan parsing only keeps assigned tasks in the requested week', () => {
  const assignments = [{ id: 'assignment-one' }]
  const result = parseLearningPlan(JSON.stringify({
    summary: 'A balanced week.',
    schedule: [
      { assignmentId: 'assignment-one', date: '2026-11-09', minutes: 25, focus: 'Outline the response' },
      { assignmentId: 'assignment-one', date: '2026-11-16', minutes: 25, focus: 'Outside the week' },
      { assignmentId: 'unassigned-task', date: '2026-11-10', minutes: 25, focus: 'Invented task' },
      { assignmentId: 'assignment-one', date: '2026-11-10', minutes: 500, focus: 'Too long' },
    ],
  }), assignments, '2026-11-09')

  assert.equal(result.summary, 'A balanced week.')
  assert.deepEqual(result.items, [{
    assignmentId: 'assignment-one',
    date: '2026-11-09',
    minutes: 25,
    focus: 'Outline the response',
  }])
})

test('invalid Gemini study-plan JSON returns an explicit provider error', () => {
  assert.throws(
    () => parseLearningPlan('not json', [], '2026-11-09'),
    { status: 502, message: 'Gemini returned an invalid study plan. Please try again.' },
  )
})

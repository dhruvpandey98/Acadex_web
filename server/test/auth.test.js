import assert from 'node:assert/strict'
import bcrypt from 'bcryptjs'
import { test } from 'node:test'
import { allowRoles } from '../src/middleware/auth.js'
import { isSchoolEmail } from '../src/utils/emailDomains.js'

test('school email matching accepts configured domains but not their subdomains', () => {
  assert.equal(isSchoolEmail('student@school.edu', ' school.edu, @acadex.demo '), true)
  assert.equal(isSchoolEmail('student@Acadex.Demo', 'school.edu,acadex.demo'), true)
  assert.equal(isSchoolEmail('student@other.school.edu', 'school.edu'), false)
  assert.equal(isSchoolEmail('student@school.edu', ''), false)
})

test('password hashes match the original password but not a different password', async () => {
  const hash = await bcrypt.hash('Acadex-Test-2026!', 4)
  assert.equal(await bcrypt.compare('Acadex-Test-2026!', hash), true)
  assert.equal(await bcrypt.compare('Wrong-Password!', hash), false)
})

test('role guard denies students and permits teachers for teacher-only actions', () => {
  const guard = allowRoles('teacher')
  let denied
  let allowed = false

  guard({ user: { role: 'student' } }, {}, (error) => { denied = error })
  guard({ user: { role: 'teacher' } }, {}, (error) => { allowed = !error })

  assert.equal(denied?.status, 403)
  assert.equal(allowed, true)
})

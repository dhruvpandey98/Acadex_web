import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import jwt from 'jsonwebtoken'
import { createApp } from '../src/app.js'

const accessSecret = 'test-access-secret-that-is-at-least-thirty-two-characters'
process.env.JWT_ACCESS_SECRET = accessSecret
const app = await createApp()
const server = createServer(app)
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

test('health endpoint reports the database as unavailable when disconnected', async () => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`)
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { status: 'error', database: 'disconnected' })
})

test('unknown routes return a structured not-found response', async () => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/unknown`)
  assert.equal(response.status, 404)
  assert.match((await response.json()).error.message, /Route not found/)
})

test('school records require authentication', async () => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/students`)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'Authentication is required.')
})

test('dataset insights require authentication', async () => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/dataset/insights`)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'Authentication is required.')
})

test('assignment workflow requires authentication', async () => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/assignment-workflow`)
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'Authentication is required.')
})

test('Learning Hub endpoints require authentication', async () => {
  for (const [path, method] of [
    ['/api/learning-hub', 'GET'],
    ['/api/learning-hub/plan', 'POST'],
    ['/api/learning-hub/parent-digest', 'GET'],
    ['/api/learning-hub/parent-digest', 'POST'],
    ['/api/learning-hub/support-requests', 'GET'],
    ['/api/learning-hub/class-workload', 'GET'],
    ['/api/learning-hub/improvement-steps', 'POST'],
  ]) {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method })
    assert.equal(response.status, 401)
    assert.equal((await response.json()).error.message, 'Authentication is required.')
  }
})

test('login rejects empty and malformed credentials before querying the database', async () => {
  for (const body of [
    { email: '', password: '' },
    { email: 'abc@', password: 'password123' },
  ]) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.message, 'Request validation failed.')
  }
})

test('expired access tokens are rejected before user lookup', async () => {
  const token = jwt.sign({ sub: '000000000000000000000001' }, accessSecret, { expiresIn: -1 })
  const response = await fetch(`http://127.0.0.1:${address.port}/api/auth/me`, {
    headers: { Cookie: `acadex_access=${token}` },
  })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.message, 'Your session is invalid or has expired.')
})

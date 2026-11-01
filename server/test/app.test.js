import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { createApp } from '../src/app.js'

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

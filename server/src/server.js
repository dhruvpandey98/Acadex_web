import 'dotenv/config'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { validateEnvironment } from './config/env.js'
import { connectDatabase } from './config/db.js'
import { createApp } from './app.js'
import { configureSockets } from './sockets/index.js'
import { getClientUrl } from './config/clientUrl.js'

validateEnvironment()
const app = await createApp()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: getClientUrl().split(',').map((url) => url.trim()),
    credentials: true,
  },
})
app.set('io', io)
configureSockets(io)

await connectDatabase()
const port = Number(process.env.PORT || 5000)
server.listen(port, '0.0.0.0', () => console.log(`Acadex API listening on port ${port}.`))

async function shutdown(signal) {
  console.log(`${signal} received; closing Acadex API.`)
  io.close()
  server.close(async () => {
    const mongoose = await import('mongoose')
    await mongoose.default.disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

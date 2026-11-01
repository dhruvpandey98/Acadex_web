export function getClientUrl() {
  return process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'
}

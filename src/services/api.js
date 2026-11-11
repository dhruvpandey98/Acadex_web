const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'
const REQUEST_TIMEOUT_MS = 60_000

let refreshInFlight

async function fetchWithTimeout(url, options) {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (error) {
    const message = timedOut
      ? 'Acadex took too long to respond. Please try again.'
      : 'Could not connect to Acadex. Check your connection and try again.'
    throw new Error(message, { cause: error })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetchWithTimeout(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).finally(() => {
      refreshInFlight = undefined
    })
  }
  return refreshInFlight
}

export async function apiRequest(path, options = {}, canRefresh = true) {
  const headers = new Headers(options.headers || {})
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  const refreshExempt = ['/auth/login', '/auth/register', '/auth/logout', '/auth/forgot-password', '/auth/reset-password', '/auth/refresh']
  if (response.status === 401 && !refreshExempt.includes(path)) {
    if (canRefresh) {
      try {
        const refreshed = await refreshSession()
        if (refreshed.ok) return apiRequest(path, options, false)
      } catch {
        window.dispatchEvent(new Event('acadex:unauthorized'))
        throw new Error('Your session expired and could not be refreshed.')
      }
    }
    window.dispatchEvent(new Event('acadex:unauthorized'))
  }

  if (response.status === 204) return null
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = response.status >= 500
      ? 'Acadex is temporarily unavailable. Please try again in a moment.'
      : payload?.error?.message || `Request failed with status ${response.status}.`
    const error = new Error(message)
    error.status = response.status
    error.details = payload?.error?.details
    throw error
  }
  return payload
}

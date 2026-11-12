import { apiRequest } from './api.js'

export const authService = {
  register: (name, email, password) => apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  }),
  verifyRegistration: (email, code) => apiRequest('/auth/verify-registration', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  }),
  resendRegistrationCode: (email) => apiRequest('/auth/resend-registration-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  googleRegister: (credential) => apiRequest('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  }),
  login: (email, password) => apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  logout: () => apiRequest('/auth/logout', { method: 'POST' }),
  currentUser: () => apiRequest('/auth/me'),
  changePassword: (currentPassword, password) => apiRequest('/auth/change-password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, password }),
  }),
  forgotPassword: (email) => apiRequest('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  }),
  resetPassword: (email, token, password) => apiRequest('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, token, password }),
  }),
}

import { apiRequest } from './api.js'

const resourceNames = [
  'students', 'teachers', 'classes', 'subjects', 'attendance', 'assignments',
  'submissions', 'grades', 'announcements', 'notifications', 'timetable', 'fees',
]

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

function displayClass(value) {
  if (!value) return ''
  const name = value.name || ''
  const grade = name.replace(/^grade\s*/i, '')
  return value.section ? `${grade}-${value.section}` : name
}

function displayDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : ''
}

function displayTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function mapStudent(record, attendanceRecords, gradeRecords) {
  const attendance = attendanceRecords.filter((item) => String(item.studentId?._id || item.studentId) === String(record._id))
  const present = attendance.filter((item) => item.status === 'present' || item.status === 'late').length
  const studentGrades = gradeRecords.filter((item) => String(item.studentId?._id || item.studentId) === String(record._id))
  return {
    ...record,
    id: record._id,
    grade: record.classId?.name || 'Unassigned',
    className: displayClass(record.classId),
    attendance: attendance.length ? Math.round(present * 100 / attendance.length) : '—',
    score: studentGrades.length ? Math.round(studentGrades.reduce((sum, item) => sum + item.percentage, 0) / studentGrades.length) : '—',
    status: record.status === 'active' ? 'Active' : record.status,
    color: 'violet',
  }
}

function mapTeacher(record) {
  return {
    ...record,
    id: record._id,
    subject: (record.subjects || []).map((subject) => subject.name).filter(Boolean).join(', ') || record.department || '—',
    classes: (record.assignedClasses || []).map(displayClass).filter(Boolean).join(', ') || '—',
    status: record.status === 'active' ? 'Active' : record.status === 'on_leave' ? 'On leave' : record.status,
    color: 'blue',
  }
}

function mapAssignment(record, submissions) {
  const submitted = submissions.filter((submission) => (submission.assignmentId?._id || submission.assignmentId) === record._id).length
  const total = record.classId?.students?.length || 0
  return {
    ...record,
    id: record._id,
    subject: record.subjectId?.name || '—',
    className: displayClass(record.classId),
    due: displayDate(record.dueDate),
    submitted,
    total,
    status: record.status === 'published' ? (submitted ? 'In progress' : 'Not started') : record.status,
  }
}

function mapSubmission(record) {
  const totalMarks = record.assignmentId?.totalMarks || 0
  return {
    ...record,
    id: record._id,
    assignmentId: record.assignmentId?._id || record.assignmentId,
    totalMarks,
    student: record.studentId?.name || 'Student',
    submittedAt: displayTime(record.submittedAt),
    note: record.submissionText,
    status: record.status === 'reviewed' ? 'Reviewed' : record.status === 'returned' ? 'Returned' : 'Needs review',
    grade: record.marksObtained == null || !totalMarks ? '' : String(Math.round(record.marksObtained * 100 / totalMarks)),
  }
}

function mapAnnouncement(record) {
  return {
    ...record,
    id: record._id,
    name: record.createdBy?.name || 'School announcement',
    text: record.content,
    time: displayTime(record.publishedAt || record.createdAt),
    color: 'blue',
  }
}

function mapNotification(record) {
  return {
    ...record,
    id: record._id,
    detail: record.message,
    time: displayTime(record.createdAt),
    unread: !record.isRead,
  }
}

export async function fetchPortalData(user) {
  const role = user.role.toLowerCase()
  const requests = resourceNames.filter((name) => name !== 'fees' || role !== 'teacher')
    .map(async (name) => {
      const response = await apiRequest(`/${name}?limit=100`)
      return [name, response.data]
    })
  if (role === 'admin' || role === 'parent') {
    requests.push(apiRequest('/parents?limit=100').then((response) => ['parents', response.data]))
  }
  requests.push(apiRequest(`/dashboard/${role}`).then((response) => ['dashboard', response.data]))
  const entries = await Promise.all(requests)
  const records = Object.fromEntries(entries)
  const submissions = records.submissions.map(mapSubmission)
  const assignments = records.assignments.map((record) => mapAssignment(record, records.submissions))
  const attendance = records.attendance.reduce((byDay, record) => {
    const date = displayDate(record.date)
    if (!byDay[date]) byDay[date] = {}
    byDay[date][record.studentId?._id || record.studentId] = record.status[0].toUpperCase() + record.status.slice(1)
    return byDay
  }, {})

  return {
    students: records.students.map((record) => mapStudent(record, records.attendance, records.grades)),
    teachers: records.teachers.map(mapTeacher),
    assignments,
    submissions,
    announcements: records.announcements.map(mapAnnouncement),
    notifications: records.notifications.map(mapNotification),
    attendance,
    attendanceRecords: records.attendance,
    classes: records.classes,
    subjects: records.subjects,
    grades: records.grades,
    fees: records.fees || [],
    timetable: records.timetable,
    parents: records.parents || [],
    dashboard: records.dashboard,
  }
}

export function recordPayload(kind, record, { isNew, role }) {
  if (kind === 'students') {
    return {
      name: record.name,
      email: record.email,
      ...(isNew ? { password: record.password, admissionNumber: record.admissionNumber } : {}),
      classId: record.classId || null,
      section: record.section || '',
      ...(isNew ? { status: 'active' } : {}),
    }
  }
  if (kind === 'teachers') {
    return {
      name: record.name,
      email: record.email,
      ...(isNew ? { password: record.password, employeeId: record.employeeId } : {}),
      department: record.department || '',
      ...(role === 'Admin' ? { assignedClasses: record.assignedClasses || [], subjects: record.subjects || [] } : {}),
      ...(isNew ? { status: 'active' } : {}),
    }
  }
  if (kind === 'assignments') {
    return {
      title: record.title,
      subjectId: record.subjectId,
      classId: record.classId,
      ...(role === 'Admin' && record.teacherId ? { teacherId: record.teacherId } : {}),
      dueDate: record.dueDate || record.due,
      totalMarks: Number(record.totalMarks || 100),
      description: record.description || '',
      status: 'published',
    }
  }
  return record
}

export const portalApi = {
  learningHub: () => apiRequest('/learning-hub'),
  generateWeeklyPlan: () => apiRequest('/learning-hub/plan', { method: 'POST' }),
  generateWeeklyDigest: () => apiRequest('/learning-hub/digest', { method: 'POST' }),
  parentWeeklyDigest: (studentId = '') => {
    const query = studentId ? `?studentId=${encodeURIComponent(studentId)}` : ''
    return apiRequest(`/learning-hub/parent-digest${query}`)
  },
  generateParentWeeklyDigest: (studentId) => apiRequest('/learning-hub/parent-digest', {
    method: 'POST',
    body: JSON.stringify({ studentId }),
  }),
  savePortfolioEntry: (body) => apiRequest('/learning-hub/portfolio', { method: 'POST', body: JSON.stringify(body) }),
  removePortfolioEntry: (id) => apiRequest(`/learning-hub/portfolio/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  createSupportRequest: (body) => apiRequest('/learning-hub/support-requests', { method: 'POST', body: JSON.stringify(body) }),
  supportRequests: () => apiRequest('/learning-hub/support-requests'),
  classWorkload: () => apiRequest('/learning-hub/class-workload'),
  respondToSupportRequest: (id, body) => apiRequest(`/learning-hub/support-requests/${encodeURIComponent(id)}/respond`, { method: 'PUT', body: JSON.stringify(body) }),
  suggestAssignmentNextSteps: (body) => apiRequest('/learning-hub/improvement-steps', { method: 'POST', body: JSON.stringify(body) }),
  updateRevisionStep: (submissionId, stepIndex, completed) => apiRequest(`/learning-hub/submissions/${encodeURIComponent(submissionId)}/next-steps/${stepIndex}`, { method: 'PATCH', body: JSON.stringify({ completed }) }),
  assignmentWorkspace: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value))
    const query = params.toString()
    return apiRequest(`/assignment-workflow${query ? `?${query}` : ''}`)
  },
  createAssignment: (body) => apiRequest('/assignment-workflow', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  submitAssignmentFiles: (assignmentId, body) => apiRequest(`/assignment-workflow/${encodeURIComponent(assignmentId)}/submissions`, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  evaluateAssignmentSubmission: (submissionId, body) => apiRequest(`/assignment-workflow/submissions/${encodeURIComponent(submissionId)}/review`, {
    method: 'PUT',
    body: JSON.stringify(body),
  }),
  uploadAssignmentFile: async (file, onProgress = () => {}) => {
    async function upload() {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('POST', `${API_BASE_URL}/uploads`)
        request.withCredentials = true
        request.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total))
        })
        request.addEventListener('load', () => {
          let payload
          try {
            payload = request.responseText ? JSON.parse(request.responseText) : null
          } catch {
            reject(new Error('Acadex returned an invalid upload response.'))
            return
          }
          if (request.status >= 200 && request.status < 300) {
            resolve(payload.data)
            return
          }
          if (request.status >= 500) {
            reject(new Error('Acadex is temporarily unavailable. Please try again in a moment.'))
            return
          }
          reject(new Error(payload?.error?.message || `Upload failed with status ${request.status}.`))
        })
        request.addEventListener('error', () => reject(new Error('Could not connect to Acadex. Check your connection and try again.')))
        request.addEventListener('timeout', () => reject(new Error('The upload took too long. Please try again.')))
        request.timeout = 60_000
        const formData = new FormData()
        formData.append('file', file)
        request.send(formData)
      })
    }

    try {
      return await upload()
    } catch (error) {
      if (!/status 401/.test(error.message)) throw error
      try {
        await apiRequest('/auth/refresh', { method: 'POST' })
        return await upload()
      } catch (refreshError) {
        window.dispatchEvent(new Event('acadex:unauthorized'))
        throw refreshError
      }
    }
  },
  datasetInsights: ({ page = 1, limit = 10, search = '' } = {}) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (search) params.set('search', search)
    return apiRequest(`/dataset/insights?${params}`)
  },
  create: (kind, body) => apiRequest(`/${kind}`, { method: 'POST', body: JSON.stringify(body) }),
  update: (kind, id, body) => apiRequest(`/${kind}/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (kind, id) => apiRequest(`/${kind}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  submitAssignment: (body) => apiRequest('/submissions', { method: 'POST', body: JSON.stringify(body) }),
  reviewSubmission: (id, body) => apiRequest(`/submissions/${encodeURIComponent(id)}/review`, { method: 'PUT', body: JSON.stringify(body) }),
  markNotificationRead: (id) => apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  markNotificationsRead: () => apiRequest('/notifications/read-all', { method: 'PATCH' }),
  conversations: () => apiRequest('/conversations'),
  startConversation: (participantId) => apiRequest('/conversations', { method: 'POST', body: JSON.stringify({ participantId }) }),
  conversationMessages: (id) => apiRequest(`/messages/${encodeURIComponent(id)}`),
  sendMessage: (body) => apiRequest('/messages', { method: 'POST', body: JSON.stringify(body) }),
  markMessageRead: (id) => apiRequest(`/messages/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
}

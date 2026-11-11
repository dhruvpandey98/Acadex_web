import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppContext } from './appContext.js'
import { authService } from '../services/authService.js'
import { fetchPortalData } from '../services/portalService.js'

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [parents, setParents] = useState([])
  const [assignments, setAssignments] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [notifications, setNotifications] = useState([])
  const [attendance, setAttendance] = useState({})
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [grades, setGrades] = useState([])
  const [fees, setFees] = useState([])
  const [timetable, setTimetable] = useState([])
  const [dashboard, setDashboard] = useState(null)
  const [portalDataLoading, setPortalDataLoading] = useState(false)
  const [portalDataError, setPortalDataError] = useState('')

  useEffect(() => {
    let active = true
    const restoreSession = async () => {
      try {
        const result = await authService.currentUser()
        if (active) setUser(toDisplayUser(result.user))
      } catch (error) {
        if (active) {
          setUser(null)
          if (error.status !== 401) setAuthError(error.message)
        }
      } finally {
        if (active) setAuthLoading(false)
      }
    }
    const clearSession = () => setUser(null)
    window.addEventListener('acadex:unauthorized', clearSession)
    restoreSession()
    return () => {
      active = false
      window.removeEventListener('acadex:unauthorized', clearSession)
    }
  }, [])

  const refreshPortalData = useCallback(async () => {
    if (!user) return false
    setPortalDataLoading(true)
    setPortalDataError('')
    try {
      const data = await fetchPortalData(user)
      setStudents(data.students)
      setTeachers(data.teachers)
      setParents(data.parents)
      setAssignments(data.assignments)
      setSubmissions(data.submissions)
      setAnnouncements(data.announcements)
      setNotifications(data.notifications)
      setAttendance(data.attendance)
      setAttendanceRecords(data.attendanceRecords)
      setClasses(data.classes)
      setSubjects(data.subjects)
      setGrades(data.grades)
      setFees(data.fees)
      setTimetable(data.timetable)
      setDashboard(data.dashboard)
      return true
    } catch (error) {
      setPortalDataError(error.message)
      return false
    } finally {
      setPortalDataLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) {
      refreshPortalData()
      return
    }
    setStudents([])
    setTeachers([])
    setParents([])
    setAssignments([])
    setSubmissions([])
    setAnnouncements([])
    setNotifications([])
    setAttendance({})
    setAttendanceRecords([])
    setClasses([])
    setSubjects([])
    setGrades([])
    setFees([])
    setTimetable([])
    setDashboard(null)
    setPortalDataError('')
  }, [user, refreshPortalData])

  const value = useMemo(() => ({
    user,
    authLoading,
    authError,
    login: async (email, password) => {
      const result = await authService.login(email, password)
      const displayUser = toDisplayUser(result.user)
      setUser(displayUser)
      setAuthError('')
      return displayUser
    },
    register: async (name, email, password) => {
      const result = await authService.register(name, email, password)
      const displayUser = toDisplayUser(result.user)
      setUser(displayUser)
      setAuthError('')
      return displayUser
    },
    logout: async () => {
      try {
        await authService.logout()
        setAuthError('')
      } catch (error) {
        setAuthError(`Your browser session ended, but the server logout request failed: ${error.message}`)
        throw error
      } finally {
        setUser(null)
      }
    },
    students,
    setStudents,
    teachers,
    setTeachers,
    parents,
    setParents,
    assignments,
    setAssignments,
    submissions,
    setSubmissions,
    announcements,
    setAnnouncements,
    notifications,
    setNotifications,
    attendance,
    setAttendance,
    attendanceRecords,
    classes,
    subjects,
    grades,
    fees,
    timetable,
    dashboard,
    portalDataLoading,
    portalDataError,
    refreshPortalData,
  }), [user, authLoading, authError, students, teachers, parents, assignments, submissions, announcements, notifications, attendance, attendanceRecords, classes, subjects, grades, fees, timetable, dashboard, portalDataLoading, portalDataError, refreshPortalData])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function toDisplayUser(user) {
  return { ...user, role: user.role[0].toUpperCase() + user.role.slice(1) }
}

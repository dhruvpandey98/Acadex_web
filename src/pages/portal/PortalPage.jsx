import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, Clock3, FileText, GraduationCap, MoreHorizontal, Plus, Power, Search, Send, Sparkles, UserPlus, Users, X } from 'lucide-react'
import { Avatar, Button, Card, Modal, StatusBadge } from '../../components/common/UI.jsx'
import { useApp } from '../../hooks/useApp.js'
import { assistantService } from '../../services/assistantService.js'
import { portalApi, recordPayload } from '../../services/portalService.js'
import { authService } from '../../services/authService.js'
import AssignmentsPage from '../../Pages/portal/AssignmentsPage.jsx'
import LearningHubPage from '../../Pages/portal/LearningHubPage.jsx'

const colors = ['#5549e6', '#18a879', '#f3a650', '#e47b8c']
const fieldsFor = {
  students: [['name', 'Student name'], ['email', 'Email address'], ['password', 'Temporary password'], ['admissionNumber', 'Admission number'], ['rollNumber', 'Roll number'], ['classId', 'Class'], ['parentIds', 'Linked parent accounts'], ['phone', 'Phone']],
  teachers: [['name', 'Teacher name'], ['email', 'Email address'], ['password', 'Temporary password'], ['employeeId', 'Employee ID'], ['department', 'Department'], ['assignedClasses', 'Teaching classes'], ['subjects', 'Subjects'], ['qualification', 'Qualification'], ['phone', 'Phone'], ['status', 'Staff status']],
  parents: [['name', 'Parent / guardian name'], ['email', 'Email address'], ['password', 'Temporary password'], ['children', 'Linked students'], ['phone', 'Phone'], ['occupation', 'Occupation'], ['address', 'Address']],
  classes: [['name', 'Grade / class name'], ['section', 'Section'], ['academicYear', 'Academic year'], ['classTeacherId', 'Class teacher'], ['students', 'Enrolled students']],
  subjects: [['name', 'Subject name'], ['subjectCode', 'Subject code'], ['classId', 'Class'], ['teacherId', 'Subject teacher'], ['description', 'Description']],
  assignments: [['title', 'Assignment title'], ['subjectId', 'Subject'], ['classId', 'Class'], ['teacherId', 'Teacher'], ['dueDate', 'Due date'], ['totalMarks', 'Total marks']],
}
function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><p className="page-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action}</div>
}

function recordForForm(item) {
  const referenceId = (value) => value?._id || value || ''
  return {
    ...item,
    status: item.profileStatus || item.status,
    classId: referenceId(item.classId),
    subjectId: referenceId(item.subjectId),
    teacherId: referenceId(item.teacherId),
    classTeacherId: referenceId(item.classTeacherId),
    assignedClasses: (item.assignedClasses || []).map(referenceId),
    subjects: (item.subjects || []).map(referenceId),
    students: (item.students || []).map(referenceId),
    children: (item.children || []).map(referenceId),
    parentIds: (item.parentIds || []).map(referenceId),
  }
}

function optionLabel(item) {
  const grade = (item.name || '').replace(/^grade\s*/i, '')
  return item.section ? `${grade}-${item.section}` : item.name
}

function MetricCard({ label, value, change, icon: Icon, tone = 'purple', detail }) {
  return <Card className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon metric-${tone}`}><Icon size={17} /></span></div><div className="metric-value">{value}</div><div className="metric-foot"><span className="metric-change"><ArrowUpRight size={13} /> {change}</span><span>{detail}</span></div></Card>
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return <div className="chart-tooltip"><strong>{label}</strong>{payload.map((entry) => <span key={entry.name}><i style={{ background: entry.color }} />{entry.name}: {entry.value}%</span>)}</div>
}

function AdminSetupPulse({ students, teachers, classes, parents }) {
  const checks = [
    { label: 'Students placed in a class', count: students.filter((student) => !student.classId).length, to: '/portal/students', action: 'Review students' },
    { label: 'Students linked to a family', count: students.filter((student) => !student.parentIds?.length).length, to: '/portal/parents', action: 'Link guardians' },
    { label: 'Classes with a class teacher', count: classes.filter((schoolClass) => !schoolClass.classTeacherId).length, to: '/portal/classes', action: 'Assign teachers' },
    { label: 'Teachers with no class assignment', count: teachers.filter((teacher) => !teacher.assignedClasses?.length).length, to: '/portal/teachers', action: 'Set teaching load' },
    { label: 'Parent accounts linked to a student', count: parents.filter((parent) => !parent.children?.length).length, to: '/portal/parents', action: 'Connect families' },
  ]
  const needsAttention = checks.filter((check) => check.count > 0).length
  const hasSchoolRecords = students.length + teachers.length + classes.length + parents.length > 0
  return <Card className="admin-setup-pulse">
    <div className="admin-setup-heading"><div><p className="page-eyebrow">A MORE CONNECTED SCHOOL</p><h2>Roster readiness</h2><p>Catch setup gaps early: every learner connected to a class, teacher, and family.</p></div><StatusBadge tone={needsAttention ? 'amber' : hasSchoolRecords ? 'green' : 'blue'}>{needsAttention ? `${needsAttention} setup ${needsAttention === 1 ? 'step' : 'steps'}` : hasSchoolRecords ? 'All set' : 'Start here'}</StatusBadge></div>
    <div className="admin-setup-checks">{checks.map((check) => <Link className="admin-setup-check" to={check.to} key={check.label}><span className={check.count ? 'admin-setup-count is-pending' : 'admin-setup-count'}>{check.count}</span><span><strong>{check.label}</strong><small>{check.count ? check.action : hasSchoolRecords ? 'Coverage looks good' : 'No records yet'}</small></span><ArrowRight size={15} /></Link>)}</div>
    <div className="admin-setup-actions"><span>Set up your school community</span><Link to="/portal/classes"><BookOpen size={14} /> Classes</Link><Link to="/portal/teachers"><GraduationCap size={14} /> Teachers</Link><Link to="/portal/students"><Users size={14} /> Students</Link><Link to="/portal/parents"><Users size={14} /> Families</Link></div>
  </Card>
}

function Dashboard({ role, students, teachers = [], assignments, dashboard, user, classes = [], parents = [] }) {
  const subtitle = { Admin: 'Here’s what’s happening across your school today.', Teacher: 'Here’s your classroom at a glance.', Student: 'A new day is a new chance to do something great.', Parent: 'Here’s the latest from your child’s school day.' }
  const firstName = user.name.split(' ')[0]
  const isLearner = role === 'Student' || role === 'Parent'
  const parentGrades = (dashboard.grades || []).reduce((groups, item) => {
    const subject = item.subjectId?.name || 'Other'
    const group = groups.get(subject) || { total: 0, count: 0 }
    group.total += item.percentage
    group.count += 1
    groups.set(subject, group)
    return groups
  }, new Map())
  const performance = role === 'Student'
    ? (dashboard.subjectPerformance || []).map((item) => ({ label: item.subject, score: item.average }))
    : role === 'Parent'
      ? [...parentGrades].map(([label, item]) => ({ label, score: item.total / item.count }))
      : role === 'Teacher'
        ? (dashboard.performance || []).map((item, index) => ({ label: `Class ${index + 1}`, score: item.average }))
        : []
  const attendanceTrend = (dashboard.attendanceTrend || []).map((item) => ({
    label: new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
    present: item.present,
    absent: item.absent,
  }))
  const chartData = isLearner ? performance : attendanceTrend
  const attendance = role === 'Parent'
    ? { total: dashboard.attendance?.length || 0, percentage: dashboard.attendance?.length ? dashboard.attendance.reduce((sum, item) => sum + item.percentage, 0) / dashboard.attendance.length : 0 }
    : dashboard.attendance
  const recordedCount = attendance.total || 0
  const presentCount = Math.round(recordedCount * attendance.percentage / 100)
  const attendanceBreakdown = [{ name: 'Present', value: presentCount }, { name: 'Not present', value: Math.max(0, recordedCount - presentCount) }]
  const metrics = role === 'Admin'
    ? [['Total students', dashboard.students, 'Live count', Users, 'in your school'], ['Teaching staff', dashboard.teachers, 'Live count', GraduationCap, 'active profiles'], ['Classes', dashboard.classes, 'Live count', BookOpen, 'school-wide'], ['Family accounts', dashboard.parents ?? parents.length, 'Linked access', Users, 'parents & guardians']]
    : role === 'Teacher'
      ? [['My students', dashboard.students, 'Live count', Users, `across ${dashboard.classes} classes`], ['Attendance today', `${dashboard.attendance.percentage}%`, `${dashboard.attendance.total} records`, Check, 'for your classes'], ['To review', dashboard.pendingSubmissions, 'Pending', FileText, 'submissions'], ['Assignments', dashboard.assignments, 'Published', BookOpen, 'for your classes']]
      : role === 'Student'
        ? [['Attendance', recordedCount ? `${attendance.percentage}%` : '—', `${recordedCount} records`, Check, 'your attendance'], ['Academic score', dashboard.grades[0] ? `${dashboard.grades[0].percentage}%` : '—', 'Latest grade', GraduationCap, 'latest result'], ['To complete', dashboard.pendingAssignments, 'Open', FileText, 'assignments'], ['Study buddy', 'Ready', 'AI tutor', Sparkles, 'ask a question']]
        : [['Attendance', recordedCount ? `${attendance.percentage.toFixed(1)}%` : '—', `${recordedCount} children`, Check, 'recorded attendance'], ['Latest result', dashboard.grades?.[0] ? `${dashboard.grades[0].percentage}%` : '—', 'Latest grade', GraduationCap, 'student progress'], ['Assignments', dashboard.assignments?.length ?? 0, 'Upcoming', FileText, 'to complete'], ['Children', dashboard.children?.length ?? 0, 'Linked profiles', Users, 'in your account']]
  return <>
    <PageHeading eyebrow="YOUR SCHOOL, AT A GLANCE" title={role === 'Student' ? `Hey, ${firstName}` : `Welcome, ${firstName}`} description={subtitle[role]} action={<Button variant="outline" onClick={() => window.print()}><ArrowDownToLine size={15} /> Export overview</Button>} />
    <div className="metric-grid">{metrics.map(([label, value, change, Icon, detail], i) => <MetricCard key={label} label={label} value={value} change={change} icon={Icon} tone={['purple', 'green', 'amber', 'blue'][i]} detail={detail} />)}</div>
    {role === 'Admin' && <AdminSetupPulse students={students} teachers={teachers} classes={classes} parents={parents} />}
    <div className="dashboard-main-grid">
      <Card className="chart-card"><div className="card-heading"><div><h2>{isLearner ? 'Learning progress' : 'Attendance trend'}</h2><p>{isLearner ? 'Average grade by subject' : 'Present and absent records over time'}</p></div></div>
        <div className="dashboard-chart">{chartData.length === 0 ? <div className="assistant-empty"><strong>No trend data is available yet.</strong></div> : <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}><defs><linearGradient id="purpleArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5a50e9" stopOpacity={0.17} /><stop offset="100%" stopColor="#5a50e9" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#eef0f5" strokeDasharray="4 5" vertical={false} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9098a8', fontSize: 11 }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#9098a8', fontSize: 11 }} domain={[0, 100]} /><Tooltip content={<ChartTooltip />} />{isLearner ? <Area type="monotone" dataKey="score" name="Average score" stroke="#5a50e9" strokeWidth={2.5} fill="url(#purpleArea)" /> : <><Area type="monotone" dataKey="present" name="Present" stroke="#5a50e9" strokeWidth={2.5} fill="url(#purpleArea)" /><Area type="monotone" dataKey="absent" name="Absent" stroke="#1cb58b" strokeWidth={2} fill="transparent" /></>}</AreaChart></ResponsiveContainer>}</div>
      </Card>
      <Card className="side-widget"><div className="card-heading"><div><h2>Attendance summary</h2><p>{recordedCount} recorded roll calls</p></div><MoreHorizontal size={18} /></div><div className="donut-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={attendanceBreakdown} innerRadius={51} outerRadius={67} paddingAngle={4} dataKey="value" stroke="none">{colors.slice(0, 2).map((color) => <Cell key={color} fill={color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{recordedCount ? `${attendance.percentage.toFixed(1)}%` : '—'}</strong><small>present</small></div></div><div className="donut-legend"><span><i className="legend-purple" /> Present <strong>{presentCount}</strong></span><span><i className="legend-mint" /> Not present <strong>{Math.max(0, recordedCount - presentCount)}</strong></span></div></Card>
    </div>
    <div className="dashboard-lower-grid"><Card className="activity-card"><div className="card-heading"><div><h2>{isLearner ? 'Your assignments' : 'Recent assignments'}</h2><p>Current work for your school community</p></div><a href="/portal/assignments" className="card-link">View all <ArrowRight size={14} /></a></div><div className="activity-list">{assignments.slice(0, 3).map((item, index) => <div className="activity-row" key={item.id}><span className={`activity-icon activity-icon-${index}`}><FileText size={15} /></span><span className="activity-copy"><strong>{item.title}</strong><small>{item.subject} · {item.className}</small></span><span className="activity-time">{item.due}</span></div>)}{assignments.length === 0 && <p className="empty-row">No assignments are available.</p>}</div></Card><Card className="events-card"><div className="card-heading"><div><h2>Coming up</h2><p>Upcoming assignment deadlines</p></div><MoreHorizontal size={18} /></div>{assignments.filter((item) => item.due >= new Date().toISOString().slice(0, 10)).slice(0, 2).map((item, index) => <div className="event-item" key={item.id}><div className={`event-date ${index ? 'event-date-peach' : ''}`}><strong>{new Date(`${item.due}T12:00:00`).getDate()}</strong><small>{new Date(`${item.due}T12:00:00`).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</small></div><div><strong>{item.title}</strong><small>{item.subject} · Due {new Date(`${item.due}T12:00:00`).toLocaleDateString()}</small></div></div>)}{assignments.length === 0 && <p className="empty-row">No upcoming deadlines.</p>}</Card></div>
    <div className="dashboard-footer-note"><Sparkles size={14} /> Small things are happening every day. You're right where you need to be.</div>
    <span className="sr-only">{students.length} students and {assignments.length} assignments in your workspace</span>
  </>
}

function RecordTable({ kind, records, onEdit, onDelete, onView, onToggleActive, query, onQuery, classFilter, onClassFilterChange, statusFilter, onStatusFilterChange, classOptions, statusOptions, canEdit }) {
  const headers = kind === 'students'
    ? ['STUDENT', 'GRADE / CLASS', 'ATTENDANCE', 'ACADEMIC SCORE', 'STATUS', '']
    : kind === 'teachers'
      ? ['TEACHER', 'SUBJECT', 'ASSIGNED CLASSES', 'STATUS', '']
      : kind === 'parents'
        ? ['PARENT / GUARDIAN', 'LINKED STUDENTS', 'PHONE', 'ACCOUNT', '']
        : kind === 'classes'
          ? ['CLASS', 'ACADEMIC YEAR', 'CLASS TEACHER', 'ENROLLMENT', '']
          : kind === 'subjects'
            ? ['SUBJECT', 'CODE', 'CLASS', 'TEACHER', '']
            : ['ASSIGNMENT', 'SUBJECT / CLASS', 'DUE DATE', 'SUBMISSIONS', 'STATUS', '']

  return (
    <Card className="table-card">
      <div className="table-toolbar">
        <label className="table-search"><Search size={16} /><input placeholder={`Search ${kind}...`} value={query} onChange={(event) => onQuery(event.target.value)} /></label>
        <div className="table-filters">
          {classOptions.length > 0 && <label className="select-button"><select className="filter-select" aria-label="Filter by class or subject" value={classFilter} onChange={(event) => onClassFilterChange(event.target.value)}><option value="All">All {kind === 'teachers' ? 'subjects' : 'classes'}</option>{classOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={14} /></label>}
          <label className="select-button"><select className="filter-select" aria-label="Filter by status" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}><option value="All">All statuses</option>{statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown size={14} /></label>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
          <tbody>
            {records.length === 0 ? <tr><td className="empty-row" colSpan={headers.length}>No records found. Try adjusting your search.</td></tr> : records.map((item) => (
              <tr key={item.id}>
                <td><button className="person-cell" onClick={() => onView(item)}><Avatar name={item.name || item.title} color={item.color || 'violet'} size="sm" /><span><strong>{kind === 'classes' ? item.className : item.name || item.title}</strong><small>{kind === 'classes' ? `${item.studentCount} learners` : item.email || (kind === 'students' ? item.className : kind === 'parents' ? item.occupation || 'Family account' : kind === 'subjects' ? item.description || 'Class subject' : `${item.className} - ${item.total} students`)}</small></span></button></td>
                {kind === 'students' && <><td><strong className="table-primary">{item.grade}</strong><small className="table-secondary">{item.className}</small></td><td><span className="table-number">{item.attendance === '—' ? '—' : `${item.attendance}%`}</span></td><td><span className="table-number">{item.score === '—' ? '—' : `${item.score}%`}</span></td><td><StatusBadge tone={item.status === 'Active' ? 'green' : 'amber'}>{item.status}</StatusBadge></td></>}
                {kind === 'teachers' && <><td><span className="table-primary">{item.subject}</span></td><td><span className="table-primary">{item.classes}</span></td><td><StatusBadge tone={item.status === 'Active' ? 'green' : 'amber'}>{item.status}</StatusBadge></td></>}
                {kind === 'parents' && <><td><span className="table-primary">{item.childrenCount} linked {item.childrenCount === 1 ? 'student' : 'students'}</span><small className="table-secondary">{item.childrenNames || 'No student linked yet'}</small></td><td>{item.phone || '—'}</td><td><StatusBadge tone={item.accountActive ? 'green' : 'amber'}>{item.accountActive ? 'Access active' : 'Access paused'}</StatusBadge></td></>}
                {kind === 'classes' && <><td>{item.academicYear}</td><td>{item.teacherName}</td><td><span className="table-number">{item.studentCount} students</span></td></>}
                {kind === 'subjects' && <><td>{item.subjectCode}</td><td>{item.className}</td><td>{item.teacherName}</td></>}
                {kind === 'assignments' && <><td><span className="table-primary">{item.subject}</span><small className="table-secondary">{item.className}</small></td><td><span className="table-primary">{new Date(`${item.due}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></td><td><span className="table-number">{item.submitted} / {item.total}</span></td><td><StatusBadge tone={item.status === 'Reviewing' ? 'blue' : item.status === 'Not started' ? 'amber' : 'green'}>{item.status}</StatusBadge></td></>}
                <td><div className="row-actions"><button className="icon-button" aria-label="View details" onClick={() => onView(item)}><BookOpen size={15} /></button><button className="icon-button" aria-label={canEdit ? 'Edit' : 'View profile'} onClick={() => onEdit(item)}><MoreHorizontal size={16} /></button>{canEdit && ['students', 'teachers', 'parents'].includes(kind) && <button className="icon-button" aria-label={`${item.accountActive ? 'Pause' : 'Restore'} ${kind === 'students' ? 'student' : kind === 'teachers' ? 'teacher' : 'parent'} access`} onClick={() => onToggleActive(item)}><Power size={15} /></button>}{canEdit && <button className="icon-button delete-icon" aria-label="Delete" onClick={() => onDelete(item)}><X size={15} /></button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-bottom"><span>Showing <strong>{records.length}</strong> of <strong>{records.length}</strong> results</span><div><button disabled>Previous</button><button className="pagination-current">1</button><button>Next</button></div></div>
    </Card>
  )
}

function AdminRecordFields({ section, fields, record, setRecord, selectedRecord, classes, teachers, subjects, students, parents }) {
  const multiSelectFields = ['assignedClasses', 'subjects', 'students', 'parentIds', 'children']
  const requiredFields = new Set([
    'name', 'email', 'password', 'admissionNumber', 'employeeId', 'section', 'academicYear', 'subjectCode',
  ])
  const optionsFor = (field) => {
    if (['classId', 'assignedClasses'].includes(field)) return classes.map((item) => [item._id || item.id, optionLabel(item)])
    if (field === 'classTeacherId') return teachers.map((item) => [item._id || item.id, item.name])
    if (field === 'teacherId') {
      const availableTeachers = section === 'subjects'
        ? teachers.filter((teacher) => teacher.assignedClasses?.some((schoolClass) => String(schoolClass?._id || schoolClass) === String(record.classId)))
        : teachers
      return availableTeachers.map((item) => [item._id || item.id, item.name])
    }
    if (field === 'subjects') {
      const assignedClasses = new Set((record.assignedClasses || []).map((value) => String(value?._id || value)))
      const selectedSubjects = new Set((record.subjects || []).map((value) => String(value?._id || value)))
      return subjects.filter((item) => assignedClasses.has(String(item.classId?._id || item.classId)) || selectedSubjects.has(String(item._id || item.id)))
        .map((item) => [item._id || item.id, `${item.name} · ${item.className || 'Subject'}`])
    }
    if (field === 'students') return students.map((item) => [item._id || item.id, `${item.name} · ${item.className || 'Unassigned'}`])
    if (field === 'children') return students.map((item) => [item._id || item.id, `${item.name} · ${item.className || 'Unassigned'}`])
    if (field === 'parentIds') return parents.map((item) => [item._id || item.id, item.name])
    return []
  }
  const update = (field, value) => setRecord((current) => ({ ...current, [field]: value }))

  return fields
    .filter(([field]) => !(field === 'password' && selectedRecord))
    .map(([field, label]) => {
      if (multiSelectFields.includes(field)) {
        const options = optionsFor(field)
        const selected = new Set((record[field] || []).map((value) => String(value?._id || value)))
        return <fieldset className="admin-multi-field" key={field}>
          <legend>{label}</legend>
          {options.length ? <div className="admin-multi-options">{options.map(([value, name]) => <label className="admin-multi-option" key={value}>
            <input type="checkbox" checked={selected.has(String(value))} onChange={(event) => {
              const next = new Set(selected)
              if (event.target.checked) next.add(String(value))
              else next.delete(String(value))
              if (field === 'assignedClasses') {
                const nextSubjectIds = new Set(subjects
                  .filter((subject) => next.has(String(subject.classId?._id || subject.classId)))
                  .map((subject) => String(subject._id || subject.id)))
                setRecord((current) => ({
                  ...current,
                  assignedClasses: [...next],
                  subjects: (current.subjects || []).filter((subjectId) => nextSubjectIds.has(String(subjectId?._id || subjectId))),
                }))
              } else {
                update(field, [...next])
              }
            }} />
            <span>{name}</span>
          </label>)}</div> : <p className="admin-field-hint">{field === 'subjects' ? 'Assign a teaching class first to choose its subjects.' : 'Add the related records first to link them here.'}</p>}
          <small className="admin-field-hint">{selected.size} selected</small>
        </fieldset>
      }
      if (field === 'classId' || field === 'classTeacherId' || field === 'teacherId' || field === 'subjectId') {
        const options = field === 'classId'
          ? optionsFor('classId')
          : field === 'subjectId'
            ? subjects.filter((item) => String(item.classId?._id || item.classId) === String(record.classId)).map((item) => [item._id || item.id, item.name])
            : optionsFor(field)
        return <label key={field}>{label}
            <select value={record[field]?._id || record[field] || ''} required={(field === 'classId' && section === 'subjects') || (field === 'subjectId' && section === 'assignments')} onChange={(event) => {
              if (field === 'classId' && section === 'assignments') setRecord((current) => ({ ...current, classId: event.target.value, subjectId: '' }))
              else if (field === 'classId' && section === 'subjects') setRecord((current) => ({ ...current, classId: event.target.value, teacherId: '' }))
              else update(field, event.target.value)
            }}>
            <option value="">{field === 'classId' && section === 'students' ? 'Not assigned yet' : `Choose ${label.toLowerCase()}`}</option>
            {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </label>
      }
      if (field === 'status') {
        const statusOptions = section === 'teachers' ? [['active', 'Active'], ['on_leave', 'On leave'], ['inactive', 'Inactive']] : [['active', 'Active'], ['inactive', 'Inactive'], ['graduated', 'Graduated'], ['transferred', 'Transferred']]
        return <label key={field}>{label}<select value={record.status || 'active'} onChange={(event) => update('status', event.target.value)}>{statusOptions.map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      }
      if (['description', 'address'].includes(field)) {
        return <label key={field}>{label}<textarea value={record[field] || ''} onChange={(event) => update(field, event.target.value)} maxLength={field === 'address' ? 500 : 2000} /></label>
      }
      const inputType = field === 'email' ? 'email' : field === 'password' ? 'password' : field === 'dueDate' ? 'date' : field === 'totalMarks' ? 'number' : 'text'
      const required = requiredFields.has(field) || (field === 'classId' && (section === 'subjects' || section === 'assignments')) || (field === 'subjectId' && section === 'assignments')
      return <label key={field}>{label}
        <input type={inputType} min={field === 'totalMarks' ? '1' : undefined} value={record[field] ?? ''} onChange={(event) => update(field, event.target.value)} required={required} autoComplete={field === 'password' ? 'new-password' : undefined} />
      </label>
    })
}

function AttendancePage({ role, students, attendance, onStatusChange }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const isFamily = role === 'Student' || role === 'Parent'
  const visibleStudents = students
  const todays = attendance[date] || {}
  const present = Object.values(todays).filter((value) => value === 'Present').length

  return <>
    <PageHeading eyebrow="SHOWING UP MATTERS" title={isFamily ? 'Attendance history' : 'Attendance'} description="A clear picture of every school day, one check-in at a time." action={<label className="date-picker"><Clock3 size={15} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>} />
    <div className="metric-grid compact-metrics">
      <MetricCard label={isFamily ? 'Attendance this term' : 'Present today'} value={isFamily ? `${visibleStudents[0]?.attendance || '—'}%` : `${present} students`} change={`${Object.keys(todays).length} marked`} icon={Check} detail={isFamily ? 'based on recorded roll calls' : 'selected date'} />
      {!isFamily && <><MetricCard label="Absent today" value={`${Object.values(todays).filter((value) => value === 'Absent').length} students`} change="Recorded" icon={Users} tone="amber" detail="selected date" /><MetricCard label="Late arrivals" value={`${Object.values(todays).filter((value) => value === 'Late').length} students`} change="Recorded" icon={Clock3} tone="blue" detail="selected date" /></>}
    </div>
    <Card className="table-card">
      <div className="card-heading padded-heading"><div><h2>{isFamily ? 'Your attendance records' : 'Today’s roll call'}</h2><p>{isFamily ? 'Attendance based on recorded school days.' : 'Click a status to cycle between present, absent, and late.'}</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>CLASS</th><th>LAST 30 DAYS</th><th>TODAY’S STATUS</th></tr></thead><tbody>{visibleStudents.map((student) => {
        const status = todays[student.id] || 'Unmarked'
        return <tr key={student.id}><td><span className="person-cell"><Avatar name={student.name} color={student.color} size="sm" /><span><strong>{student.name}</strong><small>{student.email}</small></span></span></td><td>{student.className || '—'}</td><td><span className="table-number">{student.attendance === '—' ? '—' : `${student.attendance}%`}</span></td><td><button disabled={isFamily} className={`attendance-status attendance-${status.toLowerCase()}`} onClick={() => onStatusChange(student, status === 'Present' ? 'Absent' : status === 'Absent' ? 'Late' : 'Present', date)}><i />{status}{!isFamily && <ChevronDown size={13} />}</button></td></tr>
      })}</tbody></table></div>
    </Card>
  </>
}
function MessagesPage({ user, teachers, students, parents }) {
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState('')
  const [thread, setThread] = useState([])
  const [text, setText] = useState('')
  const [recipientId, setRecipientId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const contacts = [
    ...teachers.map((item) => ({ id: item.userId, name: item.name, role: 'Teacher', color: item.color })),
    ...students.map((item) => ({ id: item.userId, name: item.name, role: 'Student', color: item.color })),
    ...parents.map((item) => ({ id: item.userId, name: item.name, role: 'Parent', color: 'amber' })),
  ].filter((item) => item.id && String(item.id) !== user.id)
  const current = conversations.find((item) => item._id === selected)
  const other = current?.participants?.find((person) => String(person._id) !== user.id)

  useEffect(() => {
    let active = true
    async function loadConversations() {
      try {
        const result = await portalApi.conversations()
        if (active) {
          setConversations(result.data)
          setSelected((value) => value || result.data[0]?._id || '')
        }
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadConversations()
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!selected) {
      setThread([])
      return undefined
    }
    let active = true
    async function loadThread() {
      setLoading(true)
      setError('')
      try {
        const result = await portalApi.conversationMessages(selected)
        if (active) setThread(result.data)
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadThread()
    return () => { active = false }
  }, [selected])

  async function beginConversation() {
    if (!recipientId) return
    setError('')
    try {
      const result = await portalApi.startConversation(recipientId)
      const detail = result.data
      const currentList = await portalApi.conversations()
      setConversations(currentList.data)
      setSelected(detail._id)
      setRecipientId('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function send(event) {
    event.preventDefault()
    if (!text.trim() || !selected || !other) return
    setError('')
    try {
      const result = await portalApi.sendMessage({ conversationId: selected, receiverId: other._id, message: text.trim() })
      setThread((items) => [...items, result.data])
      setText('')
      setConversations((items) => items.map((item) => item._id === selected ? { ...item, lastMessage: result.data.message, lastMessageAt: result.data.sentAt } : item))
    } catch (requestError) {
      setError(requestError.message)
    }
  }
  return <>
    <PageHeading eyebrow="KEEP THE GOOD CONVERSATIONS GOING" title="Messages" description="A private place for school conversations." />
    {error && <p className="auth-notice" role="alert">{error}</p>}
    <Card className="messages-card">
      <aside className="conversation-list">
        <label className="table-search"><Search size={15} /><input placeholder="Find a conversation" /></label>
        <div className="conversation-compose">
          <select aria-label="Choose a school contact" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
            <option value="">Choose a school contact</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.role}</option>)}
          </select>
          <Button onClick={beginConversation} disabled={!recipientId}><Plus size={14} /> New</Button>
        </div>
        {loading && conversations.length === 0 ? <p role="status">Loading conversations…</p> : conversations.map((item) => {
          const participant = item.participants?.find((person) => String(person._id) !== user.id)
          return <button className={`conversation-item ${selected === item._id ? 'conversation-selected' : ''}`} key={item._id} onClick={() => setSelected(item._id)}>
            <Avatar name={participant?.name || 'School contact'} color="violet" />
            <span><strong>{participant?.name || 'School contact'}</strong><small>{item.lastMessage || 'Start a conversation'}</small></span>
            <em>{item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleDateString() : ''}</em>
          </button>
        })}
      </aside>
      <section className="chat-panel">
        {other ? <>
          <header className="chat-header"><Avatar name={other.name} color="violet" /><span><strong>{other.name}</strong><small>{other.role} · Northstar Academy</small></span><span className="icon-button" aria-hidden="true"><MoreHorizontal size={18} /></span></header>
          <div className="chat-messages" aria-live="polite">
            {loading ? <p role="status">Loading messages…</p> : thread.map((message) => {
              const fromMe = String(message.senderId) === user.id
              return <div className={`chat-message ${fromMe ? 'chat-message-mine' : ''}`} key={message._id}><p>{message.message}</p><small>{new Date(message.sentAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small></div>
            })}
          </div>
          <form className="chat-compose" onSubmit={send}><input aria-label="Message" value={text} onChange={(event) => setText(event.target.value)} placeholder={`Message ${other.name.split(' ')[0]}...`} maxLength={5000} /><button className="send-button" type="submit" aria-label="Send message" disabled={!text.trim()}><Send size={16} /></button></form>
        </> : <div className="assistant-empty"><strong>{loading ? 'Loading your conversations…' : 'Choose a conversation or start a new one.'}</strong><span>Messages are only available to permitted school contacts.</span></div>}
      </section>
    </Card>
    <p className="portal-footnote"><ShieldCheckIcon /> Messages are shared only with the people in this conversation.</p>
  </>
}

function ShieldCheckIcon() {
  return <Check size={14} />
}

function AssistantPage({ user }) {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [conversations, setConversations] = useState([])
  const [conversationId, setConversationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadConversation() {
      setLoading(true)
      setError('')
      try {
        const result = await assistantService.conversations()
        if (active) setConversations(result.data)
        let conversation = result.data[0]
        if (conversation) {
          const detail = await assistantService.getConversation(conversation._id)
          conversation = detail.data
        } else {
          const created = await assistantService.createConversation()
          conversation = created.data
        }
        if (active) {
          setConversationId(conversation._id)
          setMessages(conversation.messages || [])
        }
      } catch (requestError) {
        if (active) setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    loadConversation()
    return () => { active = false }
  }, [])

  async function ask(value) {
    if (!value.trim() || sending || !conversationId) return
    const prompt = value.trim()
    setQuestion('')
    setError('')
    setSending(true)
    setMessages((current) => [...current, { _id: `pending-${Date.now()}`, role: 'user', content: prompt }])
    try {
      const result = await assistantService.sendMessage(conversationId, prompt)
      setMessages((current) => [
        ...current.filter((message) => !message._id?.startsWith('pending-')),
        ...result.data.messages,
      ])
      setConversations((current) => current.map((item) => item._id === conversationId
        ? { ...item, title: item.title === 'New study chat' ? prompt.slice(0, 80) : item.title, lastMessageAt: new Date().toISOString() }
        : item))
    } catch (requestError) {
      setMessages((current) => current.filter((message) => !message._id?.startsWith('pending-')))
      setQuestion(prompt)
      setError(requestError.message)
    } finally {
      setSending(false)
    }
  }
  async function startNewChat() {
    if (sending) return
    setLoading(true)
    setError('')
    try {
      const result = await assistantService.createConversation()
      setConversationId(result.data._id)
      setMessages([])
      setConversations((current) => [result.data, ...current])
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }
  return <>
    <PageHeading
      eyebrow="A STUDY BUDDY, WHENEVER YOU NEED ONE"
      title="Your study space"
      description="A patient AI tutor for questions, practice, and study planning."
      action={<Button variant="outline" onClick={startNewChat} disabled={loading || sending}><Plus size={15} /> New chat</Button>}
    />
    <Card className="assistant-card">
      <div className="assistant-intro">
        <span className="assistant-symbol"><Sparkles size={24} /></span>
        <span className="assistant-label">ACADEX STUDY BUDDY</span>
        <h2>Hey {user.name.split(' ')[0]}, what are we<br />working on today?</h2>
        <p>Ask me about a class topic, a tricky assignment, or how to make a plan that sticks.</p>
        <div className="suggestion-list">{['Help me plan my study week', 'Explain quadratic equations', 'How can I stay focused?'].map((suggestion) => <button disabled={loading || sending} onClick={() => ask(suggestion)} key={suggestion}>{suggestion} <ArrowRight size={13} /></button>)}</div>
        {conversations.length > 0 && <div className="assistant-history" aria-label="Recent study chats">
          {conversations.slice(0, 5).map((item) => <button className={item._id === conversationId ? 'assistant-history-active' : ''} key={item._id} onClick={async () => {
            if (item._id === conversationId || loading || sending) return
            setLoading(true)
            setError('')
            try {
              const result = await assistantService.getConversation(item._id)
              setConversationId(item._id)
              setMessages(result.data.messages || [])
            } catch (requestError) {
              setError(requestError.message)
            } finally {
              setLoading(false)
            }
          }}>{item.title}</button>)}
        </div>}
      </div>
      <div className="assistant-conversation" aria-live="polite">
        {loading ? <div className="assistant-empty"><strong>Opening your private study chat…</strong></div>
          : messages.length === 0 ? <div className="assistant-empty"><div className="assistant-orbit"><Sparkles size={23} /></div><strong>A good question is a great place to start.</strong><span>Try one of the prompts or ask something of your own.</span></div>
            : messages.map((message, index) => <div key={message._id || `${message.role}-${index}`} className="assistant-pair">
              <p className="assistant-question">{message.role === 'user' ? message.content : 'Acadex Study Buddy'}</p>
              {message.role === 'assistant' && <p className="assistant-answer"><Sparkles size={14} /> {message.content}</p>}
            </div>)}
        {sending && <p className="assistant-answer" role="status"><Sparkles size={14} /> Thinking through your question…</p>}
      </div>
      {error && <p className="auth-notice" role="alert">{error}</p>}
      <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); ask(question) }}>
        <input aria-label="Ask your study buddy" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask your study buddy anything..." disabled={loading || sending} maxLength={4000} />
        <Button type="submit" aria-label="Ask question" disabled={loading || sending || !question.trim()}><Send size={16} /></Button>
      </form>
      <p className="assistant-disclaimer">Your tutor guides learning rather than completing graded work. Avoid sharing personal or sensitive information.</p>
    </Card>
  </>
}

function GenericSection({ section, role, user, announcements, refreshPortalData, classes, subjects, fees, timetable, grades, dashboard }) {
  const configs = {
    analytics: ['A clearer picture, at a glance.', 'Spot the patterns, celebrate the progress, and see where a little more support could make a big difference.'],
    reports: ['Progress worth sharing.', 'Thoughtful reporting that helps the whole community understand how learning is growing.'],
    classes: ['Your school, by the class.', 'Every group, schedule, and shared learning moment in one place.'],
    subjects: ['Learning, in every subject.', 'Bring subject goals and student progress into one clear view.'],
    announcements: ['The school note-board.', 'The right updates, reaching the right people at the right time.'],
    timetable: ['A day with a little more rhythm.', 'Find your next class, upcoming exams, and the moments in between.'],
    fees: ['Fee status, made clear.', 'A simple, private overview of the school fees and payment schedule.'],
    settings: ['Make Acadex feel like yours.', 'Your account, school preferences, and notification settings.'],
  }
  const [announcement, setAnnouncement] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [sectionError, setSectionError] = useState('')
  const [publishing, setPublishing] = useState(false)
  const content = configs[section] || configs.analytics
  const groupedGrades = grades.reduce((groups, item) => {
    const subject = item.subjectId?.name || 'Other'
    const group = groups.get(subject) || { total: 0, count: 0 }
    group.total += item.percentage
    group.count += 1
    groups.set(subject, group)
    return groups
  }, new Map())
  const gradeBySubject = [...groupedGrades].map(([subject, item]) => ({ subject, average: item.total / item.count }))
  const overallGrade = grades.length ? grades.reduce((sum, item) => sum + item.percentage, 0) / grades.length : null
  const attendancePercent = role === 'Parent'
    ? dashboard.attendance?.length ? dashboard.attendance.reduce((sum, item) => sum + item.percentage, 0) / dashboard.attendance.length : null
    : dashboard.attendance?.total ? dashboard.attendance.percentage : null
  async function changePassword(event) {
    event.preventDefault()
    setSectionError('')
    setSavingPassword(true)
    try {
      await authService.changePassword(currentPassword, newPassword)
      window.dispatchEvent(new Event('acadex:unauthorized'))
    } catch (requestError) {
      setSectionError(requestError.message)
    } finally {
      setSavingPassword(false)
    }
  }
  async function publishAnnouncement(event) {
    event.preventDefault()
    if (!announcement.trim()) return
    setPublishing(true)
    setSectionError('')
    try {
      await portalApi.create('announcements', {
        title: announcement.trim().split(/\s+/).slice(0, 10).join(' ').slice(0, 200),
        content: announcement.trim(),
      })
      if (await refreshPortalData()) setAnnouncement('')
    } catch (requestError) {
      setSectionError(requestError.message)
    } finally {
      setPublishing(false)
    }
  }
  if (section === 'announcements') return <>
    <PageHeading eyebrow="A LITTLE NOTE FROM YOUR SCHOOL" title={content[0]} description={content[1]} />
    {sectionError && <p className="auth-notice" role="alert">{sectionError}</p>}
    {(role === 'Admin' || role === 'Teacher') && <Card className="announcement-compose"><Avatar name={user.name} /><form onSubmit={publishAnnouncement}><textarea value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Share a good thing with your school community..." maxLength={10000} /><div><span className="select-button">Everyone <ChevronDown size={14} /></span><Button type="submit" disabled={!announcement.trim() || publishing}><Send size={14} /> {publishing ? 'Sharing…' : 'Share update'}</Button></div></form></Card>}
    <div className="announcement-list">{announcements.length === 0 ? <Card className="announcement-item"><p>No announcements are available.</p></Card> : announcements.map((item) => <Card className="announcement-item" key={item.id}><div className="announcement-author"><Avatar name={item.name} color={item.color} /><span><strong>{item.name}</strong><small>{item.time}</small></span><MoreHorizontal size={18} /></div><p>{item.text}</p></Card>)}</div>
  </>
  if (section === 'timetable') return <>
    <PageHeading eyebrow="YOUR WEEK, AT A GLANCE" title={content[0]} description={content[1]} />
    <Card className="table-card"><div className="table-scroll"><table><thead><tr><th>DAY</th><th>TIME</th><th>SUBJECT</th><th>CLASS</th><th>TEACHER</th><th>ROOM</th></tr></thead><tbody>
      {timetable.length === 0 ? <tr><td className="empty-row" colSpan={6}>No timetable entries are available.</td></tr> : [...timetable].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)).map((item) => <tr key={item._id}><td>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][item.dayOfWeek]}</td><td>{item.startTime}–{item.endTime}</td><td>{item.subjectId?.name || '—'}</td><td>{optionLabel(item.classId || {})}</td><td>{item.teacherId?.name || '—'}</td><td>{item.room || '—'}</td></tr>)}
    </tbody></table></div></Card>
  </>
  if (section === 'fees') return <>
    <PageHeading eyebrow="A CLEAR LOOK AT THE DETAILS" title={content[0]} description={content[1]} />
    <Card className="table-card"><div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>FEE</th><th>ACADEMIC YEAR</th><th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th></tr></thead><tbody>
      {fees.length === 0 ? <tr><td className="empty-row" colSpan={6}>No fee records are available.</td></tr> : fees.map((fee) => <tr key={fee._id}><td>{fee.studentId?.name || 'Student'}</td><td>{fee.feeType}</td><td>{fee.academicYear}</td><td>{new Date(fee.dueDate).toLocaleDateString()}</td><td>{Number(fee.amount).toLocaleString()}</td><td><StatusBadge tone={fee.status === 'paid' ? 'green' : fee.status === 'overdue' ? 'amber' : 'blue'}>{fee.status}</StatusBadge></td></tr>)}
    </tbody></table></div></Card>
  </>
  if (section === 'settings') return <>
    <PageHeading eyebrow="YOUR SPACE, YOUR WAY" title={content[0]} description={content[1]} />
    <Card className="settings-card"><h2>Account details</h2><label>Display name<input value={user.name} readOnly /></label><label>School email<input value={user.email} type="email" readOnly /></label>
      <h2>Change password</h2>
      {sectionError && <p className="auth-notice" role="alert">{sectionError}</p>}
      <form className="record-form" onSubmit={changePassword}>
        <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
        <label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
        <Button type="submit" disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update password'}</Button>
      </form>
    </Card>
  </>
  if (section === 'reports' || section === 'analytics') return <>
    <PageHeading eyebrow="A STORY OF GROWTH" title={content[0]} description={content[1]} action={<Button variant="outline" onClick={() => {
      const rows = [['Subject', 'Average score'], ...gradeBySubject.map((item) => [item.subject, `${item.average.toFixed(1)}%`])]
      const csv = rows.map((row) => row.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(',')).join('\n')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      link.download = 'acadex-progress-report.csv'
      link.click()
      URL.revokeObjectURL(link.href)
    }}><ArrowDownToLine size={15} /> Export report</Button>} />
    <div className="report-grid">
      <Card className="report-card"><span className="report-icon report-icon-0"><Users size={20} /></span><strong>Students</strong><small>Current records in your scope</small><span className="report-big-number">{dashboard.students ?? students.length}</span></Card>
      <Card className="report-card"><span className="report-icon report-icon-1"><Check size={20} /></span><strong>Attendance</strong><small>Recorded roll calls</small><span className="report-big-number">{attendancePercent === null ? '—' : `${attendancePercent.toFixed(1)}%`}</span></Card>
      <Card className="report-card"><span className="report-icon report-icon-2"><GraduationCap size={20} /></span><strong>Average grade</strong><small>From {grades.length} recorded assessments</small><span className="report-big-number">{overallGrade === null ? '—' : `${overallGrade.toFixed(1)}%`}</span></Card>
    </div>
    <Card className="chart-card report-chart"><div className="card-heading"><div><h2>Academic progress</h2><p>Average recorded scores by subject</p></div></div>
      <div className="dashboard-chart">{gradeBySubject.length === 0 ? <div className="assistant-empty"><strong>No grade data is available yet.</strong></div> : <ResponsiveContainer width="100%" height="100%"><BarChart data={gradeBySubject}><CartesianGrid stroke="#eef0f5" vertical={false} /><XAxis dataKey="subject" axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="average" name="Average score" fill="#5549e6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>}</div>
    </Card>
  </>
  if (section === 'classes' || section === 'subjects') {
    const records = section === 'classes' ? classes : subjects
    return <>
      <PageHeading eyebrow="MADE FOR LEARNING TOGETHER" title={content[0]} description={content[1]} />
      <div className="class-grid">{records.length === 0 ? <Card className="class-card"><p>No {section} are available.</p></Card> : records.map((item, index) => {
        const title = section === 'classes' ? `${item.name} · ${item.section}` : item.name
        const details = section === 'classes'
          ? (item.subjects || []).map((subject) => subject.name).join(' · ') || 'No subjects assigned'
          : `${item.classId?.name || 'Class'}${item.teacherId?.name ? ` · ${item.teacherId.name}` : ''}`
        const count = section === 'classes' ? `${item.students?.length || 0} students` : item.subjectCode
        return <Card className="class-card" key={item._id}>
          <div className={`class-art ${['lavender', 'mint', 'peach', 'bluewash'][index % 4]}`}><span>{section === 'classes' ? <GraduationCap /> : <BookOpen />}</span><small>{section === 'classes' ? item.academicYear : item.subjectCode}</small></div>
          <h2>{title}</h2><p>{details}</p><div className="class-card-footer"><span>{count}</span></div>
        </Card>
      })}</div>
    </>
  }
  return <Card className="table-card"><PageHeading eyebrow="ACADEX" title="Section not found" description="Choose a section from the navigation menu." /></Card>
}

function AssignmentDetails({ assignment, role, submissions, onSubmit, onReview, user, students }) {
  const [draft, setDraft] = useState('')
  const isLearner = role === 'Student' || role === 'Parent'
  const childNames = new Set(students.map((student) => student.name))
  const visibleSubmissions = submissions.filter((submission) => submission.assignmentId === assignment.id && (role === 'Parent' ? childNames.has(submission.student) : !isLearner || submission.student === user.name))
  const ownSubmission = visibleSubmissions.find((submission) => submission.student === user.name)

  return <div className="assignment-details">
    <div className="profile-details">
      <div><span>Subject</span><strong>{assignment.subject}</strong></div>
      <div><span>Class</span><strong>{assignment.className}</strong></div>
      <div><span>Due date</span><strong>{assignment.due}</strong></div>
      <div><span>Submissions</span><strong>{assignment.submitted} of {assignment.total}</strong></div>
    </div>
    {role === 'Student' && <form className="submission-form" onSubmit={(event) => { event.preventDefault(); onSubmit(assignment, draft); setDraft('') }}>
      <label htmlFor="assignment-submission">Your work</label>
      {ownSubmission && <p className="submission-state">Last submitted {ownSubmission.submittedAt}. You can update your response before the due date.</p>}
      <textarea id="assignment-submission" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Share your answer or add a note about your work..." required />
      <Button type="submit"><Send size={14} /> {ownSubmission ? 'Update submission' : 'Submit assignment'}</Button>
    </form>}
    {role !== 'Student' && <div className="submission-list">
      <h3>{role === 'Parent' ? 'Your child’s submissions' : 'Student submissions'}</h3>
      {visibleSubmissions.length === 0 ? <p className="submission-empty">No submissions yet.</p> : visibleSubmissions.map((submission) => <article className="submission-row" key={submission.id}>
        <div><strong>{submission.student}</strong><small>{submission.submittedAt}</small><p>{submission.note}</p></div>
        <div className="submission-review"><StatusBadge tone={submission.status === 'Reviewed' ? 'green' : 'amber'}>{submission.status}</StatusBadge>{submission.grade && <strong className="submission-grade">{submission.grade}%</strong>}{!isLearner && submission.status !== 'Reviewed' && <button className="card-link" onClick={() => onReview(submission.id)}>Mark reviewed</button>}</div>
      </article>)}
    </div>}
  </div>
}

export default function PortalPage() {
  const { section = 'overview' } = useParams()
  const [searchParams] = useSearchParams()
  const globalQuery = searchParams.get('search') || ''
  const { user, students, teachers, parents, assignments, submissions, attendance, attendanceRecords, classes, subjects, grades, fees, timetable, dashboard, portalDataLoading, portalDataError, refreshPortalData, announcements } = useApp()
  const [query, setQuery] = useState(globalQuery)
  const [classFilter, setClassFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [modal, setModal] = useState(null)
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [record, setRecord] = useState({})
  const [reviewed, setReviewed] = useState({})
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const role = user.role
  if (section === 'assignments') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><AssignmentsPage user={user} /></motion.div>
  if (section === 'learning-hub') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><LearningHubPage user={user} /></motion.div>
  const data = ({
    students,
    teachers,
    parents,
    classes,
    subjects,
    assignments,
  })[section] || []
  const classOptions = [...new Set(data.map((item) => (
    section === 'teachers' ? item.subject
      : section === 'subjects' ? item.className
        : section === 'classes' ? item.academicYear
          : item.className
  )).filter(Boolean))]
  const statusOptions = [...new Set(data.map((item) => item.status).filter(Boolean))]
  const shown = data.filter((item) => {
    const matchesSearch = `${item.name || item.title} ${item.email || ''} ${item.subject || ''} ${item.className || ''} ${item.childrenNames || ''} ${item.teacherName || ''}`.toLowerCase().includes(query.toLowerCase())
    const filterValue = section === 'teachers' ? item.subject : section === 'classes' ? item.academicYear : item.className
    return matchesSearch && (classFilter === 'All' || filterValue === classFilter) && (statusFilter === 'All' || item.status === statusFilter)
  })
  const canEdit = role === 'Admin' || (role === 'Teacher' && section === 'assignments')
  const singular = ({ students: 'student', teachers: 'teacher', parents: 'parent account', classes: 'class', subjects: 'subject', assignments: 'assignment' })[section] || 'record'

  function openCreate() {
    const now = new Date()
    const defaultAcademicYear = `${now.getFullYear()}-${now.getFullYear() + 1}`
    const defaults = {
      students: { name: '', email: '', password: '', admissionNumber: '', rollNumber: '', classId: '', parentIds: [], phone: '' },
      teachers: { name: '', email: '', password: '', employeeId: '', department: '', assignedClasses: [], subjects: [], qualification: '', phone: '', status: 'active' },
      parents: { name: '', email: '', password: '', children: [], phone: '', occupation: '', address: '' },
      classes: { name: '', section: '', academicYear: defaultAcademicYear, classTeacherId: '', students: [] },
      subjects: { name: '', subjectCode: '', classId: classes[0]?._id || '', teacherId: '', description: '' },
      assignments: { dueDate: new Date().toISOString().slice(0, 10), classId: classes[0]?._id, subjectId: subjects[0]?._id, totalMarks: 100 },
    }
    setRecord(defaults[section] || {})
    setActionError('')
    setSelectedRecord(null)
    setModal('edit')
  }

  async function saveRecord(event) {
    event.preventDefault()
    setSaving(true)
    setActionError('')
    try {
      const payload = recordPayload(section, record, { isNew: !selectedRecord, role })
      if (selectedRecord) await portalApi.update(section, selectedRecord.id, payload)
      else await portalApi.create(section, payload)
      if (await refreshPortalData()) setModal(null)
    } catch (error) {
      setActionError(error.message)
    } finally {
      setSaving(false)
    }
  }

  async function removeRecord(item) {
    if (!window.confirm(`Delete ${item.name || item.title}? This can’t be undone.`)) return
    setActionError('')
    try {
      await portalApi.remove(section, item.id)
      await refreshPortalData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function toggleAccountAccess(item) {
    const userId = item.userId?._id || item.userId
    if (!userId) {
      setActionError('This profile is not linked to a sign-in account.')
      return
    }
    const isActive = !item.accountActive
    const action = isActive ? 'restore access for' : 'pause access for'
    if (!window.confirm(`Are you sure you want to ${action} ${item.name}?`)) return
    setActionError('')
    try {
      await portalApi.setAccountStatus(userId, isActive)
      await refreshPortalData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function submitAssignment(assignment, note) {
    if (!note.trim()) return
    const existing = submissions.find((item) => item.assignmentId === assignment.id && item.student === user.name)
    try {
      if (existing) {
        await portalApi.update('submissions', existing.id, { submissionText: note.trim() })
      } else {
        await portalApi.submitAssignment({ assignmentId: assignment.id, submissionText: note.trim() })
      }
      await refreshPortalData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function reviewSubmission(id) {
    const submission = submissions.find((item) => item.id === id)
    const assignment = assignments.find((item) => item.id === submission?.assignmentId)
    const score = window.prompt(`Score earned (0–${assignment?.totalMarks || 100}):`, submission?.grade || '')
    if (score === null) return
    const marksObtained = Number(score)
    if (!Number.isFinite(marksObtained) || marksObtained < 0 || marksObtained > (assignment?.totalMarks || 100)) {
      setActionError('Enter a valid score within the assignment’s total marks.')
      return
    }
    try {
      await portalApi.reviewSubmission(id, { marksObtained })
      await refreshPortalData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  async function changeAttendance(student, status, date) {
    const existing = attendanceRecords.find((entry) =>
      (entry.studentId?._id || entry.studentId) === student.id && new Date(entry.date).toISOString().slice(0, 10) === date,
    )
    const nextStatus = status.toLowerCase()
    try {
      if (existing) {
        await portalApi.update('attendance', existing._id, { status: nextStatus })
      } else {
        const classId = student.classId?._id || student.classId
        if (!classId) throw new Error('This student is not assigned to a class.')
        await portalApi.create('attendance', { studentId: student.id, classId, date, status: nextStatus })
      }
      await refreshPortalData()
    } catch (error) {
      setActionError(error.message)
    }
  }

  function exportRows() {
    const fields = section === 'students' ? ['name', 'email', 'grade', 'className', 'attendance', 'score']
      : section === 'teachers' ? ['name', 'email', 'subject', 'classes', 'status']
        : section === 'parents' ? ['name', 'email', 'childrenNames', 'phone', 'status']
          : section === 'classes' ? ['className', 'academicYear', 'teacherName', 'studentCount']
            : section === 'subjects' ? ['name', 'subjectCode', 'className', 'teacherName']
              : ['title', 'subject', 'className', 'due', 'submitted', 'total', 'status']
    const csv = [fields.join(','), ...shown.map((item) => fields.map((field) => `"${String(item[field] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    link.download = `acadex-${section}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const headingInfo = {
    students: ['THE PEOPLE AT THE HEART OF IT', 'Students', 'A little more about the learners who make your school what it is.'],
    teachers: ['THE PEOPLE WHO MAKE IT HAPPEN', 'Teaching staff', 'The brilliant people behind every great school day.'],
    parents: ['FAMILY, IN THE LOOP', 'Parents & guardians', 'Connect each family to the right learners and pause or restore account access when needed.'],
    classes: ['BUILD YOUR SCHOOL STRUCTURE', 'Classes & cohorts', 'Create classes, assign a class teacher, and maintain an accurate student roster.'],
    subjects: ['MAKE EVERY CLASS TEACHABLE', 'Subjects', 'Attach subjects to classes and give teachers the correct teaching access.'],
    assignments: ['WORK THAT MOVES LEARNING FORWARD', role === 'Student' || role === 'Parent' ? 'Assignments' : 'Assignments', 'A clear view of what’s next, what’s done, and what needs a little attention.'],
    grades: ['PROGRESS, NOT JUST NUMBERS', role === 'Student' || role === 'Parent' ? 'Your grades' : 'Grades & performance', 'Every result is a moment in a much bigger learning story.'],
  }

  if (portalDataLoading && !students.length && !teachers.length && !assignments.length) {
    return <Card className="table-card"><p role="status">Loading your school workspace…</p></Card>
  }
  if (portalDataError) {
    return <Card className="table-card"><h2>School data is unavailable</h2><p role="alert">{portalDataError}</p><Button onClick={refreshPortalData}>Retry</Button></Card>
  }

  if (['parents'].includes(section) && role !== 'Admin') return <Card className="learning-empty"><h2>Admin access required</h2><p>Family account management is available to school administrators.</p></Card>
  if (section === 'overview') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><Dashboard role={role} students={students} teachers={teachers} parents={parents} classes={classes} assignments={assignments} dashboard={dashboard} user={user} /></motion.div>
  if (section === 'attendance') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{actionError && <p className="auth-notice" role="alert">{actionError}</p>}<AttendancePage role={role} students={students} attendance={attendance} onStatusChange={changeAttendance} /></motion.div>
  if (section === 'messages') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><MessagesPage user={user} teachers={teachers} students={students} parents={[]} /></motion.div>
  if (section === 'assistant') return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><AssistantPage user={user} /></motion.div>
  if (['students', 'teachers', 'parents', 'classes', 'subjects', 'assignments'].includes(section)) return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <PageHeading eyebrow={headingInfo[section][0]} title={headingInfo[section][1]} description={headingInfo[section][2]} action={<div className="heading-actions"><Button variant="outline" onClick={exportRows}><ArrowDownToLine size={15} /> Export</Button>{canEdit && <Button onClick={openCreate}><UserPlus size={15} /> Add {singular}</Button>}</div>} />
    {actionError && <p className="auth-notice" role="alert">{actionError}</p>}
    <div className="table-summary-row"><span><strong>{data.length}</strong> {section} in your school</span><span className="table-summary-note"><i /> Live school data</span></div>
    <RecordTable kind={section} records={shown} query={query} onQuery={setQuery} classFilter={classFilter} onClassFilterChange={setClassFilter} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} classOptions={classOptions} statusOptions={statusOptions} canEdit={canEdit} onToggleActive={toggleAccountAccess} onView={(item) => { setSelectedRecord(item); setModal('view') }} onEdit={(item) => {
      if (!canEdit) { setSelectedRecord(item); setModal('view'); return }
      setSelectedRecord(item)
      setRecord(recordForForm(item))
      setActionError('')
      setModal('edit')
    }} onDelete={removeRecord} />
    <Modal open={modal === 'edit'} onClose={() => setModal(null)} title={`${selectedRecord ? 'Edit' : 'Add'} ${singular}`} description={`Keep your ${singular} details up to date.`}>
      <form className="record-form" onSubmit={saveRecord}>
        <AdminRecordFields section={section} fields={fieldsFor[section] || []} record={record} setRecord={setRecord} selectedRecord={selectedRecord} classes={classes} teachers={teachers} subjects={subjects} students={students} parents={parents} />
        {!selectedRecord && ['students', 'teachers', 'parents'].includes(section) && <p className="admin-account-note">This also creates a secure {section === 'students' ? 'student' : section === 'teachers' ? 'teacher' : 'parent'} sign-in and opens the matching role dashboard.</p>}
        {actionError && <p className="auth-notice" role="alert">{actionError}</p>}
        <div className="modal-actions"><Button variant="outline" type="button" onClick={() => setModal(null)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : selectedRecord ? 'Save changes' : `Add ${singular}`}</Button></div>
      </form>
    </Modal>
    <Modal open={modal === 'view'} onClose={() => setModal(null)} title={selectedRecord?.name || selectedRecord?.title || 'Details'} description={selectedRecord?.email || 'A little more context for your school community.'}>
      {section === 'assignments' && selectedRecord ? <AssignmentDetails assignment={selectedRecord} role={role} submissions={submissions} onSubmit={submitAssignment} onReview={reviewSubmission} user={user} students={students} />
        : <div className="profile-details">{selectedRecord && Object.entries(selectedRecord).filter(([key]) => key !== 'id' && key !== '_id' && key !== 'color' && key !== 'passwordHash').map(([key, value]) => <div key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><strong>{value && typeof value === 'object' ? value.name || value.email || value.toString() : String(value ?? '—')}</strong></div>)}</div>}
      {actionError && <p className="auth-notice" role="alert">{actionError}</p>}
      <div className="modal-actions"><Button variant="outline" onClick={() => setModal(null)}>Close</Button></div>
    </Modal>
  </motion.div>
  if (section === 'grades') {
    const average = grades.length ? grades.reduce((sum, item) => sum + item.percentage, 0) / grades.length : null
    return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeading eyebrow={headingInfo.grades[0]} title={headingInfo.grades[1]} description={headingInfo.grades[2]} action={<Button variant="outline" onClick={() => {
        const rows = [['Subject', 'Assessment', 'Date', 'Score', 'Grade'], ...grades.map((item) => [item.subjectId?.name || '', item.examName, new Date(item.createdAt).toLocaleDateString(), `${item.percentage}%`, item.grade])]
        const csv = rows.map((row) => row.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(',')).join('\n')
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
        link.download = 'acadex-grades.csv'
        link.click()
        URL.revokeObjectURL(link.href)
      }}><ArrowDownToLine size={15} /> Export grades</Button>} />
      <div className="metric-grid compact-metrics">
        <MetricCard label="Overall average" value={average === null ? '—' : `${average.toFixed(1)}%`} change={`${grades.length} records`} icon={GraduationCap} detail="available grades" />
        <MetricCard label="Assessments" value={grades.length} change="Recorded" icon={FileText} tone="green" detail="in your account" />
        <MetricCard label="Subjects" value={new Set(grades.map((item) => item.subjectId?._id).filter(Boolean)).size} change="With results" icon={BookOpen} tone="blue" detail="available subjects" />
        <MetricCard label="Latest result" value={grades[0] ? `${grades[0].percentage}%` : '—'} change={grades[0]?.grade || 'No result'} icon={Check} tone="amber" detail={grades[0]?.examName || 'No grades yet'} />
      </div>
      <Card className="grade-table-card"><div className="card-heading"><div><h2>Latest results</h2><p>Recorded assignment and exam grades</p></div></div>
        {grades.length === 0 ? <p className="empty-row">No grades are available yet.</p> : grades.map((item) => <div className="grade-row" key={item._id}><span className="grade-subject-icon"><BookOpen size={16} /></span><span className="grade-description"><strong>{item.subjectId?.name || 'Subject'}</strong><small>{item.examName} · {new Date(item.createdAt).toLocaleDateString()}</small></span><span className="grade-score">{item.percentage}%</span><span className="grade-letter">{item.grade}</span><span className="table-secondary">{item.marksObtained}/{item.totalMarks}</span></div>)}
      </Card>
    </motion.div>
  }
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><GenericSection section={section} role={role} user={user} announcements={announcements} refreshPortalData={refreshPortalData} classes={classes} subjects={subjects} fees={fees} timetable={timetable} grades={grades} dashboard={dashboard} /></motion.div>
}

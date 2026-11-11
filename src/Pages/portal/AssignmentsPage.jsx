import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookOpen, Check, Clock3, Download, Eye, FileText, Plus, RefreshCw, Search, Send, Sparkles, Upload, Users } from 'lucide-react'
import { Button, Card, Modal, StatusBadge } from '../../components/common/UI.jsx'
import { portalApi } from '../../services/portalService.js'
import { clearAssignmentDraft, getAssignmentDraft, saveAssignmentDraft } from '../../services/offlineDrafts.js'

const acceptedFiles = '.pdf,.doc,.docx,.ppt,.pptx,.zip,.jpg,.jpeg,.png,.webp,.gif'

function PageHeading({ teacher, canCreate, onCreate, loading, onRefresh }) {
  return <div className="page-heading assignment-page-heading">
    <div><p className="page-eyebrow">{teacher ? 'WORK THAT MOVES LEARNING FORWARD' : 'YOUR LEARNING, ONE STEP AT A TIME'}</p>
      <h1>{teacher ? 'Assignments' : 'My assignments'}</h1>
      <p className="page-description">{teacher ? 'Set meaningful work, follow submissions, and share feedback with your classes.' : 'Find your class work, follow deadlines, and share your completed work with your teacher.'}</p>
    </div>
    <div className="heading-actions">
      <Button variant="outline" onClick={onRefresh} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
      {canCreate && <Button onClick={onCreate}><Plus size={15} /> New assignment</Button>}
    </div>
  </div>
}

function Status({ value }) {
  const labels = { pending: 'Pending', submitted: 'Submitted', late: 'Late', reviewed: 'Reviewed', graded: 'Graded', returned: 'Submitted' }
  const tones = { pending: 'amber', submitted: 'blue', late: 'amber', reviewed: 'green', graded: 'green' }
  return <StatusBadge tone={tones[value] || 'blue'}>{labels[value] || value}</StatusBadge>
}

function prettyDate(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  return value ? new Date(value).toLocaleDateString(undefined, options) : '—'
}

function FileLinks({ files = [], preview = false }) {
  if (!files.length) return <span className="assignment-muted">No files attached</span>
  return <div className="assignment-files">{files.map((file) => (
    <a key={file.id} href={`${file.url}${preview ? '?inline=true' : ''}`} target="_blank" rel="noreferrer" download={!preview}>
      {preview ? <Eye size={14} /> : <Download size={14} />}{file.name}
    </a>
  ))}</div>
}

function UploadProgress({ progress, fileName }) {
  if (progress === null) return null
  return <div className="assignment-upload-progress" role="status">
    <div><span>Uploading {fileName}</span><strong>{progress}%</strong></div>
    <progress max="100" value={progress} />
  </div>
}

function StudentAssignmentCard({ assignment, userId, onSubmit, onToggleStep, submitting, progress, success, onDismissSuccess }) {
  const [files, setFiles] = useState([])
  const [comment, setComment] = useState('')
  const [draftError, setDraftError] = useState('')
  const [draftRestored, setDraftRestored] = useState(false)
  const canResubmit = assignment.allowResubmission !== false
  const draftId = `${userId || 'student'}:${assignment.id}`
  const submission = assignment.submission
  const submitted = assignment.submissionStatus !== 'pending'
  const canSubmit = assignment.status === 'published' && (!submitted || canResubmit)

  useEffect(() => {
    let active = true
    getAssignmentDraft(draftId).then((draft) => {
      if (!active || !draft) return
      setComment(draft.comment || '')
      setFiles(draft.files || [])
      setDraftRestored(Boolean(draft.comment || draft.files?.length))
    }).catch((error) => {
      if (active) setDraftError(error.message)
    })
    return () => { active = false }
  }, [draftId])

  function updateDraft(nextComment, nextFiles) {
    setComment(nextComment)
    setFiles(nextFiles)
    saveAssignmentDraft(draftId, nextComment, nextFiles)
      .then(() => setDraftError(''))
      .catch((error) => setDraftError(error.message))
  }

  function chooseSubmissionFiles(event) {
    const selected = [...event.target.files]
    if (selected.length > 5 || selected.some((file) => file.size > 10 * 1024 * 1024)) {
      setDraftError('Choose up to 5 files, each no larger than 10 MB.')
      event.target.value = ''
      return
    }
    updateDraft(comment, selected)
  }

  async function submit(event) {
    event.preventDefault()
    if (await onSubmit(assignment, files, comment)) {
      setFiles([])
      setComment('')
      setDraftRestored(false)
      clearAssignmentDraft(draftId).catch((error) => setDraftError(error.message))
    }
  }

  return <Card className="assignment-student-card">
    <div className="assignment-card-header">
      <div className="assignment-card-title"><span className="assignment-icon"><BookOpen size={18} /></span><div><h2>{assignment.title}</h2><p>{assignment.subject} <span>·</span> {assignment.className}</p></div></div>
      <Status value={assignment.submissionStatus} />
    </div>
    <div className="assignment-facts">
      <span><strong>Teacher</strong>{assignment.teacher}</span>
      <span><strong>Assigned</strong>{prettyDate(assignment.assignedAt)}</span>
      <span><strong>Deadline</strong>{prettyDate(assignment.dueDate)}</span>
      <span><strong>Maximum marks</strong>{assignment.totalMarks}</span>
    </div>
    {assignment.description && <p className="assignment-description">{assignment.description}</p>}
    {assignment.instructions && <div className="assignment-instructions"><strong>Instructions</strong><p>{assignment.instructions}</p></div>}
    <div className="assignment-reference"><strong>Reference files</strong><FileLinks files={assignment.attachments} preview /></div>

    {submission && <div className="assignment-submission-summary">
      <div className="assignment-summary-heading"><strong>Your submission</strong><span>{prettyDate(submission.submittedAt, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
      {submission.submissionText && <p>{submission.submissionText}</p>}
      <FileLinks files={submission.attachments} preview />
      {submission.history?.length > 0 && <details className="assignment-version-history"><summary>Previous versions ({submission.history.length})</summary>{submission.history.map((version, index) => <div key={`${version.submittedAt}-${index}`}><strong>Version {submission.history.length - index} · {prettyDate(version.submittedAt)}</strong><FileLinks files={version.attachments} preview />{version.feedback && <p>{version.feedback}</p>}</div>)}</details>}
      {(submission.marksObtained != null || submission.feedback) && <div className="assignment-feedback">
        {submission.marksObtained != null && <strong>Marks: {submission.marksObtained} / {assignment.totalMarks}</strong>}
        {submission.feedback && <p><b>Teacher feedback / remarks</b><br />{submission.feedback}</p>}
      </div>}
      {submission.nextSteps?.length > 0 && <div className="assignment-revision-steps"><strong>Your next steps</strong>{submission.nextSteps.map((step, index) => <label key={`${index}-${step.text}`}><input type="checkbox" checked={step.completed} onChange={(event) => onToggleStep(assignment, index, event.target.checked)} /> <span className={step.completed ? 'assignment-step-complete' : ''}>{step.text}</span></label>)}</div>}
    </div>}

    {success && <p className="assignment-success" role="status"><Check size={15} /> Submission saved successfully. Your teacher can now review it.<button type="button" onClick={onDismissSuccess} aria-label="Dismiss confirmation">×</button></p>}
    {canSubmit && <form className="assignment-submit-form" onSubmit={submit}>
      <h3>{submitted ? 'Resubmit your work' : 'Submit your work'}</h3>
      {submitted && <p className="assignment-muted">Resubmitting replaces the current version and keeps the previous version in the submission history.</p>}
      <label className="assignment-file-picker"><Upload size={16} /><span>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose files to upload'}</span>
        <input type="file" accept={acceptedFiles} multiple required={!submitted && !files.length} onChange={chooseSubmissionFiles} disabled={submitting || (submitted && !canResubmit)} />
      </label>
      {files.length > 0 && <ul className="assignment-selected-files">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
      <label className="assignment-comment">Comment (optional)<textarea value={comment} onChange={(event) => updateDraft(event.target.value, files)} maxLength={20000} placeholder="Add a note for your teacher..." disabled={submitting} /></label>
      {draftRestored && <p className="assignment-muted">Your unsent draft was restored from this device.</p>}
      {draftError && <p className="assignment-inline-error" role="alert">{draftError}</p>}
      <UploadProgress progress={progress?.value ?? null} fileName={progress?.fileName} />
      <div className="assignment-submit-footer"><span>PDF, DOC, DOCX, PPT, PPTX, ZIP or image · max 10 MB per file</span><Button type="submit" disabled={submitting || (submitted && !canResubmit) || !files.length}><Send size={14} />{submitting ? 'Uploading…' : submitted ? 'Resubmit assignment' : 'Submit assignment'}</Button></div>
    </form>}
    {submitted && !canResubmit && assignment.status === 'published' && <p className="assignment-muted">Resubmissions are disabled for this assignment.</p>}
    {assignment.status === 'closed' && <p className="assignment-muted">This assignment is closed and no longer accepts submissions.</p>}
  </Card>
}

function TeacherAssignmentForm({ options, saving, progress, error, onClose, onSave }) {
  const [title, setTitle] = useState('')
  const [classId, setClassId] = useState(options.classes[0]?._id || '')
  const [subjectId, setSubjectId] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [totalMarks, setTotalMarks] = useState(100)
  const [allowResubmission, setAllowResubmission] = useState(true)
  const [targetStudents, setTargetStudents] = useState([])
  const [allStudents, setAllStudents] = useState(true)
  const [files, setFiles] = useState([])

  const subjects = options.subjects.filter((item) => String(item.classId) === String(classId))
  const students = options.students.filter((item) => String(item.classId) === String(classId))
  function changeClass(nextClassId) {
    setClassId(nextClassId)
    setSubjectId('')
    setTargetStudents([])
    setAllStudents(true)
  }
  function toggleStudent(id) {
    setAllStudents(false)
    setTargetStudents((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }
  async function submit(event) {
    event.preventDefault()
    await onSave({
      title, classId, subjectId, description, instructions, dueDate,
      totalMarks: Number(totalMarks), allowResubmission,
      targetStudents: allStudents ? [] : targetStudents,
      files,
    })
  }

  return <form className="assignment-create-form" onSubmit={submit}>
    {error && <p className="auth-notice" role="alert">{error}</p>}
    <div className="assignment-form-grid">
      <label>Assignment title<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={200} /></label>
      <label>Class<select value={classId} onChange={(event) => changeClass(event.target.value)} required><option value="">Choose a class</option>{options.classes.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.section}</option>)}</select></label>
      <label>Subject<select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} required><option value="">Choose a subject</option>{subjects.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></label>
      <label>Deadline<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label>
      <label>Maximum marks<input type="number" value={totalMarks} onChange={(event) => setTotalMarks(event.target.value)} min="1" max="100000" required /></label>
    </div>
    <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} placeholder="What will students learn or complete?" /></label>
    <label>Instructions<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={10000} placeholder="Share requirements, format, or submission guidance..." /></label>
    <div className="assignment-targets">
      <div><strong>Assign to students</strong><span>Choose specific students or assign to the whole class.</span></div>
      <label className="assignment-checkbox"><input type="checkbox" checked={allStudents} onChange={(event) => { setAllStudents(event.target.checked); if (event.target.checked) setTargetStudents([]) }} /> Entire class ({students.length})</label>
      {!allStudents && <div className="assignment-student-checks">{students.map((student) => <label key={student.id} className="assignment-checkbox"><input type="checkbox" checked={targetStudents.includes(student.id)} onChange={() => toggleStudent(student.id)} />{student.name}{student.rollNumber ? ` · ${student.rollNumber}` : ''}</label>)}</div>}
      {!allStudents && targetStudents.length === 0 && <span className="assignment-inline-error">Select at least one student or choose the entire class.</span>}
    </div>
    <label className="assignment-checkbox"><input type="checkbox" checked={allowResubmission} onChange={(event) => setAllowResubmission(event.target.checked)} /> Allow students to resubmit their work</label>
    <label>Reference files<input type="file" accept={acceptedFiles} multiple onChange={(event) => setFiles([...event.target.files])} disabled={saving} /></label>
    {files.length > 0 && <ul className="assignment-selected-files">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}
    <UploadProgress progress={progress?.value ?? null} fileName={progress?.fileName} />
    <div className="modal-actions"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !allStudents && targetStudents.length === 0 || !classId || !subjectId}>{saving ? 'Publishing…' : 'Publish assignment'}</Button></div>
  </form>
}

function ReviewForm({ row, totalMarks, saving, suggesting, error, onClose, onSave, onSuggest }) {
  const [status, setStatus] = useState(row.submission?.marksObtained == null ? 'reviewed' : 'graded')
  const [marks, setMarks] = useState(row.submission?.marksObtained ?? '')
  const [feedback, setFeedback] = useState(row.submission?.feedback || '')
  const [nextSteps, setNextSteps] = useState(row.submission?.nextSteps || [])
  function submit(event) {
    event.preventDefault()
    onSave({
      status,
      ...(marks !== '' ? { marksObtained: Number(marks) } : {}),
      feedback,
      nextSteps,
    })
  }
  return <form className="assignment-review-form" onSubmit={submit}>
    {error && <p className="auth-notice" role="alert">{error}</p>}
    <p>Reviewing <strong>{row.student.name}</strong>{row.student.rollNumber ? ` · ${row.student.rollNumber}` : ''}</p>
    <label>Evaluation status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="reviewed">Reviewed</option><option value="graded">Graded</option></select></label>
    <label>Marks (out of {totalMarks})<input type="number" value={marks} onChange={(event) => setMarks(event.target.value)} min="0" max={totalMarks} step="0.5" required={status === 'graded'} /></label>
    <label>Feedback / remarks<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={5000} placeholder="Share helpful feedback with the student..." /></label>
    <div className="assignment-ai-suggestion"><Button type="button" variant="outline" disabled={suggesting || feedback.trim().length < 5} onClick={async () => {
      const suggestions = await onSuggest(feedback)
      if (suggestions) setNextSteps(suggestions)
    }}><Sparkles size={14} />{suggesting ? 'Drafting steps…' : 'Draft next steps with AI'}</Button><span>Gemini receives the assignment title, subject, and feedback text; uploaded files are not analyzed. Review and edit before sharing.</span></div>
    {nextSteps.length > 0 && <div className="assignment-suggestion-list"><strong>Student revision checklist</strong>{nextSteps.map((step, index) => <label key={`${index}-${step.text}`}><input value={step.text} required minLength={5} maxLength={500} onChange={(event) => setNextSteps((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /><button type="button" aria-label="Remove revision step" onClick={() => setNextSteps((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></label>)}<Button type="button" variant="outline" onClick={() => setNextSteps((current) => [...current, { text: '', completed: false }])} disabled={nextSteps.length >= 5}>Add step</Button></div>}
    <div className="modal-actions"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save evaluation'}</Button></div>
  </form>
}

export default function AssignmentsPage({ user }) {
  const teacher = user.role === 'Teacher' || user.role === 'Admin'
  const canCreate = user.role === 'Teacher'
  const [assignments, setAssignments] = useState([])
  const [options, setOptions] = useState({ classes: [], subjects: [], students: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [reviewTarget, setReviewTarget] = useState(null)
  const [suggestingSteps, setSuggestingSteps] = useState(false)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const result = await portalApi.assignmentWorkspace()
      setAssignments(result.data)
      setOptions(result.options || { classes: [], subjects: [], students: [] })
      setSelectedId((current) => current && result.data.some((item) => item.id === current) ? current : '')
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(false) }, [load])
  useEffect(() => {
    if (!teacher) return undefined
    const timer = window.setInterval(() => load(false), 15000)
    return () => window.clearInterval(timer)
  }, [teacher, load])

  const filteredAssignments = useMemo(() => assignments.filter((item) => (
    (!classFilter || String(item.classId) === classFilter)
    && (!subjectFilter || String(item.subjectId) === subjectFilter)
    && (!assignmentFilter || item.id === assignmentFilter)
    && `${item.title} ${item.subject} ${item.className} ${item.teacher}`.toLowerCase().includes(search.toLowerCase())
  )), [assignments, classFilter, subjectFilter, assignmentFilter, search])
  const selectedAssignment = filteredAssignments.find((item) => item.id === selectedId) || filteredAssignments[0]
  const visibleRows = selectedAssignment?.submissions?.filter((row) => statusFilter === 'all' || row.status === statusFilter) || []

  async function uploadFiles(files, label) {
    const uploaded = []
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const result = await portalApi.uploadAssignmentFile(file, (value) => {
        setProgress({ value: Math.round((index * 100 + value) / files.length), fileName: file.name, label })
      })
      uploaded.push(result.id)
    }
    return uploaded
  }

  async function publishAssignment(record) {
    setSaving(true)
    setError('')
    setProgress(null)
    try {
      const attachments = await uploadFiles(record.files, 'reference')
      await portalApi.createAssignment({ ...record, files: undefined, attachments })
      setCreateOpen(false)
      setSuccess('Assignment published. Students in the selected class can now see it.')
      await load(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  async function submitStudentWork(assignment, files, comment) {
    if (!files.length) return
    setSaving(true)
    setError('')
    setProgress(null)
    try {
      const attachments = await uploadFiles(files, 'submission')
      await portalApi.submitAssignmentFiles(assignment.id, { attachments, submissionText: comment })
      setSuccess(`Your work for “${assignment.title}” was submitted.`)
      await load(false)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setSaving(false)
      setProgress(null)
    }
  }

  async function saveReview(body) {
    if (!reviewTarget?.submission?.id) return
    setSaving(true)
    setError('')
    try {
      await portalApi.evaluateAssignmentSubmission(reviewTarget.submission.id, body)
      setReviewTarget(null)
      setSuccess(`Evaluation saved for ${reviewTarget.student.name}.`)
      await load(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function suggestRevisionSteps(feedback) {
    if (!reviewTarget?.submission?.id) return
    setSuggestingSteps(true)
    setError('')
    try {
      const result = await portalApi.suggestAssignmentNextSteps({
        submissionId: reviewTarget.submission.id,
        feedback,
      })
      return result.data.nextSteps
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setSuggestingSteps(false)
    }
  }

  async function toggleRevisionStep(assignment, index, completed) {
    if (!assignment.submission?.id) return
    setError('')
    try {
      await portalApi.updateRevisionStep(assignment.submission.id, index, completed)
      await load(false)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const classOptions = teacher
    ? options.classes
    : [...new Map(assignments.map((item) => [String(item.classId), { _id: item.classId, name: item.className }])).values()]
  const subjectOptions = teacher
    ? options.subjects
    : [...new Map(assignments.map((item) => [String(item.subjectId), { _id: item.subjectId, name: item.subject }])).values()]

  return <>
    <PageHeading teacher={teacher} canCreate={canCreate} loading={loading} onRefresh={() => load()} onCreate={() => { setError(''); setCreateOpen(true) }} />
    {error && <p className="auth-notice assignment-page-error" role="alert">{error}<button onClick={() => load()} type="button">Retry</button></p>}
    {success && <p className="assignment-success assignment-page-success" role="status"><Check size={15} />{success}<button type="button" onClick={() => setSuccess('')} aria-label="Dismiss notification">×</button></p>}

    {teacher && <Card className="assignment-filters">
      <label><Search size={15} /><input aria-label="Search assignments" placeholder="Search assignments..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <select aria-label="Filter by class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">All classes</option>{classOptions.map((item) => <option key={item._id} value={item._id}>{item.name}{item.section ? ` · ${item.section}` : ''}</option>)}</select>
      <select aria-label="Filter by subject" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">All subjects</option>{subjectOptions.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select>
      <select aria-label="Filter by assignment" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value)}><option value="">All assignments</option>{assignments.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    </Card>}

    {loading && !assignments.length ? <Card className="assignment-empty"><p role="status">Loading assignments…</p></Card>
      : !filteredAssignments.length ? <Card className="assignment-empty"><span className="assignment-empty-icon"><FileText size={22} /></span><h2>{teacher ? 'No assignments to show yet' : 'You’re all caught up'}</h2><p>{teacher ? 'Create and publish an assignment to get started.' : 'New work from your teachers will appear here.'}</p></Card>
        : teacher ? <div className="assignment-workspace">
          <Card className="assignment-list-card">
            <div className="assignment-list-heading"><div><h2>Class assignments</h2><p>{filteredAssignments.length} published</p></div></div>
            <div className="assignment-list">{filteredAssignments.map((item) => <button key={item.id} type="button" className={`assignment-list-item ${selectedAssignment?.id === item.id ? 'assignment-list-active' : ''}`} onClick={() => setSelectedId(item.id)}>
              <span className="assignment-icon"><BookOpen size={16} /></span><span className="assignment-list-copy"><strong>{item.title}</strong><small>{item.subject} · {item.className}</small><span className="assignment-progress-track"><i style={{ width: `${item.counts.progress}%` }} /></span><small>{item.counts.submitted} / {item.counts.assigned} submitted</small></span><span className="assignment-list-date">{prettyDate(item.dueDate, { month: 'short', day: 'numeric' })}</span>
            </button>)}</div>
          </Card>
          {selectedAssignment && <section className="assignment-detail-column">
            <Card className="assignment-detail-card">
              <div className="assignment-detail-heading"><div><p className="page-eyebrow">{selectedAssignment.subject} · {selectedAssignment.className}</p><h2>{selectedAssignment.title}</h2><p>Due {prettyDate(selectedAssignment.dueDate)} · {selectedAssignment.totalMarks} marks</p></div><StatusBadge tone="blue">{selectedAssignment.counts.progress}% complete</StatusBadge></div>
              <div className="assignment-count-grid">
                <div><Users size={16} /><span>Assigned</span><strong>{selectedAssignment.counts.assigned}</strong></div>
                <div><Check size={16} /><span>Submitted</span><strong>{selectedAssignment.counts.submitted}</strong></div>
                <div><Clock3 size={16} /><span>Pending</span><strong>{selectedAssignment.counts.pending}</strong></div>
                <div><Clock3 size={16} /><span>Late</span><strong>{selectedAssignment.counts.late}</strong></div>
                <div><Check size={16} /><span>Graded</span><strong>{selectedAssignment.counts.graded}</strong></div>
              </div>
              <div className="assignment-progress-large"><div><span>Submission progress</span><strong>{selectedAssignment.counts.progress}%</strong></div><progress max="100" value={selectedAssignment.counts.progress} /></div>
              {selectedAssignment.description && <p className="assignment-description">{selectedAssignment.description}</p>}
              {selectedAssignment.instructions && <div className="assignment-instructions"><strong>Instructions</strong><p>{selectedAssignment.instructions}</p></div>}
              <div className="assignment-reference"><strong>Reference files</strong><FileLinks files={selectedAssignment.attachments} preview /></div>
            </Card>
            <Card className="assignment-submissions-card">
              <div className="assignment-list-heading"><div><h2>Student submissions</h2><p>Review work and record marks and feedback.</p></div><select aria-label="Filter submissions by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="submitted">Submitted</option><option value="late">Late</option><option value="reviewed">Reviewed</option><option value="graded">Graded</option></select></div>
              {!visibleRows.length ? <p className="assignment-empty-row">No students match this status.</p> : <div className="assignment-submission-table-wrap"><table className="assignment-submission-table"><thead><tr><th>STUDENT</th><th>SUBMITTED</th><th>FILE / COMMENT</th><th>STATUS</th><th>RESULT</th><th /></tr></thead><tbody>
                {visibleRows.map((row) => <tr key={row.student.id}><td><strong>{row.student.name}</strong><small>{row.student.rollNumber || row.student.email || 'Student'}</small></td>
                  <td>{row.submission ? prettyDate(row.submission.submittedAt) : '—'}</td>
                  <td>{row.submission ? <><FileLinks files={row.submission.attachments} preview />{row.submission.submissionText && <small className="assignment-row-comment">{row.submission.submissionText}</small>}</> : '—'}</td>
                  <td><Status value={row.status} /></td>
                  <td>{row.submission?.marksObtained != null ? `${row.submission.marksObtained} / ${selectedAssignment.totalMarks}` : '—'}</td>
                  <td>{row.submission && <Button variant="outline" onClick={() => setReviewTarget(row)}>{row.status === 'graded' || row.status === 'reviewed' ? 'Edit review' : 'Evaluate'}</Button>}</td>
                </tr>)}
              </tbody></table></div>}
            </Card>
          </section>}
        </div>
        : <div className="assignment-student-list">{filteredAssignments.map((item) => <StudentAssignmentCard key={item.id} assignment={item} userId={user.id || user._id} onSubmit={submitStudentWork} onToggleStep={toggleRevisionStep} submitting={saving} progress={progress} success={success.includes(item.title) ? success : ''} onDismissSuccess={() => setSuccess('')} />)}</div>}

    <Modal open={createOpen} onClose={() => !saving && setCreateOpen(false)} title="Create an assignment" description="Share clear instructions and class materials with your students." wide>
      {!options.classes.length ? <div className="assignment-empty"><p>No classes are assigned to your teacher account yet. Ask an administrator to update your profile.</p></div>
        : <TeacherAssignmentForm options={options} saving={saving} progress={progress} error={error} onClose={() => setCreateOpen(false)} onSave={publishAssignment} />}
    </Modal>
    <Modal open={Boolean(reviewTarget)} onClose={() => !saving && setReviewTarget(null)} title="Evaluate submission" description="Save your review to make it visible to the student.">
      {reviewTarget && <ReviewForm row={reviewTarget} totalMarks={selectedAssignment?.totalMarks || 100} saving={saving} suggesting={suggestingSteps} error={error} onClose={() => setReviewTarget(null)} onSave={saveReview} onSuggest={suggestRevisionSteps} />}
    </Modal>
  </>
}

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, BriefcaseBusiness, CalendarDays, Check, Clock3, FileText, MessageCircle, RefreshCw, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { Button, Card, StatusBadge } from '../../components/common/UI.jsx'
import { portalApi } from '../../services/portalService.js'

function prettyDate(value, options = { month: 'short', day: 'numeric' }) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, options) : '—'
}

function HelpRequestForm({ assignment, saving, onSend }) {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  async function submit(event) {
    event.preventDefault()
    if (await onSend(assignment.id, message)) {
      setMessage('')
      setSent(true)
    }
  }
  return <form className="learning-help-form" onSubmit={submit}>
    {sent && <p className="learning-success"><Check size={14} /> Your teacher has been notified.</p>}
    <label htmlFor={`help-${assignment.id}`}>What would help you get started?</label>
    <textarea id={`help-${assignment.id}`} value={message} onChange={(event) => setMessage(event.target.value)} minLength={5} maxLength={1000} placeholder="Share a question or tell your teacher where you’re stuck." required />
    <Button type="submit" variant="outline" disabled={saving || message.trim().length < 5}><MessageCircle size={14} />{saving ? 'Sending…' : 'Ask for help'}</Button>
  </form>
}

function StudentHub({ initialOnline }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [tab, setTab] = useState('week')
  const [online, setOnline] = useState(initialOnline)
  const [reflectionDrafts, setReflectionDrafts] = useState({})

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const result = await portalApi.learningHub()
      setData(result.data)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    portalApi.learningHub().then((result) => {
      if (!active) return
      setData(result.data)
      setError('')
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const assignments = data?.assignments || []
  const portfolio = data?.portfolio || []
  const planItems = data?.plan?.items || []
  const weekDays = (() => {
    if (!data?.weekStarting) return []
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${data.weekStarting}T00:00:00.000Z`)
      date.setUTCDate(date.getUTCDate() + index)
      return date.toISOString().slice(0, 10)
    })
  })()

  async function perform(key, action, message, resultKey = '') {
    setBusy(key)
    setError('')
    setSuccess('')
    try {
      const result = await action()
      if (resultKey && result?.data) setData((current) => ({ ...current, [resultKey]: result.data }))
      else await load(false)
      setSuccess(message)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy('')
    }
  }

  async function addPortfolioItem(assignment) {
    await perform(
      'portfolio',
      () => portalApi.savePortfolioEntry({
        submissionId: assignment.submissionId,
        reflection: reflectionDrafts[assignment.id] || '',
      }),
      'Added to your learning portfolio.',
    )
  }

  async function removePortfolioItem(id) {
    await perform('portfolio-remove', () => portalApi.removePortfolioEntry(id), 'Removed from your portfolio.')
  }

  async function savePortfolioReflection(entry) {
    await perform(
      'portfolio-update',
      () => portalApi.savePortfolioEntry({
        submissionId: entry.submissionId,
        reflection: reflectionDrafts[entry.id] ?? entry.reflection,
      }),
      'Portfolio reflection saved.',
    )
  }

  const portfolioSubmissionIds = new Set(portfolio.map((item) => item.submissionId))
  const portfolioCandidates = assignments.filter((item) => item.submissionId && !portfolioSubmissionIds.has(item.submissionId))

  return <>
    <div className="page-heading learning-hub-heading">
      <div><p className="page-eyebrow">YOUR PROGRESS, YOUR NEXT STEP</p><h1>Learning hub</h1><p className="page-description">A calmer way to plan the week, reflect on your work, and ask for help early.</p></div>
      <Button variant="outline" onClick={() => load()} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
    </div>
    <div className={`learning-connectivity ${online ? 'is-online' : 'is-offline'}`} role="status">{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Online. Assignment drafts on this device are saved for recovery.' : 'You’re offline. Saved assignment drafts stay on this device and can be submitted when you reconnect.'}</div>
    {error && <p className="auth-notice" role="alert">{error}<button type="button" onClick={() => load()}>Retry</button></p>}
    {success && <p className="learning-success" role="status"><Check size={15} />{success}</p>}
    {loading && !data ? <Card className="learning-empty"><p role="status">Loading your learning hub…</p></Card> : data && <>
      <div className="learning-hub-tabs" role="tablist" aria-label="Learning hub sections">
        <button type="button" role="tab" aria-selected={tab === 'week'} className={tab === 'week' ? 'is-active' : ''} onClick={() => setTab('week')}><CalendarDays size={15} /> My week</button>
        <button type="button" role="tab" aria-selected={tab === 'portfolio'} className={tab === 'portfolio' ? 'is-active' : ''} onClick={() => setTab('portfolio')}><BriefcaseBusiness size={15} /> Portfolio <span>{portfolio.length}</span></button>
        <button type="button" role="tab" aria-selected={tab === 'digest'} className={tab === 'digest' ? 'is-active' : ''} onClick={() => setTab('digest')}><Sparkles size={15} /> Weekly digest</button>
      </div>

      {tab === 'week' && <>
        <div className="learning-section-heading"><div><p className="page-eyebrow">A PLAN YOU CAN ADJUST</p><h2>This week</h2><p>{prettyDate(weekDays[0], { month: 'long', day: 'numeric' })} – {prettyDate(weekDays[6], { month: 'long', day: 'numeric', year: 'numeric' })}</p></div><Button onClick={() => perform('plan', () => portalApi.generateWeeklyPlan(), 'Your study plan is ready.', 'plan')} disabled={!online || busy === 'plan' || !assignments.length}><Sparkles size={15} />{busy === 'plan' ? 'Planning…' : data.plan ? 'Refresh study plan' : 'Build my study plan'}</Button></div>
        {!assignments.length ? <Card className="learning-empty"><BookOpen size={22} /><h3>No assignments on your list</h3><p>When your teachers publish work, it will show up here.</p></Card> : <>
          {data.plan && <Card className="learning-plan-summary"><span className="learning-ai-mark"><Sparkles size={16} /></span><div><strong>Suggested plan</strong><p>{data.plan.summary}</p><small>AI suggestions are optional. Adjust the timing to fit your week.</small></div></Card>}
          <div className="learning-week-grid">{weekDays.map((date) => {
            const due = assignments.filter((item) => String(item.dueDate).slice(0, 10) === date && ['pending', 'late'].includes(item.status))
            const planned = planItems.filter((item) => item.date === date)
            return <Card className={`learning-day-card ${due.length >= 3 ? 'learning-day-heavy' : ''}`} key={date}>
              <div className="learning-day-heading"><strong>{prettyDate(date, { weekday: 'short' })}</strong><span>{prettyDate(date)}</span></div>
              {due.length > 0 && <p className="learning-due-alert">{due.length >= 3 ? 'Several deadlines today — consider starting early.' : `${due.length} deadline${due.length === 1 ? '' : 's'} today`}</p>}
              {!due.length && !planned.length && <span className="learning-muted">Clear space</span>}
              {planned.map((item, index) => {
                const assignment = assignments.find((record) => record.id === item.assignmentId)
                return <div className="learning-schedule-item" key={`${item.assignmentId}-${index}`}><span><Clock3 size={13} /> {item.minutes} min</span><strong>{assignment?.title || 'Study session'}</strong><small>{item.focus}</small></div>
              })}
              {due.map((item) => <div className="learning-deadline-item" key={item.id}><FileText size={14} /><span><strong>{item.title}</strong><small>{item.subject} · {item.status}</small></span></div>)}
            </Card>
          })}</div>
        </>}
        <div className="learning-section-heading learning-assignment-heading"><div><h2>Coursework & support</h2><p>Ask a teacher while there’s still time to make a plan together.</p></div></div>
        <div className="learning-task-list">{assignments.map((item) => <Card className="learning-task-card" key={item.id}>
          <div className="learning-task-header"><span className="assignment-icon"><BookOpen size={16} /></span><div><h3>{item.title}</h3><p>{item.subject} · {item.teacher}</p></div><StatusBadge tone={item.status === 'graded' ? 'green' : item.status === 'late' ? 'amber' : 'blue'}>{item.status}</StatusBadge></div>
          <div className="learning-task-detail"><span>Due {prettyDate(item.dueDate, { month: 'short', day: 'numeric', year: 'numeric' })}</span>{item.marksObtained != null && <span>{item.marksObtained} / {item.totalMarks} marks</span>}</div>
          {item.feedback && <p className="learning-feedback">{item.feedback}</p>}
          {item.status === 'pending' && !data.supportRequests.some((request) => request.assignmentId === item.id && request.status === 'open') && <HelpRequestForm assignment={item} saving={!online || busy === `help-${item.id}`} onSend={(assignmentId, message) => {
            setBusy(`help-${assignmentId}`)
            return portalApi.createSupportRequest({ assignmentId, message }).then(() => {
              setSuccess('Your teacher has been notified.')
              return load(false).then(() => true)
            }).catch((requestError) => { setError(requestError.message); return false }).finally(() => setBusy(''))
          }} />}
        </Card>)}</div>
        {data.supportRequests.length > 0 && <section className="learning-support-history"><div className="learning-section-heading"><div><h2>Help requests</h2><p>Private between you and the teacher assigned to the work.</p></div></div>{data.supportRequests.map((item) => <Card key={item.id} className="learning-support-request"><div><strong>{item.assignment}</strong><StatusBadge tone={item.status === 'replied' ? 'green' : 'amber'}>{item.status === 'replied' ? 'Teacher replied' : 'Waiting for reply'}</StatusBadge></div><p>{item.message}</p>{item.responseMessage && <blockquote>{item.responseMessage}</blockquote>}</Card>)}</section>}
      </>}

      {tab === 'portfolio' && <section className="learning-portfolio"><div className="learning-section-heading"><div><p className="page-eyebrow">EVIDENCE OF GROWTH</p><h2>Your learning portfolio</h2><p>Keep work that shows what you learned, not only the score you received.</p></div></div>
        {portfolioCandidates.length > 0 && <Card className="learning-portfolio-add"><h3>Add a piece of work</h3>{portfolioCandidates.map((item) => <form key={item.id} onSubmit={(event) => { event.preventDefault(); addPortfolioItem(item) }}><label><strong>{item.title}</strong><span>{item.subject} · {item.status}</span><textarea value={reflectionDrafts[item.id] || ''} maxLength={2000} onChange={(event) => setReflectionDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="What are you proud of? What would you improve next time?" /></label><Button type="submit" variant="outline" disabled={busy === 'portfolio'}><BriefcaseBusiness size={14} />Save to portfolio</Button></form>)}</Card>}
        {!portfolio.length ? <Card className="learning-empty"><BriefcaseBusiness size={22} /><h3>Your portfolio starts with one good example</h3><p>Save a reviewed submission above and add a short reflection about what you learned.</p></Card> : <div className="learning-portfolio-grid">{portfolio.map((item) => <Card className="learning-portfolio-card" key={item.id}><div className="learning-portfolio-title"><span className="learning-ai-mark"><BookOpen size={16} /></span><div><h3>{item.assignment?.title || 'Assignment'}</h3><p>{item.assignment?.subject} · Added {prettyDate(item.createdAt)}</p></div></div>{item.marksObtained != null && <p className="learning-portfolio-mark">Result: {item.marksObtained} / {item.assignment?.totalMarks}</p>}{item.feedback && <p className="learning-feedback"><strong>Teacher feedback</strong><br />{item.feedback}</p>}{item.files?.map((file) => <a className="learning-file-link" key={file.id} href={file.url} target="_blank" rel="noreferrer"><FileText size={14} />{file.name}</a>)}<label className="learning-reflection-edit">Your reflection<textarea value={reflectionDrafts[item.id] ?? item.reflection} onChange={(event) => setReflectionDrafts((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} placeholder="What did you learn from this work?" /></label><Button variant="outline" onClick={() => savePortfolioReflection(item)} disabled={busy === 'portfolio-update'}>Save reflection</Button><Button variant="outline" onClick={() => removePortfolioItem(item.id)} disabled={busy === 'portfolio-remove'}>Remove from portfolio</Button></Card>)}</div>}
      </section>}

      {tab === 'digest' && <section className="learning-digest"><div className="learning-section-heading"><div><p className="page-eyebrow">A HUMAN-SIZED RECAP</p><h2>Your weekly digest</h2><p>One calm summary of deadlines, school updates, and what to focus on next.</p></div><Button onClick={() => perform('digest', () => portalApi.generateWeeklyDigest(), 'Your weekly digest is ready.', 'digest')} disabled={!online || busy === 'digest'}><Sparkles size={15} />{busy === 'digest' ? 'Writing…' : data.digest ? 'Refresh digest' : 'Create my digest'}</Button></div>
        {data.digest ? <Card className="learning-digest-card"><div className="learning-digest-meta"><span><Sparkles size={15} /> Acadex AI · Generated {prettyDate(data.digest.generatedAt, { month: 'long', day: 'numeric' })}</span><small>Based on your assignments and school announcements.</small></div><p>{data.digest.content}</p></Card> : <Card className="learning-empty"><Sparkles size={22} /><h3>Your week, without the noise</h3><p>Create a short summary from your current assignments and school announcements.</p></Card>}
        {data.announcements.length > 0 && <div className="learning-announcements"><h3>This week at school</h3>{data.announcements.map((item) => <Card key={item._id}><strong>{item.title}</strong><p>{item.content}</p><small>{prettyDate(item.publishedAt, { month: 'short', day: 'numeric' })}</small></Card>)}</div>}
        <p className="learning-privacy-note">Gemini receives assignment deadlines and statuses, marks, teacher feedback, and announcement titles to draft this digest; uploaded files and announcement content are not sent. AI suggestions are not a grade, diagnosis, or substitute for your teacher’s guidance.</p>
      </section>}
    </>}
  </>
}

function TeacherSupport({ initialOnline }) {
  const [requests, setRequests] = useState([])
  const [workload, setWorkload] = useState([])
  const [replies, setReplies] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [online, setOnline] = useState(initialOnline)

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const [supportResult, workloadResult] = await Promise.all([
        portalApi.supportRequests(),
        portalApi.classWorkload(),
      ])
      setRequests(supportResult.data)
      setWorkload(workloadResult.data)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([portalApi.supportRequests(), portalApi.classWorkload()])
      .then(([supportResult, workloadResult]) => {
        if (!active) return
        setRequests(supportResult.data)
        setWorkload(workloadResult.data)
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function reply(requestId) {
    setBusy(requestId)
    setError('')
    try {
      await portalApi.respondToSupportRequest(requestId, { responseMessage: replies[requestId] || '' })
      setReplies((current) => ({ ...current, [requestId]: '' }))
      await load()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy('')
    }
  }

  return <>
    <div className="page-heading learning-hub-heading"><div><p className="page-eyebrow">SUPPORT BEFORE A SMALL PROBLEM GROWS</p><h1>Student support</h1><p className="page-description">See help requests from students in the classes you teach, and reply with a practical next step.</p></div><Button variant="outline" onClick={load} disabled={loading}><RefreshCw size={15} /> Refresh</Button></div>
    <div className={`learning-connectivity ${online ? 'is-online' : 'is-offline'}`} role="status">{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Connected to your school workspace.' : 'You’re offline. Replies will be available when you reconnect.'}</div>
    {error && <p className="auth-notice" role="alert">{error}</p>}
    <section className="learning-teacher-workload"><div className="learning-section-heading"><div><p className="page-eyebrow">CLASS-WIDE, NOT STUDENT-BY-STUDENT</p><h2>Upcoming workload</h2><p>Submission counts help you spot deadline clusters without exposing individual student activity.</p></div></div>{!workload.length ? <Card className="learning-empty"><p>No published assignments are due in the next 30 days.</p></Card> : <div className="learning-workload-grid">{workload.map((item) => <Card key={item.id} className="learning-workload-card"><div><span className="assignment-icon"><CalendarDays size={16} /></span><StatusBadge tone={item.pending ? 'amber' : 'green'}>{item.pending} pending</StatusBadge></div><h3>{item.title}</h3><p>{item.className} · {item.subject}</p><small>Due {prettyDate(item.dueDate, { month: 'short', day: 'numeric' })}</small><div className="assignment-progress-track"><i style={{ width: `${item.assigned ? Math.round(item.submitted * 100 / item.assigned) : 0}%` }} /></div><small>{item.submitted} of {item.assigned} submitted</small></Card>)}</div>}</section>
    {loading ? <Card className="learning-empty"><p role="status">Loading student requests…</p></Card> : !requests.length ? <Card className="learning-empty"><MessageCircle size={22} /><h2>No help requests</h2><p>Requests from your assigned students will appear here.</p></Card> : <div className="learning-support-grid">{requests.map((item) => <Card className="learning-support-request" key={item.id}><div className="learning-support-header"><div><strong>{item.student}{item.rollNumber ? ` · ${item.rollNumber}` : ''}</strong><p>{item.assignment}</p></div><StatusBadge tone={item.status === 'replied' ? 'green' : 'amber'}>{item.status === 'replied' ? 'Replied' : 'Needs a reply'}</StatusBadge></div><blockquote>{item.message}</blockquote><small>Sent {prettyDate(item.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</small>{item.responseMessage && <p className="learning-teacher-reply"><strong>Your reply</strong><br />{item.responseMessage}</p>}<label className="learning-reply-form">Reply to student<textarea value={replies[item.id] ?? (item.status === 'replied' ? item.responseMessage : '')} onChange={(event) => setReplies((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} minLength={5} placeholder="Offer one clear, supportive next step." /></label><Button onClick={() => reply(item.id)} disabled={!online || busy === item.id || (replies[item.id] ?? item.responseMessage ?? '').trim().length < 5}>{busy === item.id ? 'Sending…' : item.status === 'replied' ? 'Update reply' : 'Send reply'}</Button></Card>)}</div>}
  </>
}

function ParentDigest({ initialOnline }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [online, setOnline] = useState(initialOnline)

  const load = useCallback(async (studentId = '', showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const result = await portalApi.parentWeeklyDigest(studentId)
      setData(result.data)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    portalApi.parentWeeklyDigest().then((result) => {
      if (active) {
        setData(result.data)
        setError('')
      }
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function generateDigest() {
    if (!data?.selectedStudentId) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      await portalApi.generateParentWeeklyDigest(data.selectedStudentId)
      await load(data.selectedStudentId, false)
      setSuccess('Your child’s weekly digest is ready.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  return <>
    <div className="page-heading learning-hub-heading">
      <div><p className="page-eyebrow">A CLEARER VIEW OF THE WEEK</p><h1>Weekly digest</h1><p className="page-description">A calm recap of your child’s assignments, feedback, and school updates.</p></div>
      <Button variant="outline" onClick={() => load(data?.selectedStudentId || '')} disabled={loading}><RefreshCw size={15} /> Refresh</Button>
    </div>
    <div className={`learning-connectivity ${online ? 'is-online' : 'is-offline'}`} role="status">{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? 'Connected to your school workspace.' : 'You’re offline. Reconnect to load or generate the latest digest.'}</div>
    {error && <p className="auth-notice" role="alert">{error}<button type="button" onClick={() => load(data?.selectedStudentId || '')}>Retry</button></p>}
    {success && <p className="learning-success" role="status"><Check size={15} />{success}</p>}
    {loading && !data ? <Card className="learning-empty"><p role="status">Loading your family digest…</p></Card> : data && <>
      {data.children.length > 0 && <div className="learning-section-heading">
        <div><p className="page-eyebrow">FAMILY VIEW</p><h2>This week</h2><p>Only children linked to your parent account are available here.</p></div>
        <label className="learning-reply-form">Child
          <select value={data.selectedStudentId} onChange={(event) => load(event.target.value)} disabled={loading}>
            {data.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
        </label>
      </div>}
      {!data.children.length ? <Card className="learning-empty"><BookOpen size={22} /><h2>No linked student profiles</h2><p>Contact your school administrator to connect your parent account with a student profile.</p></Card> : <>
        <div className="learning-section-heading">
          <div><p className="page-eyebrow">A HUMAN-SIZED RECAP</p><h2>{data.children.find((child) => child.id === data.selectedStudentId)?.name || 'Your child'}’s weekly digest</h2><p>Upcoming work, teacher feedback, and school updates in one place.</p></div>
          <Button onClick={generateDigest} disabled={!online || busy || !data.selectedStudentId}><Sparkles size={15} />{busy ? 'Writing…' : data.digest ? 'Refresh digest' : 'Create digest'}</Button>
        </div>
        {data.digest ? <Card className="learning-digest-card"><div className="learning-digest-meta"><span><Sparkles size={15} /> Acadex AI · Generated {prettyDate(data.digest.generatedAt, { month: 'long', day: 'numeric' })}</span><small>Based on this child’s assignments and school announcements.</small></div><p>{data.digest.content}</p></Card> : <Card className="learning-empty"><Sparkles size={22} /><h3>A useful recap, without the noise</h3><p>Create a short summary of your child’s assignments, recent feedback, and school announcements.</p></Card>}
        <p className="learning-privacy-note">Gemini receives this child’s assignment deadlines and statuses, marks, teacher feedback, and announcement titles to draft the digest. Uploaded files and other children’s records are not sent. Use this recap to support a conversation, not as a judgment of ability.</p>
      </>}
    </>}
  </>
}

export default function LearningHubPage({ user }) {
  const [online] = useState(() => navigator.onLine)
  if (user.role === 'Teacher') return <TeacherSupport initialOnline={online} />
  if (user.role === 'Student') return <StudentHub initialOnline={online} />
  if (user.role === 'Parent') return <ParentDigest initialOnline={online} />
  return <Card className="learning-empty"><h2>Learning Hub is not available for this account</h2><p>Sign in as a student or teacher to open this section.</p></Card>
}

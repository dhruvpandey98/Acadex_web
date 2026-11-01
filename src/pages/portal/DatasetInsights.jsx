import { useEffect, useState } from 'react'
import { AlertTriangle, BookOpen, ChevronLeft, ChevronRight, Database, GraduationCap, Search, Users } from 'lucide-react'
import { Button, Card, StatusBadge } from '../../components/common/UI.jsx'
import { portalApi } from '../../services/portalService.js'

function PageHeading({ title, description }) {
  return <div className="page-heading"><div><p className="page-eyebrow">SYNTHETIC DATASET</p><h1>{title}</h1><p className="page-description">{description}</p></div></div>
}

function Metric({ label, value, detail, icon: Icon }) {
  return <Card className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon metric-purple"><Icon size={17} /></span></div><div className="metric-value">{value}</div><div className="metric-foot"><span>{detail}</span></div></Card>
}

export default function DatasetInsights() {
  const [data, setData] = useState(null)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    portalApi.datasetInsights({ page, search }).then((response) => {
      if (active) setData(response.data)
    }).catch((requestError) => {
      if (active) setError(requestError.message)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [page, search, reload])

  function submitSearch(event) {
    event.preventDefault()
    setPage(1)
    setSearch(query.trim())
  }

  const summary = data?.summary
  const pagination = data?.pagination
  const totalRecords = data?.collections?.reduce((total, item) => total + item.count, 0) || 0

  return <>
    <PageHeading title="Dataset insights" description="Explore aggregate learning indicators from the isolated synthetic dataset." />
    <p className="dataset-notice"><Database size={15} /> This demo dataset is separate from live school records. Student health time-series are not shown here.</p>
    {error && <p className="auth-notice" role="alert">{error} <button type="button" onClick={() => setReload((current) => current + 1)}>Retry</button></p>}
    {summary && <div className="metric-grid compact-metrics">
      <Metric label="Dataset students" value={summary.students} detail="Synthetic profiles" icon={Users} />
      <Metric label="Classes" value={summary.classes} detail={`${totalRecords.toLocaleString()} total dataset rows`} icon={BookOpen} />
      <Metric label="At risk" value={summary.atRisk} detail={summary.students ? `${Math.round(summary.atRisk * 100 / summary.students)}% of profiles` : 'No profiles'} icon={AlertTriangle} />
      <Metric label="Average exam score" value={summary.averageExamScore == null ? '—' : `${summary.averageExamScore}%`} detail={summary.averageAttendance == null ? 'Attendance unavailable' : `${summary.averageAttendance}% average attendance`} icon={GraduationCap} />
    </div>}

    <Card className="table-card dataset-students-card">
      <div className="card-heading"><div><h2>Student overview</h2><p>Search by name, student ID, or class</p></div></div>
      <form className="table-toolbar" onSubmit={submitSearch}>
        <label className="table-search"><Search size={16} /><input aria-label="Search synthetic students" placeholder="Search students..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <Button type="submit" variant="outline" disabled={loading}>Search</Button>
      </form>
      <div className="table-scroll">
        <table>
          <thead><tr><th>STUDENT</th><th>CLASS</th><th>ATTENDANCE</th><th>EXAM SCORE</th><th>INDICATOR</th></tr></thead>
          <tbody>
            {loading && <tr><td className="empty-row" colSpan="5">Loading dataset insights…</td></tr>}
            {!loading && !error && data?.students.length === 0 && <tr><td className="empty-row" colSpan="5">{summary?.students ? 'No matching students found.' : 'No dataset rows yet. Import the dataset to populate this page.'}</td></tr>}
            {!loading && data?.students.map((student) => <tr key={student.studentId}>
              <td><span className="dataset-student"><strong>{student.name || 'Unnamed student'}</strong><small>{student.studentId}</small></span></td>
              <td>{student.classLabel}</td>
              <td>{student.attendance == null ? '—' : `${student.attendance}%`}</td>
              <td>{student.examScore == null ? '—' : `${student.examScore}%`}</td>
              <td><StatusBadge tone={student.atRisk ? 'amber' : 'green'}>{student.atRisk ? 'At risk' : 'On track'}</StatusBadge></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="table-bottom">
        <span>{pagination ? `Showing ${pagination.total ? (pagination.page - 1) * pagination.limit + 1 : 0}–${Math.min(pagination.page * pagination.limit, pagination.total)} of ${pagination.total}` : 'Dataset records'}</span>
        <div>
          <button type="button" aria-label="Previous page" disabled={loading || !pagination || pagination.page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /></button>
          <button type="button" className="pagination-current" disabled>{pagination?.page || 1}</button>
          <button type="button" aria-label="Next page" disabled={loading || !pagination || pagination.page >= pagination.pages} onClick={() => setPage((current) => current + 1)}><ChevronRight size={15} /></button>
        </div>
      </div>
    </Card>

    {data?.classes.length > 0 && <Card className="table-card dataset-class-card">
      <div className="card-heading"><div><h2>Class summary</h2><p>Aggregated student counts and scores by class</p></div></div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>CLASS</th><th>STUDENTS</th><th>AT RISK</th><th>AVERAGE EXAM SCORE</th></tr></thead>
          <tbody>{data.classes.map((item) => <tr key={item.classId || item.classLabel}>
            <td><strong>{item.classLabel}</strong></td><td>{item.students}</td><td>{item.atRisk}</td>
            <td>{item.averageExamScore == null ? '—' : `${item.averageExamScore}%`}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>}

    {data?.collections && <Card className="table-card dataset-collections-card">
      <div className="card-heading"><div><h2>Imported tables</h2><p>MongoDB collections isolated from the school records</p></div></div>
      <div className="dataset-collection-list">{data.collections.map((item) => <div key={item.table}><span>{item.table.replaceAll('_', ' ')}</span><strong>{item.count.toLocaleString()}</strong></div>)}</div>
    </Card>}
  </>
}

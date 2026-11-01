import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, BookOpen, CalendarDays, ChevronDown, ChevronLeft, Database, GraduationCap, LayoutDashboard, LogOut, Menu, MessageSquare, Search, Settings, Users, X } from 'lucide-react'
import { useApp } from '../../hooks/useApp.js'
import { navigationByRole } from '../../data/mockData.js'
import { Avatar } from '../common/UI.jsx'
import { portalApi } from '../../services/portalService.js'

const icons = { Overview: LayoutDashboard, Analytics: LayoutDashboard, Reports: BookOpen, 'Dataset insights': Database, Students: Users, Teachers: Users, Classes: GraduationCap, Subjects: BookOpen, Attendance: CalendarDays, Assignments: BookOpen, Grades: BookOpen, Announcements: MessageSquare, Messages: MessageSquare, Timetable: CalendarDays, 'AI study buddy': MessageSquare, 'Fee status': BookOpen }

export default function PortalLayout() {
  const { user, logout, notifications, refreshPortalData } = useApp()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [globalSearch, setGlobalSearch] = useState('')
  const [notificationError, setNotificationError] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const sections = navigationByRole[user.role] || navigationByRole.Admin
  const unreadCount = notifications.filter((item) => item.unread).length
  const title = location.pathname.split('/')[2] || 'overview'

  async function signOut() {
    try {
      await logout()
    } catch (error) {
      console.error('Unable to complete Acadex server logout.', error)
    }
    navigate('/')
  }

  async function markAllRead() {
    try {
      await portalApi.markNotificationsRead()
      await refreshPortalData()
      setNotificationError('')
    } catch (error) {
      setNotificationError(error.message)
    }
  }

  return (
    <div className={`portal-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {sidebarOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-mobile-open' : ''}`}>
        <div className="brand-row"><Link to="/" className="brand"><span className="brand-mark"><GraduationCap size={19} /></span><span>acadex</span></Link><button className="icon-button sidebar-close" aria-label="Close menu" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <div className="school-switcher"><span className="school-emblem">N</span><span className="school-switcher-copy"><strong>Northstar Academy</strong><small>School workspace</small></span></div>
        <div className="sidebar-scroll">
          {sections.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-label">{group.label}</p>
              {group.items.map(([label, slug]) => {
                const Icon = icons[label] || LayoutDashboard
                return <NavLink key={slug} to={`/portal/${slug}`} onClick={() => setSidebarOpen(false)} className={({ isActive }) => `nav-link ${isActive || (slug === 'overview' && title === 'overview') ? 'nav-active' : ''}`}><Icon size={17} /><span>{label}</span>{label === 'Assignments' && <span className="nav-count">3</span>}</NavLink>
              })}
            </div>
          ))}
        </div>
        <div className="sidebar-bottom">
          <NavLink to="/portal/settings" className="nav-link"><Settings size={17} /><span>Settings</span></NavLink>
          <div className="sidebar-user"><Avatar name={user.name} color="violet" /><div className="sidebar-user-copy"><strong>{user.name}</strong><small>{user.role}</small></div><button className="icon-button" aria-label="Sign out" onClick={signOut}><LogOut size={16} /></button></div>
          <button className="collapse-toggle" onClick={() => setCollapsed(!collapsed)}><ChevronLeft size={16} /><span>Collapse sidebar</span></button>
        </div>
      </aside>
      <main className="portal-main">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="breadcrumb"><span>Northstar Academy</span><span className="breadcrumb-slash">/</span><strong>{title.replace('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())}</strong></div>
          <div className="topbar-actions"><label className="global-search"><Search size={16} /><input placeholder="Search students or assignments..." value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && globalSearch.trim()) { const destination = user.role === 'Admin' || user.role === 'Teacher' ? '/portal/students' : '/portal/assignments'; navigate(`${destination}?search=${encodeURIComponent(globalSearch.trim())}`); setGlobalSearch('') } }} /><kbd>↵</kbd></label><div className="notification-wrap"><button className="icon-button notification-button" aria-label={`Notifications, ${unreadCount} unread`} onClick={() => setNotificationOpen(!notificationOpen)}><Bell size={18} />{unreadCount > 0 && <span className="notification-dot" />}</button>{notificationOpen && <div className="notification-popover"><div className="popover-heading"><strong>Notifications</strong><button onClick={markAllRead}>Mark all read</button></div>{notificationError && <p className="auth-notice" role="alert">{notificationError}</p>}{notifications.slice(0, 4).map((item) => <div className={`notification-item ${item.unread ? 'notification-unread' : ''}`} key={item.id}><span className="notification-icon"><Bell size={14} /></span><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.time}</small></div></div>)}</div>}</div><span className="topbar-divider" /><button className="topbar-profile" onClick={signOut}><Avatar name={user.name} color="violet" size="sm" /><span>{user.name}</span><ChevronDown size={14} /></button></div>
        </header>
        <div className="portal-content"><Outlet key={`${location.pathname}${location.search}`} /></div>
      </main>
    </div>
  )
}

import { useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, ChevronDown, CircleHelp, ClipboardList, HeartHandshake, LayoutDashboard, LogOut, Menu as MenuIcon, Recycle, Utensils, X } from 'lucide-react';
import { AuthProvider, ToastProvider, useAuth } from './context.jsx';
import { LoginPage } from './pages/Login.jsx';
import { StudentDashboard, StudentMeals, StudentHistory } from './pages/Student.jsx';
import { ManagerDashboard, ManagerMeals, ManagerAttendance, ManagerAnalytics } from './pages/Manager.jsx';
import { CompostFarm, FoodRescue } from './pages/Sustainability.jsx';

function Protected({ role }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="app-loading"><div className="spinner" /><span>Getting your mess ready…</span></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return <Outlet />;
}

function Layout() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const manager = user.role === 'manager';
  const links = manager
    ? [{ to: '/manager', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/manager/meals', label: 'Meals & menu', icon: Utensils }, { to: '/manager/attendance', label: 'Attendance', icon: ClipboardList }, { to: '/manager/analytics', label: 'Waste analytics', icon: BarChart3 }, { to: '/manager/rescue', label: 'Food rescue', icon: HeartHandshake }, { to: '/manager/compost', label: 'Compost & farm', icon: Recycle }]
    : [{ to: '/student', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/student/meals', label: 'Meals', icon: Utensils }, { to: '/student/history', label: 'Meal history', icon: CalendarDays }];
  const title = links.find((link) => link.end ? location.pathname === link.to : location.pathname.startsWith(link.to))?.label || 'Overview';
  return <div className="app-shell">
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-icon"><Utensils size={19} /></div><span className="brand-name">Shivalik <span className="brand-accent">Mess Meter</span></span><button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="side-nav">{links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} end={end} to={to} onClick={() => setMobileOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`}><Icon size={18} strokeWidth={1.9} /><span>{label}</span>{label === 'Overview' && <span className="nav-live" />}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Need a hand?</strong><p>Make your mess run a little smarter.</p><span>Help center <span aria-hidden="true">↗</span></span></div><div className="profile-row"><div className="avatar">{user.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div><div className="profile-info"><strong>{user.name}</strong><span>{manager ? 'Mess manager' : 'Student'}{user.room ? ` · Room ${user.room}` : ''}</span></div><button className="icon-button logout-button" onClick={logout} aria-label="Sign out"><LogOut size={17} /></button></div></div>
    </aside>
    <div className="main-column"><header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><MenuIcon size={21} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-separator">/</span><strong>{title}</strong></div><div className="topbar-right"><span className="today-label"><span className="status-dot" />Service running</span><div className="mini-avatar">{user.name[0]}</div><ChevronDown className="profile-chevron" size={15} /></div></header><main className="page-content"><Outlet /></main><footer className="app-footer"><span>© 2026 Kanishk Chandan · Shivalik Mess Meter</span><span>Made for a better, less wasteful mess.</span></footer></div>
  </div>;
}

function AppRoutes() {
  const { user } = useAuth();
  return <Routes>
    <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <LoginPage />} />
    <Route element={<Protected />}>
      <Route element={<Layout />}>
        <Route path="/student" element={<Protected role="student" />}><Route index element={<StudentDashboard />} /><Route path="meals" element={<StudentMeals />} /><Route path="history" element={<StudentHistory />} /></Route>
        <Route path="/manager" element={<Protected role="manager" />}><Route index element={<ManagerDashboard />} /><Route path="meals" element={<ManagerMeals />} /><Route path="attendance" element={<ManagerAttendance />} /><Route path="analytics" element={<ManagerAnalytics />} /><Route path="rescue" element={<FoodRescue />} /><Route path="compost" element={<CompostFarm />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
  </Routes>;
}

export default function App() {
  return <AuthProvider><ToastProvider><AppRoutes /></ToastProvider></AuthProvider>;
}

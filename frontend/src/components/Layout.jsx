import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const link = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <>
      <header className="topbar">
        <strong className="brand">+ MediCare</strong>
        <nav>
          {user.role === 'admin' && <NavLink to="/admin" className={link}>Dashboard</NavLink>}
          <NavLink to="/appointments" className={link}>Appointments</NavLink>
          <NavLink to="/prescriptions" className={link}>Prescriptions</NavLink>
          <NavLink to="/patients" className={link}>{user.role === 'patient' ? 'My profile' : 'Patients'}</NavLink>
          {user.role === 'admin' && <NavLink to="/doctors" className={link}>Doctors</NavLink>}
        </nav>
        <span className="who">{user.name} <small className="pill">{user.role}</small>
          <button className="ghost" onClick={logout}>Sign out</button></span>
      </header>
      <main className="container"><Outlet /></main>
    </>
  );
}

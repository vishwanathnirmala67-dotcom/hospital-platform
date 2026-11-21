import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';

// Route-level code splitting keeps the first load small (target: key pages < 2 s).
const Appointments = lazy(() => import('./pages/Appointments.jsx'));
const Patients = lazy(() => import('./pages/Patients.jsx'));
const Prescriptions = lazy(() => import('./pages/Prescriptions.jsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.jsx'));
const Doctors = lazy(() => import('./pages/Doctors.jsx'));

function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <p className="muted center">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'admin' ? '/admin' : '/appointments'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<p className="muted center">Loading…</p>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Home />} />
          <Route path="appointments" element={<Appointments />} />
          <Route path="prescriptions" element={<Prescriptions />} />
          <Route path="patients" element={<Patients />} />
          <Route path="admin" element={<Guard roles={['admin']}><AdminDashboard /></Guard>} />
          <Route path="doctors" element={<Guard roles={['admin']}><Doctors /></Guard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

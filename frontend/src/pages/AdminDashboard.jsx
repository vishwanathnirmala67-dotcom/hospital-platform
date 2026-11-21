import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { Alert } from '../components/ui.jsx';

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function Stat({ label, value, hint }) {
  return <div className="stat"><div className="muted">{label}</div><div className="big">{value}</div>{hint && <small className="muted">{hint}</small>}</div>;
}

/** Dependency-free SVG bar chart (accessible: has <title> and text labels). */
function Bars({ title, rows, format }) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 400 ${rows.length * 30 + 6}`} role="img" aria-label={title}>
        <title>{title}</title>
        {rows.map((r, i) => (
          <g key={r.label} transform={`translate(0 ${i * 30 + 4})`}>
            <text x="0" y="14" fontSize="11">{r.label}</text>
            <rect x="170" y="2" width={(r.value / max) * 170} height="16" rx="3" className="bar" />
            <text x={176 + (r.value / max) * 170} y="14" fontSize="11">{format(r.value)}</text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

export default function AdminDashboard() {
  const [hospitals, setHospitals] = useState([]);
  const [hospitalId, setHospitalId] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/admin/hospitals').then((r) => setHospitals(r.data)).catch(() => {}); }, []);
  useEffect(() => { setD(null); api('/api/admin/dashboard' + qs({ hospitalId })).then(setD).catch((e) => setErr(e.message)); }, [hospitalId]);

  return (
    <>
      <h1>Admin dashboard</h1>
      <div className="filters">
        <select aria-label="Hospital" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
          <option value="">All hospitals</option>
          {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
        </select>
        {d && <small className="muted">As of {d.asOf}</small>}
      </div>
      <Alert>{err}</Alert>
      {!d && !err && <p className="muted">Loading metrics…</p>}
      {d && (
        <>
          <section className="stats">
            <Stat label="Average length of stay" value={`${d.avgLengthOfStayDays} days`} hint="discharged stays only" />
            <Stat label="Bed occupancy" value={pct(d.bedOccupancy.rate)} hint={`${d.bedOccupancy.occupied} of ${d.bedOccupancy.totalBeds} beds`} />
            <Stat label="30-day readmission rate" value={pct(d.readmission30.rate)} hint={`${d.readmission30.readmissions} of ${d.readmission30.indexStays} discharges`} />
            <Stat label="Patients · upcoming appts" value={`${d.counts.patients} · ${d.counts.upcomingAppointments}`} hint={`${d.counts.prescriptions} prescriptions issued`} />
          </section>
          <div className="card cols">
            <Bars title="Bed occupancy by hospital" rows={d.perHospital.map((h) => ({ label: h.name.slice(0, 24), value: h.occupancy }))} format={pct} />
            <Bars title="Average length of stay (days)" rows={d.perHospital.map((h) => ({ label: h.name.slice(0, 24), value: h.avgLengthOfStay }))} format={(v) => v.toFixed(1)} />
            <Bars title="Top diagnoses (admissions)" rows={d.topDiagnoses.map((t) => ({ label: (t.label || t.code).slice(0, 24), value: t.n }))} format={String} />
          </div>
          <div className="card">
            <h2>Data quality</h2>
            <p className="muted">Issues found while cleaning the source exports. Excluded stays are never silently counted.</p>
            <ul>
              <li><strong>{d.dataQuality.missingDischarge}</strong> admissions have no discharge date (left out of length-of-stay and occupancy).</li>
              <li><strong>{d.dataQuality.unmappedDiagnosis}</strong> admissions have a diagnosis that could not be mapped to a code.</li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}

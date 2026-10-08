import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CalendarPlus, Camera, Check, ClipboardCheck, Leaf, Plus, QrCode, Save, Trash2, Users, Utensils, X } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../context.jsx';
import { EmptyState, FilterSelect, indiaToday, MealCard, MealReminders, MealSelect, PageHeading, Spinner, StatCard, StatusPill, WasteFormula, fullDate, shortDate, useMeals } from '../components.jsx';

const today = indiaToday;

export function ManagerDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/dashboard/manager').then(setData).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  if (error) return <div className="error-panel">{error}<button onClick={load}>Try again</button></div>;
  if (!data) return <Spinner />;
  const max = Math.max(...data.trend.map((point) => point.expected), 1);
  return <><PageHeading eyebrow={fullDate(today())} title="Mess overview" subtitle="A clear picture of today’s meals, right when you need it." action={<span className="live-indicator"><i /> LIVE OVERVIEW</span>} /><MealReminders meals={data.todayMeals} manager />
    <div className="stat-grid manager-stats"><StatCard label="Expected today" value={data.stats.expected} detail="Confirmed meal RSVPs" icon={CalendarPlus} tone="mint" /><StatCard label="Checked in" value={data.stats.checkedIn} detail="Student attendance scans" icon={Users} tone="blue" /><StatCard label="Plates consumed" value={data.stats.consumed} detail="Manually recorded servings" icon={Utensils} tone="purple" /><StatCard label="Unused plates" value={data.stats.unused} detail="Estimated for counted meals" icon={Leaf} tone="amber" /></div>
    <div className="manager-dashboard-grid"><section className="panel today-panel"><div className="panel-heading"><div><h2>Today’s meal demand</h2><p>Expected attendance by serving.</p></div><span className="live-indicator"><i /> TODAY</span></div>
      {data.todayMeals.length ? <div className="demand-list">{data.todayMeals.map((meal) => {
        const pct = data.stats.expected ? Math.round(meal.expected / data.stats.expected * 100) : 0;
        return <div className="demand-row" key={meal.id}><div className="demand-meal"><span className="demand-icon"><Utensils size={16} /></span><span><strong>{meal.type}</strong><small>{meal.time} · {meal.items.slice(0, 2).join(', ')}</small></span></div><div className="demand-progress"><div className="progress-track"><span style={{ width: `${pct}%` }} /></div><small>{meal.checkedIn} checked in · {meal.actualConsumed === null ? 'plates not counted yet' : `${meal.actualConsumed} plates recorded`}</small></div><div className="demand-number"><strong>{meal.recommendedPrep}</strong><small>prep target · {meal.expected} RSVP{meal.expected === 1 ? '' : 's'}</small></div></div>;
      })}</div> : <EmptyState title="No meals for today" message="Add a meal to start planning today's demand." />}
      <div className="panel-footer-link"><a href="/manager/meals">Manage meals & menu <ArrowUpRight size={14} /></a></div></section>
      <section className="panel trend-panel"><div className="panel-heading"><div><h2>Weekly meal demand</h2><p>Expected plates across the last 7 days.</p></div><span className="chart-legend"><i /> Expected</span></div><div className="bar-chart" role="img" aria-label="Expected meals by day for the past week">{data.trend.map((point) => <div className="bar-group" key={point.date}><div className="bar-track"><span className="bar expected-bar" style={{ height: `${Math.max(4, point.expected / max * 100)}%` }} /><span className="bar consumed-bar" style={{ height: `${Math.max(3, point.consumed / max * 100)}%` }} /></div><span className="bar-date">{new Date(`${point.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}</span></div>)}</div><div className="chart-footnote"><span className="chart-legend"><i className="consumed-legend" /> Consumed</span><span>Planned vs. served</span></div></section></div>
    <div className="section-heading manager-meal-heading"><div><h2>Today’s menu</h2><p>What’s being served across the mess.</p></div></div><div className="meal-grid">{data.todayMeals.map((meal) => <MealCard key={meal.id} meal={meal} manager />)}</div>
    <div className="recommendation"><div className="recommendation-icon"><Leaf size={19} /></div><div><strong>Preparation estimate: RSVPs + 5% buffer</strong><p>Each meal’s prep target rounds up expected RSVPs × 1.05. It is a planning estimate, not a guarantee; compare student check-ins separately from the actual plate count entered after service.</p></div><ArrowDownRight size={17} /></div>
  </>;
}

function MealEditor({ meal, onClose, onSaved }) {
  const [form, setForm] = useState(meal ? { date: meal.date, type: meal.type, time: meal.time, items: meal.items.join(', '), unavailableItems: meal.unavailableItems || [] } : { date: today(), type: 'Breakfast', time: '07:30', items: '', unavailableItems: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    const payload = { date: form.date, type: form.type, time: form.time, items: form.items.split(',').map((item) => item.trim()).filter(Boolean) };
    payload.unavailableItems = form.unavailableItems.filter((item) => payload.items.includes(item));
    try {
      if (meal) await api(`/meals/${meal.id}`, { method: 'PUT', body: JSON.stringify({ time: payload.time, items: payload.items, unavailableItems: payload.unavailableItems }) });
      else await api('/meals', { method: 'POST', body: JSON.stringify(payload) });
      toast(meal ? 'Meal menu updated.' : 'Meal added to the menu.'); onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const listedItems = [...new Set(form.items.split(',').map((item) => item.trim()).filter(Boolean))];
  const toggleUnavailable = (item) => setForm((current) => ({ ...current, unavailableItems: current.unavailableItems.includes(item) ? current.unavailableItems.filter((entry) => entry !== item) : [...current.unavailableItems, item] }));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="meal-editor-title"><div className="modal-heading"><div><div className="eyebrow">MENU MANAGEMENT</div><h2 id="meal-editor-title">{meal ? `Edit ${meal.type.toLowerCase()}` : 'Add a meal'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div><form className="editor-form" onSubmit={submit}>{!meal && <div className="editor-two"><label>Date<input type="date" min={today()} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label><label>Meal type<select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{['Breakfast', 'Lunch', 'Snacks', 'Dinner'].map((type) => <option key={type}>{type}</option>)}</select></label></div>}<label>Serving time<input type="time" value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} required /></label><label>Menu items <span className="optional-label">COMMA SEPARATED</span><textarea rows="3" value={form.items} onChange={(event) => setForm({ ...form, items: event.target.value, unavailableItems: form.unavailableItems.filter((item) => event.target.value.split(',').map((entry) => entry.trim()).includes(item)) })} placeholder="Poha, chai, fresh fruit" /></label>{listedItems.length > 0 && <fieldset className="unavailable-picker"><legend>Mark any unavailable items</legend>{listedItems.map((item) => <label key={item}><input type="checkbox" checked={form.unavailableItems.includes(item)} onChange={() => toggleUnavailable(item)} /><span>{item}</span></label>)}</fieldset>}{error && <div className="form-error" role="alert">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : meal ? 'Save changes' : 'Add meal'}<Check size={15} /></button></div></form></section></div>;
}

export function ManagerMeals() {
  const { meals, loading, error, refresh } = useMeals('/meals');
  const [editor, setEditor] = useState(null);
  const [filter, setFilter] = useState('all');
  const toast = useToast();
  const filtered = meals.filter((meal) => filter === 'all' || meal.date === filter);
  const dates = [...new Set(meals.map((meal) => meal.date))].sort();
  const remove = async (meal) => {
    if (!window.confirm(`Delete ${meal.type.toLowerCase()} on ${shortDate(meal.date)}? This also removes its RSVP records.`)) return;
    try { await api(`/meals/${meal.id}`, { method: 'DELETE' }); toast('Meal removed from the menu.'); await refresh(); }
    catch (err) { toast(err.message, 'error'); }
  };
  return <><PageHeading eyebrow="PLAN WHAT’S ON THE TABLE" title="Meals & menu" subtitle="Set the menu and keep meal times up to date." action={<button className="primary-button" onClick={() => setEditor({ mode: 'new' })}><Plus size={16} /> Add a meal</button>} />{error ? <div className="error-panel">{error}<button onClick={refresh}>Try again</button></div> : loading ? <Spinner /> : <><div className="toolbar"><div className="toolbar-intro"><strong>{filtered.length} meals scheduled</strong><span>Meals and menu items for your campus.</span></div><FilterSelect value={filter} onChange={setFilter} ariaLabel="Filter by date" options={[{ value: 'all', label: 'All dates' }, ...dates.map((date) => ({ value: date, label: shortDate(date) }))]} /></div>{filtered.length ? <div className="meal-grid">{filtered.map((meal) => <MealCard key={meal.id} meal={meal} manager onEdit={(entry) => setEditor(entry)} onDelete={remove} />)}</div> : <EmptyState icon={CalendarPlus} title="No meals on this date" message="Add a meal to put your menu on the board." />}</>}{editor && <MealEditor meal={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); refresh(); }} />}</>;
}

function MealQrScanner({ onRedeemed }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const scanInProgress = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();

  const redeem = async (token) => {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await api('/attendance/scan', { method: 'POST', body: JSON.stringify({ token: token.trim() }) });
      setResult(response);
      setManualToken('');
      onRedeemed(response);
      toast(`${response.student.name} checked in for ${response.meal.type}.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); scanInProgress.current = false; }
  };

  useEffect(() => {
    if (!scanning || !videoRef.current) return undefined;
    let mounted = true;
    import('@zxing/browser').then(({ BrowserQRCodeReader }) => {
      if (!mounted) return null;
      const reader = new BrowserQRCodeReader();
      return reader.decodeFromVideoDevice(undefined, videoRef.current, (decoded, _error, cameraControls) => {
        if (!mounted || !decoded || scanInProgress.current) return;
        scanInProgress.current = true;
        cameraControls?.stop();
        setScanning(false);
        void redeem(decoded.getText());
      });
    }).then((cameraControls) => {
      if (!cameraControls) return;
      if (mounted) controlsRef.current = cameraControls;
      else cameraControls.stop();
    }).catch((err) => {
      if (mounted) {
        setError(err.message || 'Could not start the camera. Check camera permission or enter a scanned QR token manually.');
        setScanning(false);
      }
    });
    return () => {
      mounted = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [scanning]);

  return <section className="panel qr-scanner-panel"><div className="panel-heading"><div><h2>Scan a student meal pass</h2><p>Staff check-in verifies an RSVP and records one-time student attendance.</p></div><span className="record-count">STAFF CHECK-IN</span></div><div className="qr-scanner-content"><div className="scanner-instructions"><div className="scanner-icon"><QrCode size={18} /></div><div><strong>One scan marks the student attended</strong><p>Passes work from 15 minutes before serving until 90 minutes after. This records a person checked in; enter actual plates served separately below. A used pass cannot be reused.</p></div></div>{scanning && <div className="camera-preview"><video ref={videoRef} muted playsInline /><div className="camera-frame" /><button className="secondary-button camera-stop" onClick={() => { controlsRef.current?.stop(); setScanning(false); }}><X size={14} /> Stop camera</button></div>}<div className="scanner-controls">{!scanning && <button className="secondary-button" onClick={() => { scanInProgress.current = false; setResult(null); setError(''); setScanning(true); }} disabled={busy}><Camera size={15} /> Scan with camera</button>}<form className="manual-scan-form" onSubmit={(event) => { event.preventDefault(); void redeem(manualToken); }}><input aria-label="Scanned QR token" autoComplete="off" value={manualToken} onChange={(event) => setManualToken(event.target.value)} placeholder="Or paste a scanned meal-pass code" required /><button className="primary-button" disabled={busy || !manualToken.trim()}>{busy ? 'Checking…' : 'Verify pass'}<Check size={14} /></button></form></div>{error && <div className="form-error qr-scan-message" role="alert">{error}</div>}{result && <div className="scan-success" role="status"><div className="scan-success-icon"><Check size={17} /></div><div><strong>Check-in accepted · {result.student.name}</strong><span>{result.meal.type} · {formatDate(result.meal.date)} · {result.student.room || 'Student'}</span></div><span className="scan-time">{new Date(result.redeemedAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}</span></div>}</div></section>;
}

export function ManagerAttendance() {
  const { meals, loading, error: mealsError } = useMeals('/meals');
  const [mealId, setMealId] = useState('');
  const [students, setStudents] = useState([]);
  const [actual, setActual] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const selected = meals.find((meal) => meal.id === mealId);
  useEffect(() => { if (!mealId && meals.length) { const current = meals.find((meal) => meal.date === today()); setMealId((current || meals[0]).id); } }, [meals, mealId]);
  const load = async () => {
    if (!mealId) return;
    setLoaded(false); setError('');
    try { const result = await api(`/attendance?mealId=${encodeURIComponent(mealId)}`); setStudents(result.students); setActual(result.actualConsumed ?? ''); setLoaded(true); }
    catch (err) { setError(err.message); }
  };
  useEffect(() => { if (mealId) load(); }, [mealId]);
  const updateStatus = async (student, status) => {
    try {
      await api(`/meals/${mealId}/attendance`, { method: 'PUT', body: JSON.stringify({ studentId: student.id, status }) });
      setStudents((current) => current.map((entry) => entry.id === student.id ? { ...entry, status } : entry));
    } catch (err) { toast(err.message, 'error'); }
  };
  const saveActual = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/meals/${mealId}/attendance`, { method: 'PUT', body: JSON.stringify({ actualConsumed: Number(actual) }) }); toast('Consumed plate count saved.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const expected = students.filter((student) => ['yes', 'attended', 'absent'].includes(student.status)).length;
  const present = students.filter((student) => student.status === 'attended').length;
  const handleQrRedeemed = (result) => {
    if (mealId === result.meal.id) void load();
    else setMealId(result.meal.id);
  };
  return <><PageHeading eyebrow="THE PEOPLE BEHIND THE PLATES" title="Attendance" subtitle="See who’s joining and record the meal count after each service." /><MealQrScanner onRedeemed={handleQrRedeemed} />{mealsError ? <div className="error-panel">{mealsError}</div> : loading ? <Spinner /> : !meals.length ? <EmptyState title="No meals to take attendance for" message="Add a meal to start tracking attendance." /> : <><div className="attendance-controls panel"><div><div className="eyebrow">SELECT A SERVING</div><div className="attendance-select-row"><MealSelect meals={meals} value={mealId} onChange={setMealId} /><span className="attendance-date">{selected ? fullDate(selected.date) : ''}</span></div></div><div className="attendance-totals"><div><b>{expected}</b><span>Expected RSVPs</span></div><i /><div><b>{present}</b><span>QR check-ins</span></div></div></div>{error && <div className="error-panel">{error}<button onClick={load}>Try again</button></div>}{loaded && <><div className="stat-grid attendance-stats"><StatCard label="Students expected" value={expected} detail="Confirmed RSVPs" icon={Users} tone="blue" /><StatCard label="QR check-ins" value={present} detail="Students checked in" icon={ClipboardCheck} tone="mint" /><StatCard label="No confirmed RSVP" value={students.length - expected} detail="Not included in expected count" icon={Utensils} tone="amber" /></div><section className="panel attendance-panel"><div className="panel-heading"><div><h2>Student attendance</h2><p>Update status for {selected?.type.toLowerCase()}.</p></div><span className="record-count">{students.length} students</span></div><div className="table-scroll"><table><thead><tr><th>STUDENT</th><th>ROOM</th><th>RSVP / ATTENDANCE</th><th>MARK STATUS</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.email}</small></td><td>{student.room || '—'}</td><td><StatusPill status={student.status} /></td><td><div className="attendance-actions"><button className={`attendance-action ${student.status === 'attended' ? 'action-selected' : ''}`} onClick={() => updateStatus(student, 'attended')} aria-label={`Mark ${student.name} attended`}><Check size={14} /> Present</button><button className={`attendance-action ${student.status === 'absent' ? 'action-selected action-absent' : ''}`} onClick={() => updateStatus(student, 'absent')} aria-label={`Mark ${student.name} absent`}>Absent</button></div></td></tr>)}</tbody></table></div></section><form className="consumed-form panel" onSubmit={saveActual}><div><strong>Actual plates served</strong><p>Count plates that were actually served. This is separate from QR check-ins and is used to estimate unused portions.</p></div><input type="number" min="0" max="10000" step="1" value={actual} onChange={(event) => setActual(event.target.value)} placeholder="e.g. 86 plates" required /><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save plate count'}<Save size={15} /></button></form><WasteFormula expected={expected} consumed={Number(actual) || 0} /></>}</>}</>;
}

export function ManagerAnalytics() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/analytics').then(setData).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  if (error) return <div className="error-panel">{error}<button onClick={load}>Try again</button></div>;
  if (!data) return <Spinner />;
  const max = Math.max(...data.rows.slice(0, 20).map((row) => row.expected), 1);
  return <><PageHeading eyebrow="SMALL CHANGES, LESS WASTE" title="Waste analytics" subtitle="Understand meal demand, compare it with consumption, and make better estimates." action={<span className="period-badge">ALL RECORDED MEALS</span>} /><div className="stat-grid analytics-stats"><StatCard label="Expected plates" value={data.totals.expected} detail="From confirmed RSVPs" icon={Users} tone="blue" /><StatCard label="Consumed plates" value={data.totals.consumed} detail="Recorded at service" icon={Utensils} tone="purple" /><StatCard label="Unused plates" value={data.totals.unused} detail="Expected minus consumed" icon={ArrowDownRight} tone="amber" /><StatCard label="Food saved" value={`${data.totals.savedKg} kg`} detail="Estimated from cancellations" icon={Leaf} tone="mint" /></div>
    <div className="analytics-grid"><section className="panel analytics-chart"><div className="panel-heading"><div><h2>Expected vs. consumed</h2><p>Latest recorded meals, sorted by date.</p></div><div className="chart-legend-pair"><span><i /> Expected</span><span><i className="consumed-legend" /> Consumed</span></div></div>{data.rows.length ? <div className="horizontal-chart">{data.rows.slice(0, 14).map((row) => <div className="horizontal-row" key={row.id}><span className="horizontal-label">{row.type}<small>{shortDate(row.date)}</small></span><div className="horizontal-bars"><div className="horizontal-track"><span className="expected-horizontal" style={{ width: `${row.expected / max * 100}%` }} /></div><div className="horizontal-track"><span className="consumed-horizontal" style={{ width: `${row.consumed / max * 100}%` }} /></div></div><span className="horizontal-value">{row.expected}</span></div>)}</div> : <EmptyState title="No meal records yet" message="As meals are completed, demand trends will appear here." />}</section>
      <section className="panel prep-panel"><div className="panel-heading"><div><h2>Prep recommendation</h2><p>A practical starting point for each service.</p></div><span className="recommendation-badge">SMART TIP</span></div><div className="prep-tip"><div className="prep-tip-icon"><Leaf size={18} /></div><div><strong>Plan close to confirmed demand</strong><p>Start with the confirmed RSVP count and add a 5–10% buffer for walk-ins. Review unused plates after service to tune your next estimate.</p></div></div><div className="prep-equation"><span>Suggested prep =</span><strong>RSVP count × 1.05</strong><small>Rounded up to the next whole plate</small></div><div className="prep-example"><span>Example</span><strong>40 RSVPs → 42 plates</strong></div></section></div>
    <WasteFormula expected={data.totals.expected} consumed={data.totals.consumed} /><section className="panel analytics-table"><div className="panel-heading"><div><h2>Meal-by-meal breakdown</h2><p>All completed meals and their recorded counts.</p></div><span className="record-count">{data.rows.length} meals</span></div>{data.rows.length ? <div className="table-scroll"><table><thead><tr><th>MEAL / DATE</th><th>EXPECTED</th><th>CONSUMED</th><th>UNUSED</th><th>FOOD SAVED</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id}><td><strong>{row.type}</strong><small>{shortDate(row.date)}</small></td><td>{row.expected}</td><td>{row.consumed}</td><td><span className={row.unused ? 'unused-value' : 'zero-value'}>{row.unused}</span></td><td>{row.savedKg} kg</td></tr>)}</tbody></table></div> : <EmptyState title="No completed meal records" message="Meal analytics will show here after service." />}</section></>;
}

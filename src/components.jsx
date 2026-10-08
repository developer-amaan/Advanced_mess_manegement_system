import { useEffect, useState } from 'react';
import { Check, ChevronDown, Clock3, Coffee, Leaf, LoaderCircle, Plus, QrCode, Salad, Utensils, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from './api.js';
import { useToast } from './context.jsx';

let currentTime = Date.now();
let clockInterval;
const clockSubscribers = new Set();

function useCurrentTime() {
  const [now, setNow] = useState(currentTime);
  useEffect(() => {
    clockSubscribers.add(setNow);
    if (!clockInterval) {
      clockInterval = setInterval(() => {
        currentTime = Date.now();
        clockSubscribers.forEach((subscriber) => subscriber(currentTime));
      }, 60_000);
    }
    return () => {
      clockSubscribers.delete(setNow);
      if (clockSubscribers.size === 0) {
        clearInterval(clockInterval);
        clockInterval = undefined;
      }
    };
  }, []);
  return now;
}

export const mealIcon = (type) => type === 'Breakfast' ? Coffee : type === 'Lunch' ? Salad : type === 'Snacks' ? Utensils : Utensils;
export const indiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const formatDate = (value, options = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', options);
export const shortDate = (value) => formatDate(value, { month: 'short', day: 'numeric' });
export const fullDate = (value) => formatDate(value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const prettyStatus = (status) => ({ yes: 'Going', attended: 'Attended', no: 'Not going', cancelled: 'Cancelled', absent: 'Absent' }[status] || status);
export const StatusPill = ({ status }) => <span className={`status-pill status-${status}`}>{prettyStatus(status)}</span>;
export const formatIndiaDateTime = (value) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' });

export function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

export function StatCard({ label, value, detail, icon: Icon, tone = 'mint', trend }) {
  return <article className="stat-card"><div className={`stat-icon stat-${tone}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{trend && <span className="trend-positive">{trend}</span>}{detail}</div></article>;
}

export function Spinner({ label = 'Loading your data…' }) {
  return <div className="loading-state"><LoaderCircle className="spinner" size={22} /><span>{label}</span></div>;
}

export function MealReminders({ meals, manager = false }) {
  const now = useCurrentTime();
  const reminder = meals.map((meal) => {
    const selectionOpen = Date.parse(meal.selectionOpensAt) <= now && now <= Date.parse(meal.selectionClosesAt);
    if (!manager && selectionOpen && meal.myStatus !== 'yes' && meal.myStatus !== 'attended') {
      const minutes = Math.ceil((Date.parse(meal.selectionClosesAt) - now) / 60_000);
      if (minutes >= 0 && minutes <= 120) return { meal, text: minutes === 0 ? `${meal.type} RSVP closes now.` : `${meal.type} RSVP closes in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
    }
    if (manager && meal.date >= indiaToday()) {
      const serviceAt = Date.parse(`${meal.date}T${meal.time}:00+05:30`);
      const minutes = Math.ceil((serviceAt - now) / 60_000);
      if (minutes >= 0 && minutes <= 60) return { meal, text: `${meal.type} service starts in ${minutes} minute${minutes === 1 ? '' : 's'}. Prep target: ${meal.recommendedPrep} plates from ${meal.expected} RSVPs.` };
    }
    return null;
  }).filter(Boolean).sort((a, b) => Date.parse(`${a.meal.date}T${a.meal.time}:00+05:30`) - Date.parse(`${b.meal.date}T${b.meal.time}:00+05:30`));
  if (!reminder.length) return null;
  return <div className="meal-reminder" role="status"><Clock3 size={16} /><div><strong>Meal reminder</strong><span>{reminder[0].text}</span></div></div>;
}

export function EmptyState({ icon: Icon = Utensils, title, message }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={22} /></div><strong>{title}</strong><p>{message}</p></div>;
}

export function MealCard({ meal, onRsvp, busy = false, manager = false, onEdit, onDelete }) {
  const [newMealPass, setNewMealPass] = useState(null);
  const now = useCurrentTime();
  const Icon = mealIcon(meal.type);
  const isPast = meal.date < indiaToday();
  const selectionOpen = Date.parse(meal.selectionOpensAt) <= now && now <= Date.parse(meal.selectionClosesAt);
  const changeRsvp = async (status) => {
    const response = await onRsvp(meal, status);
    setNewMealPass(status === 'yes' && response?.qrToken ? { token: response.qrToken, expiresAt: response.expiresAt, meal: response.meal } : null);
  };
  return <article className="meal-card">
    <div className="meal-card-top"><div className="meal-icon"><Icon size={19} /></div><div className="meal-time"><strong>{meal.type}</strong><span><Clock3 size={13} />{meal.time}</span></div><StatusPill status={manager ? 'yes' : meal.myStatus} /></div>
    <div className="meal-date">{formatDate(meal.date)}</div>
    <div className="menu-items">{meal.items?.map((item, index) => <span className={meal.unavailableItems?.includes(item) ? 'menu-item-unavailable' : ''} key={`${item}-${index}`}>{item}{meal.unavailableItems?.includes(item) && <b>Unavailable</b>}</span>)}</div>
    {!manager && meal.unavailableItems?.length > 0 && <small className="menu-change-note">Menu updated by the mess manager.</small>}
    {manager ? <div className="manager-meal-footer"><span><strong>{meal.expected ?? 0}</strong> expected</span><div className="inline-actions">{onEdit && <button className="text-button" onClick={() => onEdit(meal)}>Edit menu</button>}{onDelete && <button className="text-button danger-text" onClick={() => onDelete(meal)}>Delete</button>}</div></div>
      : <div className="meal-card-footer"><span>{meal.expected ?? 0} students expected</span><div className="meal-actions">{meal.myStatus === 'yes' && meal.hasQrPass && meal.qrWindowExpiresAt && now < Date.parse(meal.qrWindowExpiresAt) && <MealQrPass meal={meal} initialPass={newMealPass} />}{meal.myStatus === 'attended' ? <StatusPill status="attended" /> : selectionOpen ? <button className={`rsvp-button ${meal.myStatus === 'yes' ? 'rsvp-going' : ''}`} disabled={busy} onClick={() => void changeRsvp(meal.myStatus === 'yes' ? 'no' : 'yes')}>{busy ? <LoaderCircle className="spinner" size={15} /> : meal.myStatus === 'yes' ? <><Check size={15} /> Reserved · cancel</> : <><Plus size={15} /> Choose meal</>}</button> : <span className="selection-closed" title={`Selection opened ${formatIndiaDateTime(meal.selectionOpensAt)} and closed ${formatIndiaDateTime(meal.selectionClosesAt)}`}>{meal.myStatus === 'yes' ? 'Selection closed' : 'RSVP closed'}</span>}</div><small className="meal-cutoff">{selectionOpen ? `Choose by ${formatIndiaDateTime(meal.selectionClosesAt)} IST` : meal.myStatus === 'yes' && meal.hasQrPass && meal.qrWindowExpiresAt && now < Date.parse(meal.qrWindowExpiresAt) ? now < Date.parse(meal.qrWindowOpensAt) ? `Meal pass ready · check-in opens ${formatIndiaDateTime(meal.qrWindowOpensAt)} IST` : `Meal pass expires ${formatIndiaDateTime(meal.qrWindowExpiresAt)} IST` : now < Date.parse(meal.selectionOpensAt) ? `Selection opens ${formatIndiaDateTime(meal.selectionOpensAt)} IST` : `Selection closed · deadline ${formatIndiaDateTime(meal.selectionClosesAt)} IST`}</small></div>}
  </article>;
}

function MealQrPass({ meal, initialPass }) {
  const [pass, setPass] = useState(initialPass || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  useEffect(() => { if (initialPass) setPass(initialPass); }, [initialPass]);
  const showPass = async () => {
    setBusy(true); setError('');
    try { setPass(await api(`/meals/${meal.id}/qr`, { method: 'POST' })); }
    catch (err) { setError(err.message); toast(err.message, 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <button className="rsvp-button meal-qr-button" onClick={showPass} disabled={busy || meal.myStatus === 'attended'}>{busy ? <LoaderCircle className="spinner" size={14} /> : <QrCode size={14} />}{busy ? 'Preparing…' : meal.myStatus === 'attended' ? 'Already used' : 'Show meal pass'}</button>
    {pass && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPass(null); }}><section className="modal-card qr-pass-card" role="dialog" aria-modal="true" aria-labelledby={`qr-heading-${meal.id}`}><div className="modal-heading"><div><div className="eyebrow">SINGLE-USE CHECK-IN</div><h2 id={`qr-heading-${meal.id}`}>{pass.meal.type} meal pass</h2></div><button className="icon-button" onClick={() => setPass(null)} aria-label="Close meal pass"><X size={19} /></button></div><div className="qr-pass-code"><QRCodeSVG value={pass.token} size={220} level="H" includeMargin /></div><p className="qr-pass-instruction">Your reservation created this pass. Show it to the mess employee only from 15 minutes before serving until 90 minutes after. It works once and expires {formatIndiaDateTime(pass.expiresAt)} IST.</p>{error && <div className="form-error" role="alert">{error}</div>}<div className="qr-pass-safety">Keep your QR code private. A used or replaced code cannot be scanned again.</div></section></div>}
  </>;
}

export function MealGroup({ meals, onRsvp, busyId }) {
  const groups = meals.reduce((result, meal) => {
    (result[meal.date] ||= []).push(meal);
    return result;
  }, {});
  return <div className="meal-groups">{Object.entries(groups).map(([date, entries]) => <section className="meal-day" key={date}><div className="day-heading"><span>{formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</span>{date === indiaToday() && <span className="today-tag">TODAY</span>}</div><div className="meal-grid">{entries.map((meal) => <MealCard key={meal.id} meal={meal} onRsvp={onRsvp} busy={busyId === meal.id} />)}</div></section>)}</div>;
}

export function useMeals(path = '/meals') {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = async () => {
    setLoading(true); setError('');
    try { const result = await api(path); setMeals(result.meals); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [path]);
  return { meals, setMeals, loading, error, refresh };
}

export function FilterSelect({ value, onChange, options, ariaLabel }) {
  return <label className="filter-select"><span className="sr-only">{ariaLabel}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select><ChevronDown size={15} /></label>;
}

export function WasteFormula({ expected, consumed }) {
  const unused = Math.max(0, expected - consumed);
  const saved = (unused * 0.45).toFixed(1);
  return <div className="formula-card"><div className="formula-icon"><Leaf size={18} /></div><div><strong>Expected, check-ins, and served plates are different counts</strong><p>Unused plate estimate = max(0, expected RSVPs − plates actually served). Estimated surplus weight = unused plates × 0.45 kg. QR check-ins count people; record the actual plate count separately.</p><div className="formula-result"><span>{expected} expected − {consumed} served = <b>{unused} estimated unused</b></span><span><b>{saved} kg</b> estimated surplus food</span></div></div></div>;
}

export function MealSelect({ meals, value, onChange }) {
  return <FilterSelect ariaLabel="Select meal" value={value} onChange={onChange} options={meals.map((meal) => ({ value: meal.id, label: `${formatDate(meal.date)} · ${meal.type}` }))} />;
}

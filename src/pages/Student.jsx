import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, CalendarDays, Check, Clock3, Leaf, Utensils, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../context.jsx';
import { EmptyState, indiaToday, MealCard, MealGroup, MealReminders, PageHeading, Spinner, StatCard, StatusPill, useMeals, fullDate, formatDate, shortDate } from '../components.jsx';

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

export function StudentDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const toast = useToast();
  const load = () => api('/dashboard/student').then(setData).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  const [busyId, setBusyId] = useState('');
  const change = async (meal, status) => {
    setBusyId(meal.id);
    try { const result = await api(`/meals/${meal.id}/rsvp`, { method: 'PUT', body: JSON.stringify({ status }) }); await load(); toast(status === 'yes' ? 'You’re on the list. Your single-use meal QR pass is ready.' : 'Your RSVP has been cancelled.'); return result; }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusyId(''); }
  };
  if (error) return <div className="error-panel">{error} <button onClick={load}>Try again</button></div>;
  if (!data) return <Spinner />;
  const todays = data.todayMeals || [];
  const going = todays.filter((meal) => ['yes', 'attended', 'absent'].includes(meal.myStatus)).length;
  return <><PageHeading eyebrow={fullDate(indiaToday())} title={`${greeting()}, ${JSON.parse(localStorage.getItem('messmeter-user') || '{}').name?.split(' ')[0] || 'there'}`} subtitle="Here's what's happening around your mess today." action={<Link className="secondary-button" to="/student/meals"><CalendarDays size={16} /> View all meals</Link>} />
    <MealReminders meals={[...todays, ...data.upcoming]} /><div className="stat-grid student-stats"><StatCard label="Meals on today" value={todays.length} detail="A good day to eat well" icon={Utensils} tone="mint" /><StatCard label="RSVPs confirmed" value={`${going} / ${todays.length}`} detail="Your seat is on the list" icon={CalendarCheck2} tone="blue" /><StatCard label="Meals attended" value={data.stats.attended} detail="Across your meal history" icon={Check} tone="purple" /><StatCard label="Food saved" value={`${data.stats.wasteSavedKg} kg`} detail="From cancelling in advance" icon={Leaf} tone="amber" /></div>
    <div className="section-heading"><div><h2>On today's menu</h2><p>Make a plan for the meals you’ll be joining.</p></div><span className="section-date"><span className="status-dot" />Today</span></div>
    {!todays.length ? <EmptyState title="No meals on the menu today" message="Check upcoming meals to see what’s being served." /> : <div className="meal-grid">{todays.map((meal) => <MealCard key={meal.id} meal={meal} onRsvp={change} busy={busyId === meal.id} />)}</div>}
    <div className="section-heading upcoming-heading"><div><h2>Coming up</h2><p>Meals in the next few days, ready when you are.</p></div><Link className="subtle-link" to="/student/meals">All meals <ArrowRight size={14} /></Link></div>
    {!data.upcoming.length ? <EmptyState title="No upcoming meals yet" message="Your mess manager will add upcoming meals here." /> : <div className="upcoming-list">{data.upcoming.filter((meal) => meal.date > indiaToday()).slice(0, 5).map((meal) => <div className="upcoming-row" key={meal.id}><div className="upcoming-date"><b>{new Date(`${meal.date}T12:00:00`).getDate()}</b><span>{new Date(`${meal.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short' })}</span></div><div className="upcoming-info"><strong>{meal.type}</strong><span>{meal.items.slice(0, 3).join(' · ')}</span></div><span className="upcoming-time"><Clock3 size={14} />{meal.time}</span><StatusPill status={meal.myStatus} /></div>)}</div>}
  </>;
}

export function StudentMeals() {
  const { meals, loading, error, refresh } = useMeals('/meals');
  const [busyId, setBusyId] = useState('');
  const toast = useToast();
  const futureMeals = useMemo(() => meals.filter((meal) => meal.date >= indiaToday()), [meals]);
  const change = async (meal, status) => {
    setBusyId(meal.id);
    try { const result = await api(`/meals/${meal.id}/rsvp`, { method: 'PUT', body: JSON.stringify({ status }) }); await refresh(); toast(status === 'yes' ? 'Your meal is reserved. Your single-use QR pass is ready.' : 'Your RSVP has been cancelled.'); return result; }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusyId(''); }
  };
  return <><PageHeading eyebrow="YOUR MESS, YOUR CALL" title="Meals" subtitle="Browse what’s cooking and let the kitchen know you’re coming." /><MealReminders meals={futureMeals} /><div className="workflow-notice student-qr-notice"><div><Clock3 size={18} /></div><p><strong>Reserve first, scan at serving time.</strong> Your reservation creates a private single-use QR pass. Staff check-in opens 15 minutes before the scheduled serving and closes 90 minutes after.</p></div>{error ? <div className="error-panel">{error}<button onClick={refresh}>Try again</button></div> : loading ? <Spinner /> : futureMeals.length ? <MealGroup meals={futureMeals} onRsvp={change} busyId={busyId} /> : <EmptyState title="No upcoming meals" message="There aren't any meals scheduled just yet. Check back soon." />}</>;
}

export function StudentHistory() {
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api('/history').then((result) => setMeals(result.meals)).catch((err) => setError(err.message)).finally(() => setLoading(false)); }, []);
  if (loading) return <Spinner />;
  const attended = meals.filter((meal) => meal.myStatus === 'attended');
  const cancelled = meals.filter((meal) => meal.myStatus === 'cancelled');
  return <><PageHeading eyebrow="YOUR MEALS, MILE BY MILE" title="Meal history" subtitle="A little look back at the meals you’ve joined and the food you’ve helped save." /><div className="stat-grid history-stats"><StatCard label="Meals attended" value={attended.length} detail="Good food, good company" icon={Check} tone="mint" /><StatCard label="Meals cancelled" value={cancelled.length} detail="Thanks for giving notice" icon={XCircle} tone="amber" /><StatCard label="Food saved" value={`${(cancelled.length * 0.45).toFixed(1)} kg`} detail="Based on 0.45 kg per cancellation" icon={Leaf} tone="green" /></div>{error ? <div className="error-panel">{error}</div> : meals.length ? <section className="panel history-panel"><div className="panel-heading"><div><h2>Past meals</h2><p>Your attendance records at a glance.</p></div><span className="record-count">{meals.length} records</span></div><div className="table-scroll"><table><thead><tr><th>MEAL</th><th>DATE</th><th>MENU</th><th>YOUR STATUS</th></tr></thead><tbody>{meals.map((meal) => <tr key={meal.id}><td><strong>{meal.type}</strong><small>{meal.time}</small></td><td>{shortDate(meal.date)}</td><td className="menu-cell">{meal.items.join(', ')}</td><td><StatusPill status={meal.myStatus} /></td></tr>)}</tbody></table></div></section> : <EmptyState title="Nothing in your history yet" message="Once you’ve had a meal, you’ll find it here." />}</>;
}

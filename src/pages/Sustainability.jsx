import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Building2, Check, Clock3, Leaf, Mail, MapPin, PackageCheck, Plus, Recycle, Send, Shovel, Trash2, Truck, Users, Wallet } from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../context.jsx';
import { EmptyState, indiaToday, PageHeading, Spinner, StatCard, shortDate } from '../components.jsx';

const today = indiaToday;
const dateAfterDays = (days) => {
  const date = new Date(`${today()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const defaultPickupBy = () => {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const currency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function PartnerForm({ onSaved }) {
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', area: '', distanceKm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/partners', { method: 'POST', body: JSON.stringify({ ...form, distanceKm: Number(form.distanceKm) }) });
      setForm({ name: '', contactName: '', email: '', phone: '', area: '', distanceKm: '' });
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <form className="sustain-form" onSubmit={save}>
    <div className="sustain-form-grid"><label>Organization name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="NGO or community group" required minLength={2} maxLength={100} /></label><label>Contact person <span className="optional-label">OPTIONAL</span><input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} placeholder="Contact name" maxLength={80} /></label><label>Email for alerts<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="contact@organization.org" required /></label><label>Phone <span className="optional-label">OPTIONAL</span><input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 98765 43210" maxLength={30} /></label><label>Area / service location<input value={form.area} onChange={(event) => setForm({ ...form, area: event.target.value })} placeholder="Nearby neighborhood" required minLength={2} maxLength={120} /></label><label>Distance from mess (km)<input type="number" min="0" max="500" step="0.1" value={form.distanceKm} onChange={(event) => setForm({ ...form, distanceKm: event.target.value })} placeholder="e.g. 3.5" required /></label></div>
    {error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Add nearby partner'}<Plus size={15} /></button>
  </form>;
}

function AlertEmailLink({ alert, onOpen }) {
  const recipients = alert.recipients.map((partner) => partner.email);
  const subject = `Surplus food pickup · ${alert.portions} portions · Shivalik Mess`;
  const body = [
    'Hello,',
    '',
    `Shivalik Mess has ${alert.portions} surplus ${alert.mealType.toLowerCase()} portions available for donation.`,
    `Meal date: ${shortDate(alert.mealDate)}`,
    `Pickup location: ${alert.pickupLocation}`,
    `Please collect by: ${new Date(alert.pickupBy).toLocaleString()}`,
    'The mess manager has confirmed the food is safe and suitable for donation.',
    alert.notes ? `Pickup notes: ${alert.notes}` : '',
    '',
    'Please reply to confirm whether your organization can collect.',
    '',
    'Shivalik Mess Meter',
  ].filter(Boolean).join('\n');
  const href = `mailto:${encodeURIComponent(recipients.join(','))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return <a className="secondary-button" href={href} onClick={onOpen}><Mail size={14} /> Compose partner email <ArrowUpRight size={13} /></a>;
}

export function FoodRescue() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [mealId, setMealId] = useState('');
  const [form, setForm] = useState({ portions: '', pickupLocation: '', pickupBy: defaultPickupBy(), notes: '', foodSafeConfirmed: false });
  const [partnerIds, setPartnerIds] = useState([]);
  const [collectionCounts, setCollectionCounts] = useState({});
  const toast = useToast();
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api('/circularity');
      setData(result);
      setMealId((current) => result.meals.some((meal) => meal.id === current) ? current : (result.meals.find((meal) => meal.actualConsumed !== null)?.id || ''));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const selectedMeal = data?.meals.find((meal) => meal.id === mealId);
  const nearbyPartners = useMemo(() => data?.partners || [], [data]);
  const togglePartner = (id) => setPartnerIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const addPartner = async () => { await load(); toast('Nearby partner added.'); };
  const removePartner = async (partner) => {
    if (!window.confirm(`Remove ${partner.name} from the partner directory? Existing alerts will keep their saved recipient details.`)) return;
    try { await api(`/partners/${partner.id}`, { method: 'DELETE' }); setPartnerIds((current) => current.filter((id) => id !== partner.id)); toast('Partner removed.'); await load(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const createAlert = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api('/surplus-alerts', { method: 'POST', body: JSON.stringify({ ...form, portions: Number(form.portions), pickupBy: new Date(form.pickupBy).toISOString(), mealId, partnerIds }) });
      setForm({ portions: '', pickupLocation: '', pickupBy: defaultPickupBy(), notes: '', foodSafeConfirmed: false });
      setPartnerIds([]);
      toast('Surplus offer saved. Open its email draft to contact the selected partners.');
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const updateAlert = async (alert, status) => {
    try {
      const collectedPortions = Number(collectionCounts[alert.id] || alert.portions);
      await api(`/surplus-alerts/${alert.id}`, { method: 'PATCH', body: JSON.stringify({ status, collectedPortions, confirmExpired: status === 'expired' }) });
      toast(status === 'accepted' ? 'Partner acceptance recorded.' : status === 'picked_up' ? 'Pickup and collected portion count recorded.' : 'Surplus offer closed as expired.');
      await load();
    } catch (err) { toast(err.message, 'error'); }
  };
  if (loading && !data) return <Spinner />;
  if (error && !data) return <div className="error-panel">{error}<button onClick={load}>Try again</button></div>;
  return <>
    <PageHeading eyebrow="GOOD FOOD, SHARED IN TIME" title="Food rescue" subtitle="Offer safe, ready surplus to nearby organizations and record who you contacted." />
    <div className="workflow-notice"><div><Truck size={18} /></div><p><strong>Local partner directory</strong> Add real nearby organizations and their measured distance from the mess. Saving an offer logs it here; “Compose partner email” opens a draft in your email app so you can review and send it. It does not email anyone automatically.</p></div>
    {error && <div className="error-panel sustain-error">{error}<button onClick={load}>Refresh</button></div>}
    <section className="panel sustain-panel"><div className="panel-heading"><div><h2>Nearby rescue partners</h2><p>Contact details and distance are provided by your mess team.</p></div><span className="record-count">{nearbyPartners.length} partners</span></div>
      <div className="partner-list">{nearbyPartners.map((partner) => <article className="partner-row" key={partner.id}><div className="partner-mark"><Building2 size={17} /></div><div className="partner-details"><strong>{partner.name}</strong><span>{partner.contactName ? `${partner.contactName} · ` : ''}{partner.email}</span><small><MapPin size={12} />{partner.area} · {partner.distanceKm} km</small></div>{partner.phone && <a className="partner-phone" href={`tel:${partner.phone}`} aria-label={`Call ${partner.name}`}>{partner.phone}</a>}<button className="icon-button remove-partner" aria-label={`Remove ${partner.name}`} onClick={() => removePartner(partner)}><Trash2 size={15} /></button></article>)}</div>
      <details className="partner-add"><summary><Plus size={15} /> Add an NGO or community group</summary><PartnerForm onSaved={addPartner} /></details>
    </section>
    <section className="panel sustain-panel"><div className="panel-heading"><div><h2>Offer ready surplus</h2><p>Only list food your team has checked and confirmed as safe to donate.</p></div><span className="record-count">FOOD RESCUE</span></div>
      {!data?.meals.some((meal) => meal.actualConsumed !== null) ? <EmptyState title="Record plates served first" message="After a meal is served, record its consumed plate count in Attendance before listing surplus portions." /> : <form className="sustain-form rescue-form" onSubmit={createAlert}>
        <div className="sustain-form-grid"><label>Served meal<select value={mealId} onChange={(event) => setMealId(event.target.value)} required>{data.meals.filter((meal) => meal.actualConsumed !== null).map((meal) => <option value={meal.id} key={meal.id}>{shortDate(meal.date)} · {meal.type} · {meal.actualConsumed} consumed</option>)}</select></label><label>Ready surplus portions<input type="number" min="1" max="10000" step="1" value={form.portions} onChange={(event) => setForm({ ...form, portions: event.target.value })} placeholder="Count portions checked and ready" required /></label><label>Pickup location<input value={form.pickupLocation} onChange={(event) => setForm({ ...form, pickupLocation: event.target.value })} placeholder="Where the partner should collect" minLength={3} maxLength={200} required /></label><label>Collect before<input type="datetime-local" min={defaultPickupBy()} value={form.pickupBy} onChange={(event) => setForm({ ...form, pickupBy: event.target.value })} required /></label></div>
        <label>Pickup notes <span className="optional-label">OPTIONAL</span><textarea rows="2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Packing, access, or collection instructions" maxLength={500} /></label>
        <div className="recipient-picker"><div><strong>Who should receive this offer?</strong><span>Choose one or more groups from your nearby partner directory.</span></div>{!nearbyPartners.length ? <p className="inline-hint">Add a partner above before creating a rescue offer.</p> : <div className="recipient-list">{nearbyPartners.map((partner) => <label className="recipient-option" key={partner.id}><input type="checkbox" checked={partnerIds.includes(partner.id)} onChange={() => togglePartner(partner.id)} /><span><strong>{partner.name}</strong><small>{partner.area} · {partner.distanceKm} km</small></span><span className="recipient-email">{partner.email}</span></label>)}</div>}</div>
        <label className="safety-confirm"><input type="checkbox" checked={form.foodSafeConfirmed} onChange={(event) => setForm({ ...form, foodSafeConfirmed: event.target.checked })} required /><span><strong>Food safety check completed</strong><small>I confirm these portions are fresh, have been handled safely, and are suitable to donate before the pickup deadline.</small></span></label>
        <div className="rescue-submit-row"><button className="primary-button" disabled={saving || !nearbyPartners.length || !partnerIds.length}>{saving ? 'Saving offer…' : 'Save surplus offer'}<Send size={15} /></button><span>Saving creates a local record. You’ll compose and send the email from your email app.</span></div>
      </form>}
    </section>
    <section className="panel sustain-panel"><div className="panel-heading"><div><h2>Surplus offers</h2><p>Track partner response, pickup, and portions collected.</p></div><span className="record-count">{data?.alerts.length || 0} offers</span></div>{!data?.alerts.length ? <EmptyState icon={PackageCheck} title="No surplus offers yet" message="Safe, ready portions that you list for rescue will appear here." /> : <div className="offer-list">{data.alerts.map((alert) => { const status = alert.status || 'awaiting_response'; const active = ['awaiting_response', 'accepted'].includes(status); return <article className="offer-card" key={alert.id}><div className="offer-heading"><span className="offer-icon"><PackageCheck size={17} /></span><div><strong>{alert.portions} ready portions · {alert.mealType}</strong><small>{shortDate(alert.mealDate)} · Listed {new Date(alert.createdAt).toLocaleString()}</small></div><span className={`offer-state offer-state-${status}`}>{({ awaiting_response: 'AWAITING RESPONSE', accepted: 'ACCEPTED', picked_up: 'PICKED UP', expired: 'EXPIRED' })[status]}</span></div><div className="offer-meta"><span><MapPin size={13} />{alert.pickupLocation}</span><span><Clock3 size={13} />Collect before {new Date(alert.pickupBy).toLocaleString()}</span><span><Users size={13} />{alert.recipients.map((partner) => partner.name).join(', ')}</span></div>{status === 'picked_up' && <p className="offer-notes">Collected: {alert.collectedPortions} of {alert.portions} portions.</p>}{alert.notes && <p className="offer-notes">{alert.notes}</p>}{active && <div className="offer-followup">{status === 'awaiting_response' && <button className="secondary-button" onClick={() => void updateAlert(alert, 'accepted')}>Record partner acceptance</button>}{status === 'accepted' && <><label>Portions collected<input aria-label={`Portions collected for ${alert.mealType}`} type="number" min="1" max={alert.portions} step="1" value={collectionCounts[alert.id] ?? alert.portions} onChange={(event) => setCollectionCounts((current) => ({ ...current, [alert.id]: event.target.value }))} /></label><button className="primary-button" onClick={() => void updateAlert(alert, 'picked_up')}>Record pickup <PackageCheck size={14} /></button></>}{Date.parse(alert.pickupBy) > Date.now() && <button className="text-button danger-text" onClick={() => void updateAlert(alert, 'expired')}>Close offer</button>}</div>}{status === 'awaiting_response' && <div className="offer-action"><AlertEmailLink alert={alert} onOpen={() => toast('Email draft opened. Send it from your email app to contact the partners.')} /><span>Review and send the email draft, then record their response here.</span></div>}</article>; })}</div>}</section>
  </>;
}

export function CompostFarm() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sourceMealId: '', staleFoodKg: '', compostKg: '', processedOn: today(), readyOn: dateAfterDays(14), productionCost: '0', notes: '' });
  const [movement, setMovement] = useState({ batchId: '', type: 'farm', quantityKg: '', date: today(), revenue: '0', notes: '' });
  const toast = useToast();
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await api('/circularity');
      setData(result);
      setMovement((current) => ({ ...current, batchId: result.batches.some((batch) => batch.id === current.batchId) ? current.batchId : (result.batches.find((batch) => batch.remainingKg > 0 && batch.readyOn <= today())?.id || '') }));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const readyBatches = useMemo(() => (data?.batches || []).filter((batch) => batch.remainingKg > 0 && batch.readyOn <= today()), [data]);
  const createBatch = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api('/compost-batches', { method: 'POST', body: JSON.stringify({ ...form, staleFoodKg: Number(form.staleFoodKg), compostKg: Number(form.compostKg), productionCost: Number(form.productionCost) }) });
      setForm({ sourceMealId: '', staleFoodKg: '', compostKg: '', processedOn: today(), readyOn: dateAfterDays(14), productionCost: '0', notes: '' });
      toast('Compost batch recorded. It will be available on its ready date.');
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const recordMovement = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(`/compost-batches/${movement.batchId}/movements`, { method: 'POST', body: JSON.stringify({ ...movement, quantityKg: Number(movement.quantityKg), revenue: movement.type === 'sale' ? Number(movement.revenue) : 0 }) });
      setMovement((current) => ({ ...current, quantityKg: '', revenue: '0', notes: '' }));
      toast(movement.type === 'farm' ? 'Compost recorded as used on Shivalik Farm.' : 'Compost sale and proceeds recorded.');
      await load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  const selectedBatch = data?.batches.find((batch) => batch.id === movement.batchId);
  if (loading && !data) return <Spinner />;
  if (error && !data) return <div className="error-panel">{error}<button onClick={load}>Try again</button></div>;
  return <>
    <PageHeading eyebrow="FROM MESS SCRAPS TO SOIL" title="Compost & Shivalik Farm" subtitle="Track stale food diverted to compost, compost maturing, farm use, and recorded market sales." />
    {error && <div className="error-panel sustain-error">{error}<button onClick={load}>Refresh</button></div>}
    <div className="stat-grid circularity-stats"><StatCard label="Stale food composted" value={`${data.totals.staleFoodKg.toFixed(1)} kg`} detail="Recorded as compost inputs" icon={Recycle} tone="mint" /><StatCard label="Compost produced" value={`${data.totals.compostKg.toFixed(1)} kg`} detail="Across all recorded batches" icon={Leaf} tone="green" /><StatCard label="Used on Shivalik Farm" value={`${data.totals.farmKg.toFixed(1)} kg`} detail="Mature compost applied" icon={Shovel} tone="blue" /><StatCard label="Compost sales" value={currency(data.totals.revenue)} detail={`${data.totals.soldKg.toFixed(1)} kg sold · ${currency(data.totals.estimatedMargin)} estimated margin`} icon={Wallet} tone="amber" /></div>
    <div className="workflow-notice compost-notice"><div><Recycle size={18} /></div><p><strong>Food and compost follow separate paths.</strong> Only stale food is entered into a compost batch. Safe, ready surplus portions belong in Food rescue. Compost can be used or sold only from its recorded ready date; remaining stock is checked before each movement. Sales and proceeds here are local records only—there is no marketplace listing, payment collection, or transaction processing.</p></div>
    <section className="panel sustain-panel"><div className="panel-heading"><div><h2>Record stale food & compost output</h2><p>Record the measured input and finished compost; choose a maturation / ready date.</p></div><span className="record-count">NEW BATCH</span></div><form className="sustain-form" onSubmit={createBatch}><div className="sustain-form-grid"><label>Stale food input (kg)<input type="number" min="0.01" max="10000" step="0.01" value={form.staleFoodKg} onChange={(event) => setForm({ ...form, staleFoodKg: event.target.value })} placeholder="Weigh stale food" required /></label><label>Finished compost output (kg)<input type="number" min="0.01" max="10000" step="0.01" value={form.compostKg} onChange={(event) => setForm({ ...form, compostKg: event.target.value })} placeholder="Measured compost weight" required /></label><label>Processed on<input type="date" max={today()} value={form.processedOn} onChange={(event) => setForm({ ...form, processedOn: event.target.value, readyOn: event.target.value > form.readyOn ? event.target.value : form.readyOn })} required /></label><label>Compost ready from<input type="date" min={form.processedOn} value={form.readyOn} onChange={(event) => setForm({ ...form, readyOn: event.target.value })} required /></label><label>Recorded production costs (₹)<input type="number" min="0" max="100000000" step="0.01" value={form.productionCost} onChange={(event) => setForm({ ...form, productionCost: event.target.value })} required /></label><label>Source meal <span className="optional-label">OPTIONAL</span><select value={form.sourceMealId} onChange={(event) => setForm({ ...form, sourceMealId: event.target.value })}><option value="">Not linked to a meal</option>{data.meals.map((meal) => <option value={meal.id} key={meal.id}>{shortDate(meal.date)} · {meal.type}</option>)}</select></label></div><label>Batch notes <span className="optional-label">OPTIONAL</span><textarea rows="2" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Batch details or handling notes" maxLength={500} /></label><div className="rescue-submit-row"><button className="primary-button" disabled={saving}>{saving ? 'Saving batch…' : 'Record compost batch'}<Plus size={15} /></button><span>Sales margin = recorded sales proceeds − recorded production costs; enter the full costs you want included.</span></div></form></section>
    <section className="panel sustain-panel"><div className="panel-heading"><div><h2>Allocate ready compost</h2><p>Record mature compost applied on the farm or sold to market.</p></div><span className="record-count">{readyBatches.length} ready batches</span></div>{!readyBatches.length ? <EmptyState icon={Clock3} title="No compost ready to allocate yet" message="Batches become available on their ready date. Until then they remain in the maturation record." /> : <form className="sustain-form" onSubmit={recordMovement}><div className="sustain-form-grid"><label>Compost batch<select value={movement.batchId} onChange={(event) => setMovement({ ...movement, batchId: event.target.value })} required>{readyBatches.map((batch) => <option value={batch.id} key={batch.id}>{shortDate(batch.processedOn)} · {batch.remainingKg.toFixed(2)} kg available</option>)}</select></label><label>Allocation<select value={movement.type} onChange={(event) => setMovement({ ...movement, type: event.target.value, revenue: '0' })}><option value="farm">Use on Shivalik Farm</option><option value="sale">Sell to market</option></select></label><label>Weight allocated (kg)<input type="number" min="0.01" max={selectedBatch?.remainingKg || 10000} step="0.01" value={movement.quantityKg} onChange={(event) => setMovement({ ...movement, quantityKg: event.target.value })} placeholder={`Up to ${(selectedBatch?.remainingKg || 0).toFixed(2)} kg`} required /></label><label>Allocation date<input type="date" min={selectedBatch?.readyOn || today()} max={today()} value={movement.date} onChange={(event) => setMovement({ ...movement, date: event.target.value })} required /></label>{movement.type === 'sale' && <label>Actual sale proceeds (₹)<input type="number" min="0.01" max="100000000" step="0.01" value={movement.revenue} onChange={(event) => setMovement({ ...movement, revenue: event.target.value })} required /></label>}</div><label>Allocation notes <span className="optional-label">OPTIONAL</span><input value={movement.notes} onChange={(event) => setMovement({ ...movement, notes: event.target.value })} placeholder={movement.type === 'sale' ? 'Sale reference or buyer notes' : 'Farm plot or application notes'} maxLength={500} /></label><div className="rescue-submit-row"><button className="primary-button" disabled={saving}>{saving ? 'Recording…' : movement.type === 'farm' ? 'Record farm use' : 'Record market sale'}{movement.type === 'farm' ? <Shovel size={15} /> : <Wallet size={15} />}</button><span>{movement.type === 'farm' ? 'Destination is recorded as Shivalik Farm.' : 'Only actual recorded sale proceeds count toward revenue.'}</span></div></form>}</section>
    <section className="panel sustain-panel"><div className="panel-heading"><div><h2>Compost batches & stock</h2><p>Remaining compost, maturation dates, farm allocations, and sales.</p></div><span className="record-count">{data.batches.length} batches</span></div>{!data.batches.length ? <EmptyState icon={Leaf} title="No compost batches recorded" message="Log stale food and measured compost output to start the farm and market stock ledger." /> : <div className="compost-batch-list">{data.batches.map((batch) => <article className="compost-batch" key={batch.id}><div className="compost-batch-top"><span className="compost-batch-icon"><Leaf size={17} /></span><div><strong>{batch.staleFoodKg.toFixed(2)} kg stale food → {batch.compostKg.toFixed(2)} kg compost</strong><small>Processed {shortDate(batch.processedOn)} · Ready {shortDate(batch.readyOn)}</small></div><span className={`stock-badge ${batch.remainingKg > 0 ? 'stock-available' : 'stock-empty'}`}>{batch.readyOn > today() ? 'MATURING' : `${batch.remainingKg.toFixed(2)} KG LEFT`}</span></div><div className="batch-stock-line"><span><Shovel size={13} />Farm {batch.farmKg.toFixed(2)} kg</span><span><Wallet size={13} />Sold {batch.soldKg.toFixed(2)} kg · {currency(batch.revenue)}</span><span><Recycle size={13} />Recorded batch cost {currency(batch.productionCost)}</span></div>{batch.notes && <p className="offer-notes">{batch.notes}</p>}</article>)}</div>}</section>
  </>;
}

import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail, Utensils } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';

export function LoginPage() {
  const [register, setRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', room: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { establishSession } = useAuth();
  const toast = useToast();
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(form) });
      establishSession(result);
      toast(register ? 'Your student account is ready.' : `Welcome back, ${result.user.name.split(' ')[0]}.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const fillDemo = (role) => setForm((current) => ({ ...current, email: role === 'manager' ? 'manager@messmeter.local' : 'student@messmeter.local', password: role === 'manager' ? 'manager123' : 'student123' }));
  return <div className="login-page">
    <div className="login-aside"><div className="login-brand"><div className="brand-icon"><Utensils size={19} /></div><span className="brand-name">Shivalik <span className="brand-accent">Mess Meter</span></span></div><div className="login-art"><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-leaf"><Leaf size={39} /></div><div className="art-card"><div className="art-card-icon"><Utensils size={17} /></div><div><strong>Smarter servings</strong><span>Every plate makes a difference</span></div><div className="art-check">✓</div></div></div><div className="login-aside-copy"><span className="eyebrow">A BETTER KIND OF MESS</span><h2>Good food.<br /><em>Less waste.</em></h2><p>Know what’s cooking. Save your seat. Help your mess make just enough.</p><div className="login-proof"><span><i /> Thoughtful by design</span><span><i /> Built for campus life</span></div></div><div className="login-aside-footer">© 2026 Kanishk Chandan · Shivalik Mess Meter <span>·</span> Eat well, waste less.</div></div>
    <main className="login-main"><div className="login-mobile-brand"><div className="brand-icon"><Utensils size={18} /></div><span className="brand-name">Shivalik <span className="brand-accent">Mess Meter</span></span></div><section className="login-box"><div className="login-welcome"><div className="eyebrow">{register ? 'JOIN YOUR CAMPUS MESS' : 'WELCOME BACK'}</div><h1>{register ? 'Create your account' : 'Sign in to Shivalik Mess Meter'}</h1><p>{register ? 'A better mess starts with all of us.' : 'Your mess, a little more in sync.'}</p></div><div className="auth-tabs"><button className={!register ? 'auth-tab-active' : ''} onClick={() => { setRegister(false); setError(''); }}>Sign in</button><button className={register ? 'auth-tab-active' : ''} onClick={() => { setRegister(true); setError(''); }}>Create account</button></div>
      <form className="login-form" onSubmit={submit}>{register && <><label>Your name<div className="input-wrap"><input value={form.name} onChange={update('name')} autoComplete="name" placeholder="e.g. Sam Taylor" required minLength={2} maxLength={60} /></div></label><label>Room number <span className="optional-label">OPTIONAL</span><div className="input-wrap"><input value={form.room} onChange={update('room')} placeholder="e.g. B-214" maxLength={20} /></div></label></>}
        <label>Email address<div className="input-wrap"><Mail size={17} /><input type="email" value={form.email} onChange={update('email')} autoComplete="email" placeholder="you@college.edu" required /></div></label><label>Password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} value={form.password} onChange={update('password')} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 6 characters' : 'Enter your password'} required minLength={register ? 6 : undefined} /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
        {error && <div className="form-error" role="alert">{error}</div>}<button className="primary-button login-submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}{!busy && <ArrowRight size={17} />}</button>
      </form>{!register && <div className="demo-logins"><div className="demo-label"><span>QUICK DEMO ACCESS</span><i /></div><div className="demo-buttons"><button onClick={() => fillDemo('student')}><span className="demo-avatar demo-student">S</span><span><b>Student</b><small>Try the student view</small></span><ArrowRight size={15} /></button><button onClick={() => fillDemo('manager')}><span className="demo-avatar demo-manager">M</span><span><b>Manager</b><small>Try the manager view</small></span><ArrowRight size={15} /></button></div></div>}
      <div className="login-privacy"><LockKeyhole size={13} /> Your details stay private and secure.</div></section><div className="login-mobile-footer">© 2026 Kanishk Chandan · Shivalik Mess Meter</div></main>
  </div>;
}

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore, user, isOverdue } from '../store';
import { USERS, ROLES } from '../seed';
import { Icon, Boundary, Skeleton } from './common';
import { fmtDT } from '../util';

export const NAV = [
  { id: 'command', label: 'Command Centre', icon: 'LayoutDashboard' },
  { id: 'fls', label: 'Fracture Liaison Service', icon: 'Bone' },
  { id: 'med', label: 'Medication Safety', icon: 'Pill' },
  { id: 'studio', label: 'Workflow Studio', icon: 'Workflow' },
  { id: 'worklists', label: 'Patient Worklists', icon: 'Users' },
  { id: 'reviews', label: 'Clinical Review Queue', icon: 'Stethoscope' },
  { id: 'tasks', label: 'Task Management', icon: 'ClipboardCheck' },
  { id: 'comms', label: 'Communications', icon: 'Mail' },
  { id: 'integrations', label: 'Integration Hub', icon: 'Plug' },
  { id: 'analytics', label: 'Analytics and Reporting', icon: 'BarChart3' },
  { id: 'governance', label: 'Governance and Audit', icon: 'ShieldCheck' },
  { id: 'admin', label: 'Administration', icon: 'Settings' },
];

function useNotifications() {
  const db = useStore(s => s.db); const uid = useStore(s => s.userId); const role = user(uid).role;
  return useMemo(() => {
    const n: any[] = [];
    db.reviews.filter((r: any) => r.status === 'awaiting').forEach((r: any) => n.push({ id: r.id, icon: 'Stethoscope', tone: 'purple', text: `${r.type} awaiting ${ROLES[r.requiredRole].label.toLowerCase()}`, pid: r.patientId, page: 'reviews', params: { id: r.id }, mine: r.requiredRole === role }));
    db.tasks.filter(isOverdue).forEach((t: any) => n.push({ id: t.id, icon: 'Timer', tone: 'red', text: `Overdue: ${t.title}`, pid: t.patientId, page: 'tasks', params: { id: t.id }, mine: t.assignedRole === role }));
    db.exceptions.filter((e: any) => e.status === 'open' && ['urgent', 'high'].includes(e.priority)).forEach((e: any) => n.push({ id: e.id, icon: 'OctagonAlert', tone: 'amber', text: `${e.category}`, pid: e.patientId, page: 'patient', params: { id: e.patientId, tab: 'overview' }, mine: false }));
    db.integrations.filter((a: any) => a.health === 'down').forEach((a: any) => n.push({ id: a.id, icon: 'Plug', tone: 'red', text: `${a.name} unavailable`, page: 'integrations', params: {}, mine: role === 'administrator' }));
    return n.sort((a, b) => Number(b.mine) - Number(a.mine));
  }, [db, role]);
}

function Search() {
  const db = useStore(s => s.db); const go = useStore(s => s.go); const [q, setQ] = useState(''); const [open, setOpen] = useState(false);
  const res = useMemo(() => { if (q.trim().length < 2) return []; const s = q.toLowerCase().replace(/\s/g, '');
    return [
      ...db.patients.filter((p: any) => (p.name + p.nhsNumber + p.id).toLowerCase().replace(/\s/g, '').includes(s)).map((p: any) => ({ k: p.id, icon: 'User', t: p.name, d: `${p.nhsNumber} (synthetic) · ${p.service === 'fls' ? 'FLS' : 'Medication safety'}`, go: () => go('patient', { id: p.id }) })),
      ...db.tasks.filter((t: any) => (t.id + t.title).toLowerCase().replace(/\s/g, '').includes(s)).slice(0, 5).map((t: any) => ({ k: t.id, icon: 'ClipboardCheck', t: t.title, d: t.id, go: () => go('tasks', { id: t.id }) })),
      ...db.reviews.filter((r: any) => r.id.toLowerCase().includes(s)).map((r: any) => ({ k: r.id, icon: 'Stethoscope', t: r.type, d: r.id, go: () => go('reviews', { id: r.id }) })),
    ].slice(0, 8); }, [q, db]);
  return <div className="search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as any)) setOpen(false); }}>
    <Icon name="Search" size={17} /><input aria-label="Search patients, tasks and reviews" placeholder="Search patients, NHS number, tasks" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
    {open && q.length > 1 && <div className="dropdown search-res">{res.length ? res.map(r => <button key={r.k} onClick={() => { r.go(); setQ(''); setOpen(false); }}><Icon name={r.icon} size={16} /><span><strong>{r.t}</strong><small>{r.d}</small></span></button>) : <p className="muted pad12">No matches for “{q}”.</p>}</div>}
  </div>;
}

function Notifications() {
  const n = useNotifications(); const go = useStore(s => s.go); const [open, setOpen] = useState(false); const mine = n.filter(x => x.mine).length;
  return <div className="notif" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as any)) setOpen(false); }}>
    <button className="icon-btn" aria-label={`Notifications, ${n.length} items`} aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="Bell" />{n.length > 0 && <span className={`dot${mine ? ' mine' : ''}`}>{n.length}</span>}</button>
    {open && <div className="dropdown notif-list"><header><strong>Notifications</strong><small>{mine} for your role</small></header>
      {n.length ? n.slice(0, 14).map(x => <button key={x.id} onClick={() => { go(x.page, x.params); setOpen(false); }}><span className={`ni tone-${x.tone}`}><Icon name={x.icon} size={15} /></span><span>{x.text}{x.mine && <small> · your role</small>}</span></button>) : <p className="muted pad12">Nothing needs attention.</p>}
    </div>}
  </div>;
}

export function Shell({ pages }: { pages: Record<string, any> }) {
  const nav = useStore(s => s.nav); const go = useStore(s => s.go); const uid = useStore(s => s.userId); const setUser = useStore(s => s.setUser);
  const toasts = useStore(s => s.toasts); const playing = useStore(s => s.playing); const speed = useStore(s => s.speed); const step = useStore(s => s.step); const db = useStore(s => s.db);
  const [menu, setMenu] = useState(false); const [loading, setLoading] = useState(false);
  useEffect(() => { if (!playing) return; const t = setInterval(() => step(playing), speed); return () => clearInterval(t); }, [playing, speed]);
  useEffect(() => { setLoading(true); setMenu(false); const t = setTimeout(() => setLoading(false), 180); return () => clearTimeout(t); }, [nav.page, nav.params?.id]);
  const counts: any = { reviews: db.reviews.filter((r: any) => r.status === 'awaiting').length, tasks: db.tasks.filter(isOverdue).length };
  const Page = pages[nav.page] || pages.command; const active = nav.page === 'patient' ? 'worklists' : nav.page;
  const u = user(uid);
  return <div className="app">
    <a href="#main" className="skip">Skip to content</a>
    <aside className={`side${menu ? ' open' : ''}`} aria-label="Main navigation">
      <div className="brand"><span className="brand-mark" aria-hidden="true"><Icon name="Network" size={20} /></span><span><strong>Care Coordination</strong><small>Prototype · synthetic data</small></span></div>
      <nav>{NAV.map(n => <button key={n.id} className={active === n.id ? 'on' : ''} aria-current={active === n.id ? 'page' : undefined} onClick={() => go(n.id)}><Icon name={n.icon} size={18} /><span>{n.label}</span>{counts[n.id] > 0 && <span className={`nav-n${n.id === 'tasks' ? ' red' : ''}`}>{counts[n.id]}</span>}</button>)}</nav>
      <p className="side-foot">Not an approved clinical system. All patients are fictional. No live NHS integrations.</p>
    </aside>
    {menu && <div className="scrim" onClick={() => setMenu(false)} />}
    <div className="main-col">
      <header className="top">
        <button className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setMenu(true)}><Icon name="Menu" /></button>
        <Search />
        <div className="row gap12 top-r">
          <span className="env" title="This environment contains only fictional data">Synthetic environment</span>
          <Notifications />
          <label className="who"><span className="avatar" aria-hidden="true">{u.name.split(' ').filter((x: string) => !x.startsWith('Dr')).map((x: string) => x[0]).join('').slice(0, 2)}</span>
            <span className="who-t"><strong>{u.name}</strong><small>{ROLES[u.role].label}</small></span>
            <select aria-label="Switch demo user and role" value={uid} onChange={e => setUser(e.target.value)}>{USERS.map(x => <option key={x.id} value={x.id}>{x.name} ({ROLES[x.role].label})</option>)}</select>
          </label>
        </div>
      </header>
      <main id="main" tabIndex={-1}><Boundary key={nav.page + (nav.params?.id || '')}>{loading ? <Skeleton /> : <Page params={nav.params} />}</Boundary></main>
    </div>
    <div className="toasts" role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className={`toast tone-${t.kind === 'ok' ? 'green' : t.kind === 'warn' ? 'amber' : t.kind === 'error' ? 'red' : 'blue'}`}><Icon name={t.kind === 'ok' ? 'CircleCheck' : t.kind === 'info' ? 'Info' : 'CircleAlert'} size={18} /><span>{t.msg}</span></div>)}</div>
  </div>;
}

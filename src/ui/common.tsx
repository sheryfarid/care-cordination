import React, { useState, useEffect, useRef } from 'react';
import * as L from './icons';
import { fmtDate, fmtDT, ageDays, titleCase } from '../util';
import { useStore } from '../store';

export const Icon = ({ name, size = 18, ...rest }: any) => { const C = (L as any)[name] || L.Circle; return <C size={size} aria-hidden="true" strokeWidth={1.9} {...rest} />; };

export const STATUS_TONE: Record<string, string> = {
  completed: 'green', closed: 'green', decided: 'green', acknowledged: 'green', resolved: 'green', healthy: 'green', 'Evidence reviewed': 'green', signed_off: 'green', approved: 'green', published: 'blue',
  running: 'blue', open: 'blue', assigned: 'blue', in_progress: 'blue', sent: 'blue', monitoring: 'blue', draft: 'grey', upcoming: 'grey', superseded: 'grey', retired: 'grey', cancelled: 'grey', discarded: 'grey', not_configured: 'grey', 'Not assessed': 'grey', skipped: 'grey', pending: 'grey',
  awaiting_information: 'amber', awaiting: 'purple', awaiting_approval: 'purple', awaiting_clinical_review: 'purple', degraded: 'amber', 'In progress': 'amber', reviewed: 'green',
  failed: 'red', escalated: 'red', delivery_failed: 'red', down: 'red', stopped: 'grey', urgent: 'red', high: 'amber', medium: 'blue', low: 'grey',
};
export const STATUS_TEXT: Record<string, string> = { awaiting_approval: 'Awaiting approval', awaiting_information: 'Awaiting information', awaiting: 'Awaiting decision', in_progress: 'In progress', delivery_failed: 'Delivery failed', not_configured: 'Not configured', signed_off: 'Signed off', awaiting_clinical_review: 'Awaiting clinical review' };
export const Pill = ({ s, tone, children }: any) => <span className={`pill tone-${tone || STATUS_TONE[s] || 'grey'}`}>{children || STATUS_TEXT[s] || titleCase(String(s))}</span>;
export const Synthetic = ({ children = 'Synthetic' }: any) => <span className="pill tone-syn" title="Fictional demonstration data">{children}</span>;

export const Btn = ({ kind = 'secondary', icon, children, small, ...rest }: any) => <button className={`btn btn-${kind}${small ? ' btn-sm' : ''}`} {...rest}>{icon && <Icon name={icon} size={small ? 15 : 17} />}{children}</button>;

export const Card = ({ title, actions, children, help, className = '', pad = true }: any) => (
  <section className={`card ${className}`}>
    {(title || actions) && <header className="card-h"><h3>{title}{help && <Help text={help} />}</h3><div className="row gap8">{actions}</div></header>}
    <div className={pad ? 'card-b' : ''}>{children}</div>
  </section>
);

export const Help = ({ text }: { text: string }) => {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { const h = (e: any) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, []);
  return <span className="help" ref={ref}><button className="help-btn" aria-label="Help" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="CircleHelp" size={15} /></button>{open && <span role="tooltip" className="help-pop">{text}</span>}</span>;
};

export const Kpi = ({ label, value, tone = 'blue', icon, onClick, sub }: any) => (
  <button className={`kpi kpi-${tone}`} onClick={onClick}>
    <span className="kpi-icon"><Icon name={icon} size={20} /></span>
    <span className="kpi-v">{value}</span><span className="kpi-l">{label}</span>{sub && <span className="kpi-s">{sub}</span>}
  </button>
);

export const Empty = ({ icon = 'Inbox', title, children, action }: any) => <div className="empty"><Icon name={icon} size={28} /><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;

export const Table = ({ cols, rows, onRow, empty, rowKey = 'id', dense }: any) => rows.length === 0 ? (empty || <Empty title="Nothing to show" />) : (
  <div className="tbl-wrap"><table className={`tbl${dense ? ' dense' : ''}`}>
    <thead><tr>{cols.map((c: any) => <th key={c.k} style={{ width: c.w }}>{c.h}</th>)}</tr></thead>
    <tbody>{rows.map((r: any) => <tr key={r[rowKey]} className={onRow ? 'clickable' : ''} onClick={onRow ? () => onRow(r) : undefined} tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === 'Enter') onRow(r); } : undefined}>{cols.map((c: any) => <td key={c.k}>{c.r ? c.r(r) : r[c.k]}</td>)}</tr>)}</tbody>
  </table></div>
);

export const Tabs = ({ tabs, value, onChange }: any) => (
  <div className="tabs" role="tablist">{tabs.map((t: any) => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? 'on' : ''} onClick={() => onChange(t.id)}>{t.icon && <Icon name={t.icon} size={16} />}{t.label}{t.count !== undefined && <span className="tab-n">{t.count}</span>}</button>)}</div>
);

export const Modal = ({ title, onClose, children, wide }: any) => {
  useEffect(() => { const h = (e: any) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return <div className="modal-bg" onClick={onClose}><div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}><header className="card-h"><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="X" /></button></header><div className="modal-b">{children}</div></div></div>;
};

export const Field = ({ label, children, hint }: any) => <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;

// Source provenance for any clinical value. Missing values are explicit and never shown as normal.
export const Provenance = ({ source, at, status, verification }: any) => (
  <span className="prov"><Icon name="Database" size={13} /> {source || 'Unknown source'}{at && <> · {fmtDT(at)}</>}{status && <> · {status}</>}{verification && <> · {verification}</>}</span>
);
export const LabValue = ({ o, maxAge }: any) => {
  if (!o) return <span className="missing"><Icon name="CircleAlert" size={15} /> Not available</span>;
  const age = ageDays(o.effective); const old = maxAge !== undefined && age > maxAge;
  return <span className={old ? 'stale' : ''}><strong>{o.value}</strong> {o.unit} <span className="muted">({fmtDate(o.effective)}, {age} days{old ? `, older than ${maxAge}-day limit` : ''})</span></span>;
};

export const Skeleton = () => <div className="skel" aria-busy="true" aria-label="Loading"><div /><div /><div /></div>;

export class Boundary extends React.Component<any, { err: any }> {
  state = { err: null as any };
  static getDerivedStateFromError(err: any) { return { err }; }
  render() { return this.state.err ? <div className="card card-b err"><Icon name="OctagonAlert" /> <div><strong>This screen failed to load.</strong><p>{String(this.state.err?.message || this.state.err)}</p><Btn onClick={() => this.setState({ err: null })}>Try again</Btn></div></div> : this.props.children; }
}

export const PatientLink = ({ id }: any) => { const db = useStore(s => s.db); const go = useStore(s => s.go); const p = db.patients.find((x: any) => x.id === id); return p ? <button className="link" onClick={(e) => { e.stopPropagation(); go('patient', { id }); }}>{p.name}</button> : <>{id}</>; };
export const due = (iso: string, status?: string) => { const d = ageDays(iso); const open = !['completed', 'cancelled'].includes(status || ''); return <span className={open && d > 0 ? 'overdue' : ''}>{fmtDate(iso)}{open && d > 0 ? ` · ${d}d overdue` : ''}</span>; };
export const PageHead = ({ title, sub, actions, crumbs }: any) => {
  const go = useStore(s => s.go);
  return <div className="page-h">
    <nav aria-label="Breadcrumb" className="crumbs"><button className="link" onClick={() => go('command')}>Home</button>{(crumbs || []).map((c: any, i: number) => <React.Fragment key={i}><Icon name="ChevronRight" size={14} />{c.page ? <button className="link" onClick={() => go(c.page, c.params)}>{c.label}</button> : <span>{c.label}</span>}</React.Fragment>)}<Icon name="ChevronRight" size={14} /><span aria-current="page">{title}</span></nav>
    <div className="row between wrap gap12"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div><div className="row gap8 wrap">{actions}</div></div>
  </div>;
};

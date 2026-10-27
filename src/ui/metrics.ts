import { isOverdue } from '../store';
import { ageDays, TODAY, addDays } from '../util';

export const latestExec = (db: any, pid: string) => [...db.executions].reverse().find((e: any) => e.patientId === pid && e.status !== 'superseded');
export const svcFilter = (svc: string) => (x: any) => svc === 'all' || x.service === svc;

export function patientFlags(db: any, p: any) {
  const ex = latestExec(db, p.id); const f = ex?.ctx?.findings || {};
  const tasks = db.tasks.filter((t: any) => t.patientId === p.id && !['completed', 'cancelled'].includes(t.status));
  const ref = db.referrals.find((r: any) => r.patientId === p.id);
  return {
    exec: ex,
    incomplete: !!(ex && ['awaiting_information', 'awaiting_approval', 'failed'].includes(ex.status) && ((f.missing?.length) || (f.outdated?.length) || (f.conflicts?.length) || ex.status === 'failed')),
    awaitingReview: db.reviews.some((r: any) => r.patientId === p.id && r.status === 'awaiting'),
    overdue: tasks.some(isOverdue),
    openTasks: tasks.length,
    pendingHandover: p.service === 'med' && (!ref || ['sent', 'delivery_failed'].includes(ref.status)) && p.pathwayStatus !== 'Coordination closed',
    exceptions: db.exceptions.filter((e: any) => e.patientId === p.id && e.status === 'open'),
    closed: ex?.status === 'completed',
    active: !['Coordination closed'].includes(p.pathwayStatus),
  };
}

export function kpis(db: any, svc: string) {
  const pts = db.patients.filter(svcFilter(svc)); const flags = pts.map((p: any) => patientFlags(db, p));
  const tasks = db.tasks.filter(svcFilter(svc));
  return {
    active: flags.filter((f: any) => f.active).length,
    openTasks: tasks.filter((t: any) => !['completed', 'cancelled'].includes(t.status)).length,
    review: db.reviews.filter(svcFilter(svc)).filter((r: any) => r.status === 'awaiting').length,
    overdue: tasks.filter(isOverdue).length,
    incomplete: flags.filter((f: any) => f.incomplete).length,
    handovers: flags.filter((f: any) => f.pendingHandover).length,
    completed: db.executions.filter(svcFilter(svc)).filter((e: any) => e.status === 'completed').length,
    failedInt: db.integrations.filter((a: any) => (svc === 'all' || a.service === svc) && a.health === 'down').length + db.referrals.filter((r: any) => r.status === 'delivery_failed' && (svc === 'all' || svc === 'med')).length,
  };
}

export function charts(db: any, svc: string) {
  const tasks = db.tasks.filter(svcFilter(svc)); const open = tasks.filter((t: any) => !['completed', 'cancelled'].includes(t.status));
  const days = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i - 13).slice(0, 10));
  const trend = days.map(d => ({ name: d.slice(8, 10) + '/' + d.slice(5, 7), created: tasks.filter((t: any) => t.createdAt.slice(0, 10) === d).length, completed: tasks.filter((t: any) => t.status === 'completed' && (t.history.find((h: any) => /Complet/.test(h.what))?.at || t.due).slice(0, 10) === d).length }));
  const by = (arr: any[], key: (x: any) => string, order?: string[]) => { const m: any = {}; arr.forEach(x => { const k = key(x); m[k] = (m[k] || 0) + 1; }); return (order || Object.keys(m)).map(k => ({ name: k, value: m[k] || 0 })); };
  const ex = db.executions.filter(svcFilter(svc)).filter((e: any) => e.status !== 'superseded');
  const ovd = open.filter(isOverdue).map((t: any) => ageDays(t.due));
  const refs = db.referrals.filter((r: any) => svc !== 'fls');
  const PRI: any = { urgent: 'var(--red)', high: 'var(--amber-strong)', medium: 'var(--blue)', low: 'var(--grey)' };
  const ST: any = { completed: 'var(--green)', awaiting_approval: 'var(--purple)', awaiting_information: 'var(--amber-strong)', monitoring: 'var(--blue)', failed: 'var(--red)', stopped: 'var(--grey)', running: 'var(--blue)' };
  return {
    trend,
    priority: by(open, t => t.priority, ['urgent', 'high', 'medium', 'low']).map(d => ({ ...d, color: PRI[d.name] })),
    execStatus: by(ex, e => e.status, ['completed', 'awaiting_approval', 'awaiting_information', 'monitoring', 'failed', 'stopped']).map(d => ({ ...d, color: ST[d.name], name: d.name.replace(/_/g, ' ') })),
    exceptions: by(db.exceptions.filter(svcFilter(svc)).filter((e: any) => e.status === 'open'), e => e.category),
    ageing: [{ name: '1–3 days', value: ovd.filter((d: number) => d <= 3).length }, { name: '4–7 days', value: ovd.filter((d: number) => d > 3 && d <= 7).length }, { name: '8–14 days', value: ovd.filter((d: number) => d > 7 && d <= 14).length }, { name: '15+ days', value: ovd.filter((d: number) => d > 14).length }],
    handover: [{ name: 'Acknowledged', value: refs.filter((r: any) => r.status === 'acknowledged').length, color: 'var(--green)' }, { name: 'Awaiting ack', value: refs.filter((r: any) => r.status === 'sent').length, color: 'var(--amber-strong)' }, { name: 'Delivery failed', value: refs.filter((r: any) => r.status === 'delivery_failed').length, color: 'var(--red)' }],
    workload: by(open, t => t.assignedRole, ['nurse', 'clinician', 'pharmacist', 'administrator', 'service_manager']).map(d => ({ ...d, name: d.name.replace('_', ' ') })),
  };
}

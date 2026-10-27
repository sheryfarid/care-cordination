import { uid, nowIso, addDays, TODAY, fnv, ageDays } from './util';
import { ROLES, USERS } from './seed';

export class PermissionError extends Error { code = 'FORBIDDEN'; }

// Shared platform services: tasks, reviews, exceptions, communications, referrals, audit.
// They operate on the db object passed in, so a dry run can use a disposable copy.
export function makeSvc(db: any) {
  const audit = (actor: string, action: string, entity: string, entityId: string, detail: string, patientId?: string | null, correlationId?: string) => {
    const prev = db.audit[db.audit.length - 1]?.hash || 'GENESIS';
    const ev = { id: uid('AUD'), at: nowIso(), actor, action, entity, entityId, detail, patientId: patientId || null, correlationId: correlationId || null, prevHash: prev, hash: '' };
    ev.hash = fnv(prev + JSON.stringify({ ...ev, hash: '' }));
    db.audit.push(ev); return ev;
  };
  const can = (userId: string, perm: string) => { const u = USERS.find(x => x.id === userId); return !!u && ROLES[u.role].perms.includes(perm); };
  const require = (userId: string, perm: string, what: string) => {
    if (!can(userId, perm)) {
      const u = USERS.find(x => x.id === userId);
      audit(u?.name || userId, 'permission.denied', 'permission', perm, `Denied: ${what}`);
      throw new PermissionError(`${u ? ROLES[u.role].label : 'This user'} does not have permission to ${what}.`);
    }
  };
  const userName = (id: string) => USERS.find(x => x.id === id)?.name || id;

  const createTask = (t: any, corr?: string) => {
    const key = t.idempotencyKey || `${t.patientId}:${t.type}`;
    const existing = db.tasks.find((x: any) => x.idempotencyKey === key && !['completed', 'cancelled'].includes(x.status));
    if (existing) { audit('Workflow engine', 'task.duplicate_suppressed', 'task', existing.id, `Repeated trigger matched open task ${existing.id}`, t.patientId, corr); return { task: existing, duplicate: true }; }
    const task = { id: uid('TSK'), status: t.assignedUser ? 'assigned' : 'open', assignedUser: null, createdAt: nowIso(), escalationPolicy: 'Escalate to service manager 2 days after due date (synthetic rule R-ESC-001)', evidence: null, history: [{ at: nowIso(), by: 'Workflow engine', what: 'Task created' }], ...t, idempotencyKey: key };
    db.tasks.push(task); audit('Workflow engine', 'task.created', 'task', task.id, task.title, t.patientId, corr); return { task, duplicate: false };
  };
  const updateTask = (id: string, patch: any, actor: string, what: string) => {
    require(actor, 'task.update', 'update tasks');
    const t = db.tasks.find((x: any) => x.id === id); if (!t) throw new Error('Task not found');
    if (patch.status === 'completed' && !patch.evidence && !t.evidence) throw new Error('Completion evidence is required to complete a task.');
    Object.assign(t, patch); t.history.push({ at: nowIso(), by: userName(actor), what });
    audit(userName(actor), 'task.updated', 'task', id, what, t.patientId); return t;
  };
  const createException = (x: any, corr?: string) => {
    const existing = db.exceptions.find((e: any) => e.patientId === x.patientId && e.category === x.category && e.status === 'open');
    if (existing) return { exception: existing, duplicate: true };
    const ex = { id: uid('EXC'), status: 'open', createdAt: nowIso(), ...x };
    db.exceptions.push(ex); audit('Workflow engine', 'exception.raised', 'exception', ex.id, `${x.category}: ${x.summary}`, x.patientId, corr); return { exception: ex, duplicate: false };
  };
  const resolveException = (id: string, note: string, actor: string) => {
    require(actor, 'task.update', 'resolve exceptions');
    const ex = db.exceptions.find((e: any) => e.id === id); ex.status = 'resolved'; ex.resolvedAt = nowIso(); ex.resolution = note; ex.resolvedBy = userName(actor);
    audit(userName(actor), 'exception.resolved', 'exception', id, note, ex.patientId);
  };
  const createReview = (r: any, corr?: string) => {
    const rev = { id: uid('REV'), status: 'awaiting', createdAt: nowIso(), decision: null, ...r };
    db.reviews.push(rev); audit('Workflow engine', 'review.requested', 'review', rev.id, r.type, r.patientId, corr); return rev;
  };
  const createComm = (c: any, corr?: string) => {
    const existing = db.communications.find((x: any) => x.patientId === c.patientId && x.template === c.template && x.status === 'draft');
    if (existing) return { comm: existing, duplicate: true };
    const comm = { id: uid('COM'), status: 'draft', createdAt: nowIso(), signedOffBy: null, versions: [], ...c };
    db.communications.push(comm); audit('Workflow engine', 'communication.drafted', 'communication', comm.id, c.template, c.patientId, corr); return { comm, duplicate: false };
  };
  const adapterCall = (adapterId: string, attempt: number) => {
    const a = db.integrations.find((x: any) => x.id === adapterId);
    if (!a) throw new Error(`Adapter ${adapterId} not configured`);
    if (a.health === 'down') throw new Error(`${a.name} unavailable (synthetic outage)`);
    if (a.health === 'degraded' && attempt === 1) throw new Error(`${a.name} timed out on first attempt (synthetic)`);
    return a;
  };
  const sendReferral = (patient: any, corr?: string) => {
    const key = `${patient.id}:dms`;
    const existing = db.referrals.find((r: any) => r.idempotencyKey === key);
    if (existing) { audit('Workflow engine', 'referral.duplicate_suppressed', 'referral', existing.id, 'Existing referral reused; not re-sent', patient.id, corr); return { referral: existing, duplicate: true }; }
    const a = db.integrations.find((x: any) => x.id === 'dms');
    const failed = a.health === 'down' || patient.ack === 'fail';
    const ref = { id: uid('REF'), patientId: patient.id, type: 'Discharge Medicines Service referral', channel: 'Synthetic DMS adapter', status: failed ? 'delivery_failed' : patient.ack === 'ack' ? 'acknowledged' : 'sent', sentAt: nowIso(), ackAt: !failed && patient.ack === 'ack' ? nowIso() : null, idempotencyKey: key, error: failed ? 'Synthetic delivery failure: recipient endpoint rejected message' : null };
    db.referrals.push(ref); audit('Workflow engine', failed ? 'referral.delivery_failed' : 'referral.sent', 'referral', ref.id, ref.type, patient.id, corr); return { referral: ref, duplicate: false };
  };
  return { audit, can, require, userName, createTask, updateTask, createException, resolveException, createReview, createComm, adapterCall, sendReferral, today: TODAY, addDays, ageDays };
}
export type Svc = ReturnType<typeof makeSvc>;

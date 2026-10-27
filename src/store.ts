import { create } from 'zustand';
import { buildSeed, USERS, ROLES } from './seed';
import { makeSvc, PermissionError } from './services';
import { startExecution, stepExecution, runToPause, resumeAfterReview, aiSources } from './engine';
import { validateWorkflow } from './workflows';
import { runRuleTests, activeVersion } from './rules';
import { mockProvider } from './ai';
import { uid, nowIso, ageDays, clone, TODAY } from './util';

const KEY = 'nhs-coord-demo-v3';
const GUIDED = ['PT-F1', 'PT-F4', 'PT-M2'];

function freshDb() {
  const db: any = buildSeed();
  const svc = makeSvc(db);
  svc.audit('System', 'seed.loaded', 'database', 'ORG-SYNTH-01', 'Synthetic demonstration dataset loaded');
  // Overnight batch (synthetic): run every scenario except the guided-demo patients through the real engine.
  for (const p of db.patients) {
    if (GUIDED.includes(p.id)) continue;
    const { exec } = startExecution(db, p.service === 'fls' ? 'wf-fls' : 'wf-med', p.id, { actorId: 'U-MGR', trigger: 'Scheduled batch (synthetic overnight run)' });
    runToPause(db, exec.id);
  }
  return db;
}
function load() { try { const s = localStorage.getItem(KEY); if (s) return JSON.parse(s); } catch { /* storage unavailable */ } return freshDb(); }
function save(db: any) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } }

type Toast = { id: string; msg: string; kind: 'ok' | 'warn' | 'error' | 'info' };
type State = {
  db: any; rev: number; userId: string; nav: { page: string; params: any }; toasts: Toast[]; playing: string | null; speed: number;
  commit: () => void; go: (page: string, params?: any) => void; setUser: (id: string) => void; toast: (msg: string, kind?: Toast['kind']) => void;
  guard: <T>(fn: () => T) => T | undefined;
  run: (wfId: string, pid: string, o?: { animate?: boolean; draft?: any; trigger?: string }) => string | undefined;
  step: (execId: string) => void; setPlaying: (id: string | null) => void; setSpeed: (n: number) => void;
  decide: (reviewId: string, decision: 'authorise' | 'decline', rationale: string, animate?: boolean) => void;
  updateTask: (id: string, patch: any, what: string) => void;
  recordResult: (pid: string, code: string, value: number) => void;
  recordAck: (pid: string) => void;
  sweep: () => void;
  saveDraft: (wfId: string, nodes: any[], edges: any[], note: string) => number | undefined;
  publish: (wfId: string, version: number) => void;
  draftRule: (ruleId: string, params: any, note: string) => void;
  approveRule: (ruleId: string, version: number) => void;
  setHealth: (id: string, h: string) => void; testConn: (id: string) => void;
  setGov: (id: string, status: string, note: string) => void;
  editComm: (id: string, body: string) => void; signOff: (id: string) => void; discardComm: (id: string) => void;
  setAiMode: (m: string) => void; aiDraft: (pid: string, task: string, promptVersion: string) => string | undefined;
  resolveException: (id: string, note: string) => void;
  reset: () => void;
};

export const user = (id: string) => USERS.find(u => u.id === id)!;
export const can = (id: string, perm: string) => ROLES[user(id).role].perms.includes(perm);

export const useStore = create<State>((set, get) => ({
  db: load(), rev: 0, userId: 'U-CLIN', nav: { page: 'command', params: {} }, toasts: [], playing: null, speed: 550,
  commit: () => { const db = get().db; save(db); set({ db: { ...db }, rev: get().rev + 1 }); },
  go: (page, params = {}) => { set({ nav: { page, params } }); try { window.scrollTo(0, 0); } catch { } },
  setUser: (id) => { const db = get().db; makeSvc(db).audit(user(id).name, 'session.role_switched', 'user', id, `Signed in as ${ROLES[user(id).role].label} (synthetic)`); get().commit(); set({ userId: id }); },
  toast: (msg, kind = 'ok') => { const t = { id: uid('T'), msg, kind }; set({ toasts: [...get().toasts, t] }); setTimeout(() => set({ toasts: get().toasts.filter(x => x.id !== t.id) }), 5200); },
  guard: (fn) => { try { const r = fn(); get().commit(); return r; } catch (e: any) { get().commit(); get().toast(e.message, e instanceof PermissionError ? 'warn' : 'error'); return undefined; } },
  run: (wfId, pid, o = {}) => get().guard(() => {
    const db = get().db; if (!can(get().userId, 'workflow.run')) throw new PermissionError('Your role cannot start workflows.');
    const { exec, reused } = startExecution(db, wfId, pid, { actorId: get().userId, trigger: o.trigger || 'Manual trigger', draft: o.draft });
    if (reused) { get().toast(`Execution ${exec.id} is already ${exec.status.replace('_', ' ')} for this patient. Showing it instead of starting a duplicate.`, 'info'); return exec.id; }
    if (o.animate) set({ playing: exec.id }); else { runToPause(db, exec.id); get().toast(`Workflow ran: ${exec.status.replace(/_/g, ' ')}`); }
    return exec.id;
  }),
  step: (execId) => { const db = get().db; const ex = stepExecution(db, execId); get().commit(); if (!ex || ex.status !== 'running') { set({ playing: null }); if (ex) get().toast(`Execution ${ex.status.replace(/_/g, ' ')}${ex.summary ? `: ${ex.summary}` : ''}`, ex.status === 'failed' ? 'error' : ex.status === 'awaiting_approval' ? 'info' : 'ok'); } },
  setPlaying: (id) => set({ playing: id }), setSpeed: (n) => set({ speed: n }),
  decide: (reviewId, decision, rationale, animate) => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); const u = user(get().userId);
    const r = db.reviews.find((x: any) => x.id === reviewId);
    svc.require(u.id, 'clinical.approve', 'record clinical decisions');
    if (u.role !== r.requiredRole) { svc.audit(u.name, 'permission.denied', 'review', r.id, `Role ${u.role} cannot decide ${r.type}`); throw new PermissionError(`${r.type} must be decided by a ${ROLES[r.requiredRole].label.toLowerCase()}.`); }
    if (r.status !== 'awaiting') throw new Error('This review has already been decided.');
    if (!rationale.trim()) throw new Error('Record a rationale before deciding.');
    Object.assign(r, { status: 'decided', decision, rationale, reviewer: u.name, reviewerId: u.id, decidedAt: nowIso() });
    svc.audit(u.name, 'review.decided', 'review', r.id, `${decision === 'authorise' ? 'Authorised next step' : 'Did not progress'}: ${rationale}`, r.patientId, r.executionId);
    const ex = resumeAfterReview(db, r);
    if (ex) { if (animate) set({ playing: ex.id }); else runToPause(db, ex.id); }
    get().toast('Decision recorded. Workflow resumed.');
  }),
  updateTask: (id, patch, what) => get().guard(() => { makeSvc(get().db).updateTask(id, patch, get().userId, what); get().toast(what); }),
  recordResult: (pid, code, value) => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'result.record', 'record results');
    const units: any = { VITD: 'nmol/L', EGFR: 'mL/min/1.73m²', CA_ADJ: 'mmol/L' }; const labels: any = { VITD: 'Vitamin D (25-OH)', EGFR: 'Renal function (eGFR)', CA_ADJ: 'Adjusted calcium' };
    db.observations = db.observations.filter((o: any) => !(o.patientId === pid && o.code === code));
    db.observations.push({ id: uid('OBS'), patientId: pid, code, label: labels[code], value, unit: units[code], effective: nowIso(), source: 'Synthetic laboratory fixture (new result event)', status: 'final', verification: `Entered in demo by ${user(get().userId).name}` });
    svc.audit(user(get().userId).name, 'observation.received', 'observation', code, `${labels[code]} ${value} ${units[code]} (synthetic)`, pid);
    const t = db.tasks.find((x: any) => x.patientId === pid && x.type === 'information_request' && !['completed', 'cancelled'].includes(x.status));
    if (t) svc.updateTask(t.id, { status: 'completed', evidence: `New ${labels[code]} result received (synthetic)` }, get().userId, 'Completed: requested result received');
    const { exec } = startExecution(db, 'wf-fls', pid, { actorId: get().userId, trigger: 'Laboratory result available' }); runToPause(db, exec.id);
    get().toast(`Result recorded. Workflow re-evaluated: ${exec.status.replace(/_/g, ' ')}`);
  }),
  recordAck: (pid) => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'task.update', 'record acknowledgements');
    const ref = db.referrals.find((r: any) => r.patientId === pid); if (!ref || ref.status === 'delivery_failed') throw new Error('No delivered referral to acknowledge.');
    ref.ackAt = nowIso(); ref.status = 'acknowledged'; svc.audit(user(get().userId).name, 'referral.acknowledged', 'referral', ref.id, 'Acknowledgement recorded (synthetic)', pid);
    db.exceptions.filter((e: any) => e.patientId === pid && e.category === 'Handover not acknowledged' && e.status === 'open').forEach((e: any) => svc.resolveException(e.id, 'Acknowledgement received', get().userId));
    db.tasks.filter((t: any) => t.patientId === pid && t.type === 'handover_chase' && t.status !== 'completed').forEach((t: any) => svc.updateTask(t.id, { status: 'completed', evidence: 'Acknowledgement received' }, get().userId, 'Completed: acknowledgement received'));
    const { exec } = startExecution(db, 'wf-med', pid, { actorId: get().userId, trigger: 'Approved integration event: acknowledgement' }); runToPause(db, exec.id);
    get().toast(`Acknowledgement recorded. Workflow: ${exec.status.replace(/_/g, ' ')}`);
  }),
  sweep: () => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); const p = activeVersion(db.rules.find((r: any) => r.id === 'R-ESC-001')).params; let n = 0;
    for (const t of db.tasks) if (!['completed', 'cancelled', 'escalated'].includes(t.status) && ageDays(t.due) > p.escalateAfterDays) { t.status = 'escalated'; t.history.push({ at: nowIso(), by: 'Scheduled job', what: 'Escalated by R-ESC-001' }); svc.audit('Scheduled job', 'task.escalated', 'task', t.id, t.title, t.patientId); n++; }
    get().toast(n ? `${n} overdue task(s) escalated` : 'No tasks met the escalation rule', n ? 'warn' : 'info');
  }),
  saveDraft: (wfId, nodes, edges, note) => get().guard(() => {
    const db = get().db; const wf = db.workflows.find((w: any) => w.id === wfId); const version = Math.max(...wf.versions.map((v: any) => v.version)) + 1;
    wf.versions.push({ version, status: 'draft', nodes: clone(nodes), edges: clone(edges), savedAt: nowIso(), by: user(get().userId).name, note: note || 'Draft' });
    makeSvc(db).audit(user(get().userId).name, 'workflow.draft_saved', 'workflow', wfId, `Version ${version} saved as draft`); get().toast(`Saved as draft version ${version}`); return version;
  }),
  publish: (wfId, version) => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'workflow.publish', 'publish workflow versions');
    const wf = db.workflows.find((w: any) => w.id === wfId); const v = wf.versions.find((x: any) => x.version === version);
    const errs = validateWorkflow(v.nodes, v.edges).filter(i => i.level === 'error'); if (errs.length) throw new Error(`Cannot publish: ${errs[0].msg}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ''}`);
    wf.versions.forEach((x: any) => { if (x.status === 'published') x.status = 'superseded'; }); v.status = 'published'; v.publishedBy = user(get().userId).name; v.publishedAt = nowIso();
    svc.audit(user(get().userId).name, 'workflow.published', 'workflow', wfId, `Version ${version} published`); get().toast(`Published version ${version}`);
  }),
  draftRule: (ruleId, params, note) => get().guard(() => {
    const db = get().db; const r = db.rules.find((x: any) => x.id === ruleId); const version = Math.max(...r.versions.map((v: any) => v.version)) + 1;
    r.versions.push({ version, params, status: 'draft', effective: null, approvedBy: null, changeNote: note }); r.history.push({ at: nowIso(), by: user(get().userId).name, what: `Draft v${version}: ${note}` });
    makeSvc(db).audit(user(get().userId).name, 'rule.draft_created', 'rule', ruleId, `v${version}: ${note}`); get().toast(`Rule draft v${version} created`);
  }),
  approveRule: (ruleId, version) => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'rule.approve', 'approve rule versions');
    const r = db.rules.find((x: any) => x.id === ruleId); const v = r.versions.find((x: any) => x.version === version);
    const res = runRuleTests(r, v.params); if (res.some((t: any) => !t.pass)) throw new Error('Rule tests fail for this version. Update the test cases or parameters before approval.');
    r.versions.forEach((x: any) => { if (x.status === 'approved') x.status = 'retired'; }); Object.assign(v, { status: 'approved', approvedBy: user(get().userId).name, effective: nowIso() });
    r.history.push({ at: nowIso(), by: user(get().userId).name, what: `v${version} approved (synthetic environment)` }); svc.audit(user(get().userId).name, 'rule.approved', 'rule', ruleId, `v${version}`); get().toast(`${ruleId} v${version} approved`);
  }),
  setHealth: (id, h) => get().guard(() => { const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'integration.manage', 'change integration settings'); const a = db.integrations.find((x: any) => x.id === id); a.health = h; svc.audit(user(get().userId).name, 'integration.health_changed', 'integration', id, `Simulated health set to ${h}`); }),
  testConn: (id) => get().guard(() => { const db = get().db; const svc = makeSvc(db); const a = db.integrations.find((x: any) => x.id === id); const ok = a.health === 'healthy' || a.health === 'degraded'; a.lastTest = { at: nowIso(), ok, latencyMs: a.health === 'degraded' ? 2380 : 140, msg: a.health === 'not_configured' ? 'Not configured' : ok ? 'Synthetic fixture responded' : 'No response from synthetic endpoint' }; svc.audit(user(get().userId).name, 'integration.tested', 'integration', id, a.lastTest.msg); get().toast(`${a.name}: ${a.lastTest.msg}`, ok ? 'ok' : 'error'); }),
  setGov: (id, status, note) => get().guard(() => { const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'governance.manage', 'update governance evidence'); if (status === 'Evidence reviewed' && !note.trim()) throw new Error('Describe the evidence reviewed.'); const g = db.governance.find((x: any) => x.id === id); Object.assign(g, { status, note, updatedBy: user(get().userId).name, updatedAt: nowIso() }); svc.audit(user(get().userId).name, 'governance.updated', 'governance', id, `${g.item}: ${status}`); get().toast('Governance record updated'); }),
  editComm: (id, body) => get().guard(() => { const db = get().db; const c = db.communications.find((x: any) => x.id === id); if (c.status !== 'draft') throw new Error('Signed-off drafts cannot be edited.'); c.versions.push({ at: nowIso(), by: user(get().userId).name, body: c.body }); c.body = body; c.edited = true; makeSvc(db).audit(user(get().userId).name, 'communication.edited', 'communication', id, 'Draft edited', c.patientId); get().toast('Draft saved'); }),
  signOff: (id) => get().guard(() => { const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'comms.signoff', 'sign off communications'); const c = db.communications.find((x: any) => x.id === id); Object.assign(c, { status: 'signed_off', signedOffBy: user(get().userId).name, signedOffAt: nowIso() }); svc.audit(user(get().userId).name, 'communication.signed_off', 'communication', id, 'Signed off. Not sent: the prototype has no live sending route.', c.patientId); get().toast('Signed off. The prototype does not send it anywhere.'); }),
  discardComm: (id) => get().guard(() => { const db = get().db; const c = db.communications.find((x: any) => x.id === id); c.status = 'discarded'; makeSvc(db).audit(user(get().userId).name, 'communication.discarded', 'communication', id, 'Draft discarded', c.patientId); }),
  setAiMode: (m) => get().guard(() => { const db = get().db; const svc = makeSvc(db); svc.require(get().userId, 'governance.manage', 'change AI settings'); db.meta.aiMode = m; svc.audit(user(get().userId).name, 'ai.mode_changed', 'settings', 'ai', `AI assistance ${m === 'synthetic' ? 'enabled in synthetic environment' : 'disabled'}`); get().toast(m === 'synthetic' ? 'AI assistance enabled for synthetic data only' : 'AI assistance disabled'); }),
  aiDraft: (pid, task, promptVersion) => get().guard(() => {
    const db = get().db; const svc = makeSvc(db); if (db.meta.aiMode !== 'synthetic') throw new Error('AI assistance is disabled. A service manager can enable it for the synthetic environment in Administration.');
    const t0 = performance.now(); const src = aiSources(db, pid); const res = mockProvider.generate({ promptVersion, task, sources: src });
    const runId = uid('AIR'); db.aiRuns.push({ id: runId, at: nowIso(), by: user(get().userId).name, patientId: pid, task, promptVersion, provider: mockProvider.label, sourceCount: src.length, citations: res.citations.length, uncertainties: res.uncertainties.length, ms: Math.round(performance.now() - t0) });
    const { comm } = svc.createComm({ patientId: pid, service: db.patients.find((p: any) => p.id === pid).service, template: task === 'fls-letter' ? 'AI draft letter' : 'AI handover summary', origin: 'ai', body: res.text, citations: res.citations, uncertainties: res.uncertainties, promptVersion, aiRun: runId });
    if (comm.aiRun !== runId) Object.assign(comm, { body: res.text, citations: res.citations, uncertainties: res.uncertainties, promptVersion, aiRun: runId });
    svc.audit(user(get().userId).name, 'ai.generated', 'ai_run', runId, `${promptVersion}: ${res.citations.length} citations, ${res.uncertainties.length} uncertainties`, pid);
    get().toast('AI draft created. It needs professional verification before use.', 'info'); return comm.id;
  }),
  resolveException: (id, note) => get().guard(() => { if (!note.trim()) throw new Error('Add a resolution note.'); makeSvc(get().db).resolveException(id, note, get().userId); get().toast('Exception resolved'); }),
  reset: () => { const db = freshDb(); save(db); set({ db, rev: get().rev + 1, playing: null, nav: { page: 'command', params: {} } }); get().toast('Synthetic demo data reset'); },
}));

export const GUIDED_PATIENTS = GUIDED;
export const isOverdue = (t: any) => !['completed', 'cancelled'].includes(t.status) && new Date(t.due) < TODAY;

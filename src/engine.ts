import { uid, nowIso, ageDays, addDays, TODAY, fmtDate, clone } from './util';
import { EVAL, ruleParams, LAB_LABEL } from './rules';
import { NODE_TYPES } from './workflows';
import { makeSvc, Svc } from './services';
import { mockProvider } from './ai';

type R = { port?: string; output?: any; input?: any; message?: string; await?: 'approval' | 'information'; end?: { outcome: string; summary: string } };
type Env = { db: any; svc: Svc; p: any; ctx: any; exec: any; node: any };

const rule = (env: Env, id: string, input: any) => { const { params, version } = ruleParams(env.db.rules, id); if (!params) throw new Error(`No approved version of ${id}`); return { out: EVAL[id](params, input), version, params }; };
const withRetry = (env: Env, adapter: string, retries = 2) => { let last: any; for (let a = 1; a <= retries + 1; a++) { try { env.svc.adapterCall(adapter, a); return a; } catch (e) { last = e; env.exec.retryLog.push({ nodeId: env.node.id, attempt: a, error: (e as any).message }); } } throw last; };
const due = (days: number) => addDays(TODAY, days);

const H: Record<string, (env: Env) => R> = {
  'trigger.milestone': ({ db, p, node, ctx, ...env }) => {
    const ms = db.milestones.find((m: any) => m.patientId === p.id && m.name === node.config.milestone);
    if (!ms) return { port: 'not_eligible', output: { reason: 'Milestone not found for patient' } };
    const dueInDays = -ageDays(ms.due);
    const r = rule({ db, p, node, ctx, ...env } as Env, node.config.ruleId, { dueInDays });
    ctx.milestone = ms;
    return { port: r.out.eligible ? 'out' : 'not_eligible', input: { milestone: ms.name, due: ms.due, dueInDays }, output: { ...r.out, rule: `${node.config.ruleId} v${r.version}` } };
  },
  'trigger.discharge': ({ db, p, ctx }) => { const d = db.discharges.find((x: any) => x.patientId === p.id); ctx.discharge = d; return { port: d?.verified ? 'out' : 'unverified', output: { discharge: d?.id || null, verified: !!d?.verified, verifiedBy: d?.verifiedBy } }; },
  'trigger.lab_result': () => ({ port: 'out' }), 'trigger.scheduled': () => ({ port: 'out' }), 'trigger.manual': () => ({ port: 'out' }), 'trigger.integration': () => ({ port: 'out' }),
  'data.patient': ({ p }) => ({ port: 'out', output: { id: p.id, nhsNumber: `${p.nhsNumber} (synthetic)` } }),
  'data.treatment': (env) => {
    try { withRetry(env, 'epic-fhir', 2); } catch (e: any) { return { port: 'failure', message: e.message }; }
    const doses = env.db.medications.filter((m: any) => m.patientId === env.p.id && m.list === 'treatment');
    env.ctx.treatment = doses;
    return { port: 'out', output: { previousDoses: doses.map((d: any) => `${d.name} on ${fmtDate(d.recordedAt)}`), source: 'Synthetic Epic FHIR fixture' } };
  },
  'data.lab': (env) => {
    const code = env.node.config.code;
    let attempts = 0;
    try { attempts = withRetry(env, 'epic-lab', env.node.config.retries ?? 2); } catch (e: any) { env.ctx.labs[code] = { interfaceFailure: true }; return { port: 'failure', message: e.message, output: { code, result: 'Not retrieved: interface failure. No value is assumed.' } }; }
    const o = env.db.observations.filter((x: any) => x.patientId === env.p.id && x.code === code).sort((a: any, b: any) => b.effective.localeCompare(a.effective))[0];
    env.ctx.labs[code] = o ? { ...o, ageDays: ageDays(o.effective) } : null;
    return { port: 'out', output: o ? { code, value: o.value, unit: o.unit, effective: o.effective, ageDays: ageDays(o.effective), source: o.source, status: o.status, attempts } : { code, value: null, result: 'Not available in source. Recorded as missing, not normal.', attempts } };
  },
  'data.med_history': (env) => ({ port: 'out', output: { count: env.db.medications.filter((m: any) => m.patientId === env.p.id).length } }),
  'data.discharge': (env) => {
    try { withRetry(env, 'hospital-epr', env.node.config.retries ?? 2); } catch (e: any) { return { port: 'failure', message: e.message }; }
    const meds = env.db.medications.filter((m: any) => m.patientId === env.p.id && m.list === 'discharge');
    env.ctx.dischargeMeds = meds; env.ctx.discharge = env.ctx.discharge || env.db.discharges.find((x: any) => x.patientId === env.p.id);
    return { port: 'out', output: { medicines: meds.map((m: any) => `${m.name} ${m.dose} ${m.frequency} (${m.change})`), source: 'Synthetic e-prescribing fixture' } };
  },
  'data.reconciliation': (env) => {
    try { withRetry(env, 'eprescribing', 2); } catch (e: any) { return { port: 'failure', message: e.message }; }
    const meds = env.db.medications.filter((m: any) => m.patientId === env.p.id && m.list === 'reconciliation');
    env.ctx.reconMeds = meds;
    return { port: 'out', output: { entries: meds.length, note: meds.length ? undefined : 'No separate reconciliation entries; discharge list treated as reconciled source' } };
  },
  'data.followup': (env) => { const fu = env.ctx.discharge?.followUp || []; env.ctx.followUp = fu; return { port: 'out', output: { requirements: fu.map((f: any) => `${f.item} by ${f.responsible}, due ${fmtDate(f.due)}${f.verified ? '' : ' (owner unverified)'}`) } }; },
  'data.validate': () => ({ port: 'out' }),
  'rule.completeness': (env) => { const r = rule(env, env.node.config.ruleId, { labs: env.ctx.labs }); env.ctx.findings.missing = r.out.missing; return { port: 'out', input: { present: Object.keys(env.ctx.labs).filter(k => env.ctx.labs[k]) }, output: { missing: r.out.missing.map((c: string) => LAB_LABEL[c]), rule: `${env.node.config.ruleId} v${r.version}` } }; },
  'rule.recency': (env) => { const r = rule(env, env.node.config.ruleId, { labs: env.ctx.labs }); env.ctx.findings.outdated = r.out.outdated; return { port: 'out', input: { limits: r.params.maxAgeDays }, output: { outdated: r.out.outdated.map((c: string) => `${LAB_LABEL[c]} (${env.ctx.labs[c].ageDays} days old)`), rule: `${env.node.config.ruleId} v${r.version}` } }; },
  'rule.attention': (env) => { const r = rule(env, env.node.config.ruleId, { labs: env.ctx.labs }); env.ctx.findings.attention = r.out.attention; return { port: 'out', output: { needsClinicianAttention: r.out.attention.map((c: string) => `${LAB_LABEL[c]} ${env.ctx.labs[c].value} ${env.ctx.labs[c].unit}`), rule: `${env.node.config.ruleId} v${r.version} (synthetic bounds)` } }; },
  'rule.date_calc': (env) => { env.ctx.date = due(env.node.config.offsetDays || 0); return { port: 'out', output: { date: env.ctx.date } }; },
  'rule.changes': (env) => {
    const ch = (env.ctx.dischargeMeds || []).filter((m: any) => m.change !== 'unchanged');
    env.ctx.changes = ch; const courses = ch.filter((m: any) => m.courseDays);
    return { port: 'out', output: { started: ch.filter((m: any) => m.change === 'started').map((m: any) => m.name), changed: ch.filter((m: any) => m.change === 'changed').map((m: any) => m.name), stopped: ch.filter((m: any) => m.change === 'stopped').map((m: any) => m.name), shortCourses: courses.map((m: any) => `${m.name} ${m.courseDays} days, ends ${fmtDate(m.courseEnd)}`) } };
  },
  'rule.missing': (env) => { const r = rule(env, env.node.config.ruleId, { meds: env.ctx.dischargeMeds || [], followUp: env.ctx.followUp || [] }); env.ctx.findings.missing = r.out.missing; return { port: 'out', output: { missing: r.out.missing, rule: `${env.node.config.ruleId} v${r.version}` } }; },
  'rule.conflict': (env) => { const r = rule(env, env.node.config.ruleId, { discharge: env.ctx.dischargeMeds || [], recon: env.ctx.reconMeds || [] }); env.ctx.findings.conflicts = r.out.list; return { port: 'out', output: { conflicts: r.out.list, rule: `${env.node.config.ruleId} v${r.version}` } }; },
  'rule.decision': (env) => {
    const f = env.ctx.findings;
    if (env.node.config.mode === 'fls_status') {
      const port = f.attention?.length ? 'attention' : (f.missing?.length || f.outdated?.length) ? 'incomplete' : 'complete';
      return { port, input: { missing: f.missing, outdated: f.outdated, attention: f.attention }, output: { route: port === 'complete' ? 'Information complete for clinical review (not a treatment decision)' : port } };
    }
    const port = f.conflicts?.length ? 'conflict' : f.missing?.length ? 'missing' : 'complete';
    return { port, input: { conflicts: f.conflicts?.length || 0, missing: f.missing?.length || 0 }, output: { route: port } };
  },
  'rule.handover_pathway': (env) => { const d = env.ctx.discharge; env.ctx.pathway = { dms: !!d?.nominatedPharmacy, gp: d?.gpPractice }; return { port: 'out', output: { route: d?.nominatedPharmacy ? `DMS referral to ${d.nominatedPharmacy}; GP summary to ${d.gpPractice}` : `GP summary to ${d?.gpPractice}` } }; },
  'rule.ack': (env) => {
    const ref = env.ctx.referral || env.db.referrals.find((r: any) => r.patientId === env.p.id);
    const r = rule(env, env.node.config.ruleId, { sentDaysAgo: ageDays(ref.sentAt), ack: !!ref.ackAt });
    return { port: r.out.state, output: { referral: ref.id, sent: ref.sentAt, acknowledged: ref.ackAt, state: r.out.state, rule: `${env.node.config.ruleId} v${r.version}` } };
  },
  'rule.overdue': (env) => {
    const ts = env.db.tasks.filter((t: any) => t.patientId === env.p.id && t.type === 'monitoring');
    const { params, version } = ruleParams(env.db.rules, env.node.config.ruleId);
    const overdue = ts.filter((t: any) => !['completed', 'cancelled'].includes(t.status) && EVAL['R-ESC-001'](params, { overdueDays: ageDays(t.due) }).escalate);
    const port = ts.length && ts.every((t: any) => t.status === 'completed') ? 'all_complete' : overdue.length ? 'overdue' : 'on_track';
    env.ctx.overdue = overdue.map((t: any) => t.id);
    return { port, output: { tasks: ts.map((t: any) => `${t.id} ${t.status}, due ${fmtDate(t.due)}`), overdue: overdue.map((t: any) => t.id), rule: `R-ESC-001 v${version}` } };
  },
  'ai.summarise': (env) => aiNode(env, 'med-handover'), 'ai.compare': (env) => aiNode(env, 'med-handover'), 'ai.handover': (env) => aiNode(env, 'med-handover'), 'ai.draft_letter': (env) => aiNode(env, 'fls-letter'),
  'action.task': (env) => {
    const c = env.node.config; const f = env.ctx.findings;
    const detail = c.kind === 'information_request' ? [...(f.missing || []).map((x: string) => `Missing: ${LAB_LABEL[x] || x}`), ...(f.outdated || []).map((x: string) => `Outdated: ${LAB_LABEL[x]} (${env.ctx.labs[x]?.ageDays} days)`)] : c.kind === 'pharmacist_review' ? [...(f.missing || []).map((m: any) => `${m.item}: ${m.issue}`), ...(f.conflicts || []).map((m: any) => `${m.item}: discharge ${m.discharge} vs reconciliation ${m.reconciliation}`)] : [];
    const { task, duplicate } = env.svc.createTask({ patientId: env.p.id, service: env.p.service, type: c.kind, title: c.title, assignedRole: c.role, priority: c.priority || 'medium', due: due(c.dueDays), detail, sourceExecution: env.exec.id, idempotencyKey: `${env.p.id}:${c.kind}` }, env.exec.id);
    return { port: 'out', output: { task: task.id, duplicateSuppressed: duplicate, assignedRole: task.assignedRole, due: task.due, detail } };
  },
  'action.checklist': (env) => {
    env.ctx.checklist = ['VITD', 'EGFR', 'CA_ADJ'].map(c => { const o = env.ctx.labs[c]; return { item: LAB_LABEL[c], value: o ? `${o.value} ${o.unit}` : 'Not available', date: o?.effective, source: o?.source, status: o ? 'Available and within recency limit' : 'Missing' }; });
    return { port: 'out', output: { checklist: env.ctx.checklist, statement: 'Information complete for clinical review. This is not a determination that treatment is safe.' } };
  },
  'action.draft_comm': (env) => {
    const { comm, duplicate } = env.svc.createComm({ patientId: env.p.id, service: env.p.service, template: env.node.config.template, origin: 'template', body: templateText(env), sourceExecution: env.exec.id }, env.exec.id);
    return { port: 'out', output: { draft: comm.id, duplicateSuppressed: duplicate, status: 'Draft: requires staff review and sign-off. Not sent.' } };
  },
  'action.update_status': (env) => { const prev = env.p.pathwayStatus; env.p.pathwayStatus = env.node.config.status; env.svc.audit('Workflow engine', 'pathway.status_updated', 'patient', env.p.id, `${prev} → ${env.p.pathwayStatus}`, env.p.id, env.exec.id); return { port: 'out', output: { from: prev, to: env.p.pathwayStatus, scope: 'Internal workflow record only' } }; },
  'action.schedule': (env) => {
    const name = env.node.config.milestone; let ms = env.db.milestones.find((m: any) => m.patientId === env.p.id && m.name === name);
    if (!ms) { ms = { id: uid('MS'), patientId: env.p.id, name, due: due(env.node.config.days), status: 'upcoming', source: `Scheduled by ${env.exec.id}` }; env.db.milestones.push(ms); }
    return { port: 'out', output: { milestone: name, due: ms.due } };
  },
  'action.send_referral': (env) => {
    const { referral, duplicate } = env.svc.sendReferral(env.p, env.exec.id); env.ctx.referral = referral;
    return { port: referral.status === 'delivery_failed' ? 'failed' : 'delivered', output: { referral: referral.id, status: referral.status, duplicateSuppressed: duplicate, error: referral.error || undefined } };
  },
  'action.monitoring_tasks': (env) => {
    const created = (env.ctx.followUp || []).map((f: any) => { const prior = env.db.tasks.find((t: any) => t.idempotencyKey === `${env.p.id}:monitoring:${f.id}` && t.status === 'completed'); if (prior) return `${prior.id} (already completed)`; const soon = ageDays(f.due) > -3; const { task, duplicate } = env.svc.createTask({ patientId: env.p.id, service: 'med', type: 'monitoring', title: `Confirm ${f.item.toLowerCase()} completed (${f.responsible})`, assignedRole: 'pharmacist', priority: soon ? 'high' : 'medium', due: f.due, followUpId: f.id, sourceExecution: env.exec.id, idempotencyKey: `${env.p.id}:monitoring:${f.id}` }, env.exec.id); return `${task.id}${duplicate ? ' (existing)' : ''}`; });
    return { port: 'out', output: { tasks: created } };
  },
  'action.escalate': (env) => {
    for (const id of env.ctx.overdue || []) { const t = env.db.tasks.find((x: any) => x.id === id); if (t.status !== 'escalated') { t.status = 'escalated'; t.history.push({ at: nowIso(), by: 'Workflow engine', what: 'Escalated by R-ESC-001' }); } }
    const { exception } = env.svc.createException({ patientId: env.p.id, service: env.p.service, category: 'Overdue monitoring', priority: 'high', summary: `${(env.ctx.overdue || []).length} monitoring task(s) overdue`, evidence: env.ctx.overdue, sourceExecution: env.exec.id }, env.exec.id);
    return { port: 'out', output: { escalated: env.ctx.overdue, exception: exception.id } };
  },
  'action.complete': (env) => {
    const ev = env.db.tasks.filter((t: any) => t.patientId === env.p.id && t.type === 'monitoring').map((t: any) => `${t.id}: ${t.evidence}`);
    env.p.pathwayStatus = 'Coordination closed';
    return { port: 'out', output: { completionEvidence: ev } };
  },
  'control.gate': (env) => {
    const c = env.node.config;
    const recent = env.db.reviews.filter((r: any) => r.patientId === env.p.id && r.type === c.reviewType && r.status === 'decided' && c.reuseDecisionDays > 0 && ageDays(r.decidedAt) <= c.reuseDecisionDays).sort((a: any, b: any) => b.decidedAt.localeCompare(a.decidedAt))[0];
    if (recent) return { port: recent.decision === 'authorise' ? 'approved' : 'rejected', output: { reusedDecision: recent.id, reviewer: recent.reviewer, decidedAt: recent.decidedAt, decision: recent.decision } };
    const pending = env.db.reviews.find((r: any) => r.patientId === env.p.id && r.type === c.reviewType && r.status === 'awaiting');
    const evidence = { labs: Object.fromEntries(Object.entries(env.ctx.labs).map(([k, o]: any) => [k, o ? { value: o.value, unit: o.unit, effective: o.effective, source: o.source, ageDays: o.ageDays } : null])), findings: env.ctx.findings, checklist: env.ctx.checklist, changes: env.ctx.changes?.map((m: any) => `${m.name} ${m.change}`) };
    const rev = pending || env.svc.createReview({ patientId: env.p.id, service: env.p.service, type: c.reviewType, requiredRole: c.role, executionId: env.exec.id, nodeId: env.node.id, evidence }, env.exec.id);
    if (pending) { pending.executionId = env.exec.id; pending.nodeId = env.node.id; }
    env.exec.awaitingReview = rev.id;
    return { await: 'approval', output: { review: rev.id, requiredRole: c.role, note: 'Workflow paused. Only an authorised clinician can decide the next step.' } };
  },
  'control.permission': (env) => ({ port: env.svc.can(env.exec.actorId, env.node.config.perm) ? 'out' : 'failure' }),
  'control.audit': (env) => { env.svc.audit('Workflow engine', 'workflow.audit_event', 'execution', env.exec.id, env.node.config.event, env.p.id, env.exec.id); return { port: 'out' }; },
  'control.exception': (env) => {
    const f = env.ctx.findings; const summary = env.node.config.category === 'Technical failure' ? 'Required results could not be retrieved from a source system' : [...(f.attention || []).map((c: string) => `${LAB_LABEL[c]} ${env.ctx.labs[c].value} ${env.ctx.labs[c].unit}`), ...(f.conflicts || []).map((c: any) => `${c.item} conflict`), ...(f.missing || []).map((m: any) => m.item ? `${m.item}: ${m.issue}` : `Missing ${LAB_LABEL[m]}`)].join('; ') || env.node.config.category;
    const { exception, duplicate } = env.svc.createException({ patientId: env.p.id, service: env.p.service, category: env.node.config.category, priority: env.node.config.priority || 'high', summary, sourceExecution: env.exec.id }, env.exec.id);
    return { port: 'out', output: { exception: exception.id, duplicateSuppressed: duplicate, summary } };
  },
  'control.await_info': (env) => ({ await: 'information', output: { note: 'Re-evaluates automatically when a new result is recorded.' } }),
  'control.retry': () => ({ port: 'out' }),
  'control.fallback': (env) => { const { task } = env.svc.createTask({ patientId: env.p.id, service: env.p.service, type: 'manual_fallback', title: env.node.config.title, assignedRole: env.node.config.role, priority: 'urgent', due: due(1), sourceExecution: env.exec.id }, env.exec.id); return { port: 'out', output: { task: task.id } }; },
  'control.stop': () => ({ end: { outcome: 'stopped', summary: 'Stopped: patient not eligible at this time' } }),
  'control.end': (env) => ({ end: { outcome: env.node.config.outcome, summary: env.node.config.summary || env.node.label } }),
};

function aiNode(env: Env, task: string): R {
  if (env.db.meta.aiMode !== 'synthetic') return { port: 'out', message: 'AI assistance disabled. Node passed through without generating content.' };
  const src = aiSources(env.db, env.p.id); const res = mockProvider.generate({ promptVersion: '', task, sources: src });
  const { comm } = env.svc.createComm({ patientId: env.p.id, service: env.p.service, template: task === 'fls-letter' ? 'AI draft letter' : 'AI handover summary', origin: 'ai', body: res.text, citations: res.citations, uncertainties: res.uncertainties, promptVersion: env.node.config.promptVersion, sourceExecution: env.exec.id }, env.exec.id);
  return { port: 'out', output: { draft: comm.id, label: 'AI draft requiring professional verification' } };
}
export function aiSources(db: any, pid: string) {
  const p = db.patients.find((x: any) => x.id === pid);
  return [{ kind: 'patient', id: p.id, name: p.name, source: 'Synthetic patient record' },
    ...db.observations.filter((o: any) => o.patientId === pid).map((o: any) => ({ kind: 'obs', ...o })),
    ...db.medications.filter((m: any) => m.patientId === pid && m.list === 'discharge').map((m: any) => ({ kind: 'med', ...m })),
    ...(db.discharges.find((d: any) => d.patientId === pid)?.followUp || []).map((f: any) => ({ kind: 'followup', ...f, source: 'Synthetic discharge summary fixture' }))];
}
function templateText(env: Env) {
  if (env.node.config.template === 'FLS second-dose letter') return `Dear ${env.p.name},\n\nThank you for continuing with your bone health treatment plan. Your clinical team has reviewed your recent information and a member of the team will contact you to arrange your next appointment.\n\nIf you have questions, please call the Fracture Liaison Service on the number on your appointment letter.\n\nFracture Liaison Service (synthetic template v1)`;
  return `Discharge medicines handover for ${env.p.name}.\n\n[Template v1: populated from verified discharge record]`;
}

// ---------------- Executor ----------------
export function startExecution(db: any, wfId: string, patientId: string, opts: { actorId: string; trigger: string; version?: number; draft?: { nodes: any[]; edges: any[] } }) {
  const wf = db.workflows.find((w: any) => w.id === wfId);
  const ver = opts.draft ? { version: 'draft', nodes: opts.draft.nodes, edges: opts.draft.edges } : (opts.version ? wf.versions.find((v: any) => v.version === opts.version) : [...wf.versions].reverse().find((v: any) => v.status === 'published'));
  const active = db.executions.find((x: any) => x.workflowId === wfId && x.patientId === patientId && ['running', 'awaiting_approval'].includes(x.status));
  if (active) return { exec: active, reused: true };
  db.executions.filter((x: any) => x.workflowId === wfId && x.patientId === patientId && x.status === 'awaiting_information').forEach((x: any) => (x.status = 'superseded'));
  const trig = ver.nodes.find((x: any) => x.type.startsWith('trigger.'));
  const exec = { id: uid('EXE'), workflowId: wfId, workflowName: wf.name, service: wf.service, version: ver.version, def: { nodes: clone(ver.nodes), edges: clone(ver.edges) }, patientId, trigger: opts.trigger, actorId: opts.actorId, status: 'running', startedAt: nowIso(), finishedAt: null, ctx: { labs: {}, findings: {} }, queue: [trig.id], runs: [] as any[], retryLog: [] as any[], outcome: null, summary: null, awaitingReview: null };
  db.executions.push(exec);
  makeSvc(db).audit('Workflow engine', 'execution.started', 'execution', exec.id, `${wf.name} v${ver.version} (${opts.trigger})`, patientId, exec.id);
  return { exec, reused: false };
}

export function stepExecution(db: any, execId: string) {
  const exec = db.executions.find((x: any) => x.id === execId);
  if (!exec || exec.status !== 'running') return exec;
  const svc = makeSvc(db);
  const nodeId = exec.queue.shift();
  if (!nodeId) { exec.status = 'completed'; exec.finishedAt = nowIso(); return exec; }
  const node = exec.def.nodes.find((x: any) => x.id === nodeId);
  const p = db.patients.find((x: any) => x.id === exec.patientId);
  const run: any = { nodeId, label: node.label, type: node.type, status: 'running', startedAt: nowIso(), attempts: 1 };
  exec.runs.push(run);
  const handler = H[node.type];
  try {
    if (!handler) throw new Error(`No handler for ${node.type}`);
    const r = handler({ db, svc, p, ctx: exec.ctx, exec, node });
    run.input = r.input; run.output = r.output; run.message = r.message; run.finishedAt = nowIso();
    run.attempts = 1 + exec.retryLog.filter((x: any) => x.nodeId === nodeId).length;
    if (r.await === 'approval') { run.status = 'awaiting_approval'; exec.status = 'awaiting_approval'; return exec; }
    if (r.await === 'information') { run.status = 'completed'; exec.status = 'awaiting_information'; exec.outcome = 'awaiting_information'; exec.summary = 'Awaiting new information; task created'; exec.finishedAt = nowIso(); return exec; }
    if (r.end) { run.status = 'completed'; exec.status = r.end.outcome === 'stopped' ? 'stopped' : r.end.outcome; exec.outcome = r.end.outcome; exec.summary = r.end.summary; exec.finishedAt = nowIso(); svc.audit('Workflow engine', 'execution.finished', 'execution', exec.id, `${r.end.outcome}: ${r.end.summary}`, p.id, exec.id); return exec; }
    run.port = r.port; run.status = r.port && NODE_TYPES[node.type] && (r.port === 'failure') ? 'failed' : 'completed';
    const next = exec.def.edges.filter((e: any) => e.source === nodeId && e.sourceHandle === r.port).map((e: any) => e.target);
    if (!next.length) { exec.status = 'failed'; exec.outcome = 'failed'; exec.summary = `No connection from “${node.label}” output “${r.port}”. Workflow halted safely.`; exec.finishedAt = nowIso(); svc.audit('Workflow engine', 'execution.failed', 'execution', exec.id, exec.summary, p.id, exec.id); return exec; }
    exec.queue.push(...next);
  } catch (e: any) {
    run.status = 'failed'; run.message = e.message; run.finishedAt = nowIso();
    exec.status = 'failed'; exec.outcome = 'failed'; exec.summary = `Node “${node.label}” failed: ${e.message}`; exec.finishedAt = nowIso();
    svc.createException({ patientId: p.id, service: p.service, category: 'Technical failure', priority: 'high', summary: exec.summary, sourceExecution: exec.id }, exec.id);
  }
  return exec;
}

export function runToPause(db: any, execId: string, max = 200) { let ex; for (let i = 0; i < max; i++) { ex = stepExecution(db, execId); if (!ex || ex.status !== 'running') break; } return ex; }

export function resumeAfterReview(db: any, review: any) {
  const exec = db.executions.find((x: any) => x.id === review.executionId);
  if (!exec || exec.status !== 'awaiting_approval') return null;
  const run = [...exec.runs].reverse().find((r: any) => r.nodeId === review.nodeId && r.status === 'awaiting_approval');
  const port = review.decision === 'authorise' ? 'approved' : 'rejected';
  if (run) { run.status = 'completed'; run.port = port; run.output = { ...run.output, decision: review.decision, reviewer: review.reviewer, rationale: review.rationale, decidedAt: review.decidedAt }; run.finishedAt = nowIso(); }
  exec.queue.push(...exec.def.edges.filter((e: any) => e.source === review.nodeId && e.sourceHandle === port).map((e: any) => e.target));
  exec.status = 'running'; exec.awaitingReview = null;
  return exec;
}

// Dry run against a disposable copy: no persisted side effects.
export function dryRunTo(db: any, wfId: string, patientId: string, nodeId: string, draft: { nodes: any[]; edges: any[] }) {
  const copy = clone(db);
  const { exec } = startExecution(copy, wfId, patientId, { actorId: 'U-MGR', trigger: 'Node test run (dry)', draft });
  for (let i = 0; i < 200; i++) { const r = exec.runs[exec.runs.length - 1]; if (r?.nodeId === nodeId) break; stepExecution(copy, exec.id); if (exec.status !== 'running') break; }
  const hit = exec.runs.find((r: any) => r.nodeId === nodeId);
  return { reached: !!hit, run: hit, path: exec.runs.map((r: any) => r.label), stoppedBecause: hit ? null : exec.status === 'awaiting_approval' ? 'Blocked at a clinical approval gate. Dry runs never simulate approval.' : `Path ended (${exec.status}) without reaching this node for this patient.` };
}

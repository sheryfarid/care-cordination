// Node registry and the two seeded workflow definitions (versioned node-and-edge JSON).
// Nodes carry typed configuration only. There is no code field: arbitrary script execution is not possible.

export const PORT_KIND: Record<string, string> = {
  out: 'success', complete: 'success', delivered: 'success', acknowledged: 'success', approved: 'success', all_complete: 'success', on_track: 'success',
  incomplete: 'missing', missing: 'missing', pending: 'missing', not_eligible: 'neutral', unverified: 'missing',
  conflict: 'conflict', attention: 'escalation', not_acknowledged: 'escalation', overdue: 'escalation', rejected: 'escalation',
  failure: 'failure', failed: 'failure',
};
const P = (...ids: string[]) => ids.map(id => ({ id, label: id === 'out' ? '' : id.replace(/_/g, ' ') }));

export const CATEGORIES = [
  { id: 'trigger', label: 'Triggers', color: 'var(--blue)' },
  { id: 'data', label: 'Data', color: 'var(--green)' },
  { id: 'rule', label: 'Rules', color: 'var(--orange)' },
  { id: 'ai', label: 'AI assistance', color: 'var(--ai)' },
  { id: 'action', label: 'Workflow actions', color: 'var(--purple)' },
  { id: 'control', label: 'Controls', color: 'var(--grey)' },
];

const roleOpts = ['nurse', 'clinician', 'pharmacist', 'administrator', 'service_manager'];
const F = {
  role: { key: 'role', label: 'Assigned role', type: 'select', options: roleOpts },
  title: { key: 'title', label: 'Task title', type: 'text' },
  dueDays: { key: 'dueDays', label: 'Due in (days)', type: 'number' },
  priority: { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'] },
  ruleId: (opts: string[]) => ({ key: 'ruleId', label: 'Approved rule', type: 'select', options: opts }),
  category: { key: 'category', label: 'Exception category', type: 'text' },
  reviewType: { key: 'reviewType', label: 'Review type', type: 'text' },
};

export const NODE_TYPES: Record<string, any> = {
  'trigger.milestone': { cat: 'trigger', label: 'Patient milestone reached', icon: 'CalendarClock', ports: P('out', 'not_eligible'), fields: [{ key: 'milestone', label: 'Milestone', type: 'text' }, F.ruleId(['R-FLS-004'])], required: ['milestone', 'ruleId'] },
  'trigger.discharge': { cat: 'trigger', label: 'Discharge record received', icon: 'FileInput', ports: P('out', 'unverified'), fields: [], required: [] },
  'trigger.lab_result': { cat: 'trigger', label: 'Laboratory result available', icon: 'TestTube', ports: P('out'), fields: [], required: [] },
  'trigger.scheduled': { cat: 'trigger', label: 'Scheduled follow-up', icon: 'Clock', ports: P('out'), fields: [{ key: 'cron', label: 'Schedule', type: 'select', options: ['Daily 07:00', 'Weekly Monday 07:00'] }], required: [] },
  'trigger.manual': { cat: 'trigger', label: 'Manual trigger', icon: 'Hand', ports: P('out'), fields: [], required: [] },
  'trigger.integration': { cat: 'trigger', label: 'Approved integration event', icon: 'Plug', ports: P('out'), fields: [{ key: 'adapter', label: 'Adapter', type: 'select', options: ['epic-fhir', 'hospital-epr', 'dms'] }], required: ['adapter'] },

  'data.patient': { cat: 'data', label: 'Retrieve patient record', icon: 'User', ports: P('out', 'failure'), fields: [], required: [] },
  'data.treatment': { cat: 'data', label: 'Read treatment history', icon: 'Syringe', ports: P('out', 'failure'), fields: [], required: [] },
  'data.lab': { cat: 'data', label: 'Retrieve laboratory results', icon: 'TestTube', ports: P('out', 'failure'), fields: [{ key: 'code', label: 'Result', type: 'select', options: ['VITD', 'EGFR', 'CA_ADJ'] }, { key: 'retries', label: 'Retries', type: 'number' }], required: ['code'] },
  'data.med_history': { cat: 'data', label: 'Retrieve medication history', icon: 'Pill', ports: P('out', 'failure'), fields: [], required: [] },
  'data.discharge': { cat: 'data', label: 'Retrieve discharge summary', icon: 'FileText', ports: P('out', 'failure'), fields: [{ key: 'retries', label: 'Retries', type: 'number' }], required: [] },
  'data.reconciliation': { cat: 'data', label: 'Retrieve reconciliation', icon: 'ListChecks', ports: P('out', 'failure'), fields: [], required: [] },
  'data.followup': { cat: 'data', label: 'Retrieve follow-up requirements', icon: 'ClipboardList', ports: P('out'), fields: [], required: [] },
  'data.validate': { cat: 'data', label: 'Validate source data', icon: 'ShieldCheck', ports: P('out', 'failure'), fields: [], required: [] },

  'rule.completeness': { cat: 'rule', label: 'Field completeness check', icon: 'ListChecks', ports: P('out'), fields: [F.ruleId(['R-FLS-001'])], required: ['ruleId'] },
  'rule.recency': { cat: 'rule', label: 'Information recency check', icon: 'History', ports: P('out'), fields: [F.ruleId(['R-FLS-002'])], required: ['ruleId'] },
  'rule.attention': { cat: 'rule', label: 'Approved pathway rule evaluation', icon: 'AlertTriangle', ports: P('out'), fields: [F.ruleId(['R-FLS-003'])], required: ['ruleId'] },
  'rule.date_calc': { cat: 'rule', label: 'Date and duration calculation', icon: 'Calculator', ports: P('out'), fields: [{ key: 'offsetDays', label: 'Offset (days)', type: 'number' }], required: [] },
  'rule.changes': { cat: 'rule', label: 'Identify medication changes', icon: 'GitCompare', ports: P('out'), fields: [], required: [] },
  'rule.missing': { cat: 'rule', label: 'Missing-data detection', icon: 'SearchX', ports: P('out'), fields: [F.ruleId(['R-MED-001'])], required: ['ruleId'] },
  'rule.conflict': { cat: 'rule', label: 'Data conflict detection', icon: 'GitCompare', ports: P('out'), fields: [F.ruleId(['R-MED-002'])], required: ['ruleId'] },
  'rule.decision': { cat: 'rule', label: 'Decision branch', icon: 'GitBranch', ports: [], fields: [{ key: 'mode', label: 'Routing on', type: 'select', options: ['fls_status', 'med_status'] }], required: ['mode'] },
  'rule.handover_pathway': { cat: 'rule', label: 'Identify handover pathway', icon: 'Route', ports: P('out'), fields: [], required: [] },
  'rule.ack': { cat: 'rule', label: 'Acknowledgement check', icon: 'MailCheck', ports: P('acknowledged', 'pending', 'not_acknowledged'), fields: [F.ruleId(['R-MED-003'])], required: ['ruleId'] },
  'rule.overdue': { cat: 'rule', label: 'Monitor task due dates', icon: 'Timer', ports: P('on_track', 'overdue', 'all_complete'), fields: [F.ruleId(['R-ESC-001'])], required: ['ruleId'] },

  'ai.summarise': { cat: 'ai', label: 'Summarise clinical notes', icon: 'Sparkles', ports: P('out'), fields: [{ key: 'promptVersion', label: 'Prompt version', type: 'text' }], required: ['promptVersion'] },
  'ai.compare': { cat: 'ai', label: 'Compare structured and narrative', icon: 'Sparkles', ports: P('out'), fields: [{ key: 'promptVersion', label: 'Prompt version', type: 'text' }], required: ['promptVersion'] },
  'ai.draft_letter': { cat: 'ai', label: 'Draft clinical correspondence', icon: 'Sparkles', ports: P('out'), fields: [{ key: 'promptVersion', label: 'Prompt version', type: 'text' }], required: ['promptVersion'] },
  'ai.handover': { cat: 'ai', label: 'Generate handover summary', icon: 'Sparkles', ports: P('out'), fields: [{ key: 'promptVersion', label: 'Prompt version', type: 'text' }], required: ['promptVersion'] },

  'action.task': { cat: 'action', label: 'Create staff task', icon: 'ClipboardCheck', ports: P('out'), fields: [F.title, { key: 'kind', label: 'Task type', type: 'text' }, F.role, F.priority, F.dueDays], required: ['title', 'kind', 'role', 'dueDays'] },
  'action.checklist': { cat: 'action', label: 'Prepare readiness checklist', icon: 'ListChecks', ports: P('out'), fields: [], required: [] },
  'action.draft_comm': { cat: 'action', label: 'Prepare communication draft', icon: 'Mail', ports: P('out'), fields: [{ key: 'template', label: 'Approved template', type: 'select', options: ['FLS second-dose letter', 'GP discharge summary', 'DMS handover note'] }], required: ['template'] },
  'action.update_status': { cat: 'action', label: 'Update internal workflow status', icon: 'RefreshCw', ports: P('out'), fields: [{ key: 'status', label: 'New status', type: 'text' }], required: ['status'] },
  'action.schedule': { cat: 'action', label: 'Schedule follow-up', icon: 'CalendarPlus', ports: P('out'), fields: [{ key: 'milestone', label: 'Milestone', type: 'text' }, { key: 'days', label: 'In (days)', type: 'number' }], required: ['milestone', 'days'] },
  'action.send_referral': { cat: 'action', label: 'Track handover referral', icon: 'Send', ports: P('delivered', 'failed'), fields: [{ key: 'adapter', label: 'Adapter', type: 'select', options: ['dms'] }], required: ['adapter'] },
  'action.monitoring_tasks': { cat: 'action', label: 'Assign monitoring tasks', icon: 'Users', ports: P('out'), fields: [], required: [] },
  'action.escalate': { cat: 'action', label: 'Escalate overdue actions', icon: 'BellRing', ports: P('out'), fields: [], required: [] },
  'action.complete': { cat: 'action', label: 'Record completion evidence', icon: 'BadgeCheck', ports: P('out'), fields: [], required: [] },

  'control.gate': { cat: 'control', label: 'Clinical approval gate', icon: 'ShieldCheck', ports: P('approved', 'rejected'), fields: [F.reviewType, F.role, { key: 'reuseDecisionDays', label: 'Reuse recent decision (days)', type: 'number' }], required: ['reviewType', 'role'] },
  'control.permission': { cat: 'control', label: 'Permission check', icon: 'Lock', ports: P('out', 'failure'), fields: [{ key: 'perm', label: 'Permission', type: 'text' }], required: ['perm'] },
  'control.audit': { cat: 'control', label: 'Audit event', icon: 'ScrollText', ports: P('out'), fields: [{ key: 'event', label: 'Event name', type: 'text' }], required: ['event'] },
  'control.exception': { cat: 'control', label: 'Exception handler', icon: 'OctagonAlert', ports: P('out'), fields: [F.category, F.priority], required: ['category'] },
  'control.await_info': { cat: 'control', label: 'Await information', icon: 'Hourglass', ports: [], fields: [], required: [] },
  'control.retry': { cat: 'control', label: 'Retry', icon: 'RotateCcw', ports: P('out'), fields: [{ key: 'attempts', label: 'Attempts', type: 'number' }], required: [] },
  'control.fallback': { cat: 'control', label: 'Manual fallback', icon: 'LifeBuoy', ports: P('out'), fields: [F.title, F.role], required: ['title', 'role'] },
  'control.stop': { cat: 'control', label: 'Stop workflow', icon: 'Square', ports: [], fields: [], required: [] },
  'control.end': { cat: 'control', label: 'End', icon: 'Flag', ports: [], fields: [{ key: 'outcome', label: 'Outcome', type: 'select', options: ['completed', 'awaiting_information', 'monitoring', 'failed'] }, { key: 'summary', label: 'Summary', type: 'text' }], required: ['outcome'] },
};
NODE_TYPES['rule.decision'].portsFor = (cfg: any) => cfg.mode === 'med_status' ? P('complete', 'missing', 'conflict') : P('complete', 'incomplete', 'attention');
export const portsOf = (type: string, config: any) => { const t = NODE_TYPES[type]; return t?.portsFor ? t.portsFor(config || {}) : t?.ports || []; };

const n = (id: string, type: string, label: string, description: string, config: any = {}) => ({ id, type, label, description, config });
const e = (source: string, sourceHandle: string, target: string) => ({ id: `${source}.${sourceHandle}-${target}`, source, sourceHandle, target });

const FLS_NODES = [
  n('f1', 'trigger.milestone', 'Second-dose milestone approaching', 'Pathway cohort patient within the eligibility window', { milestone: 'Second zoledronate dose review', ruleId: 'R-FLS-004' }),
  n('f2', 'data.treatment', 'Read treatment and appointments', 'Previous dose and appointment information'),
  n('f3', 'data.lab', 'Retrieve vitamin D', 'Latest 25-OH vitamin D result', { code: 'VITD', retries: 2 }),
  n('f4', 'data.lab', 'Retrieve renal function', 'Latest eGFR result', { code: 'EGFR', retries: 2 }),
  n('f5', 'data.lab', 'Retrieve calcium', 'Latest adjusted calcium result', { code: 'CA_ADJ', retries: 2 }),
  n('f6', 'rule.completeness', 'Required results present', 'Each required result is available', { ruleId: 'R-FLS-001' }),
  n('f7', 'rule.recency', 'Results recent enough', 'Versioned recency limits (synthetic)', { ruleId: 'R-FLS-002' }),
  n('f8', 'rule.attention', 'Values needing attention', 'Flags values for clinician assessment', { ruleId: 'R-FLS-003' }),
  n('f9', 'rule.decision', 'Route by information status', 'Attention, incomplete or complete for review', { mode: 'fls_status' }),
  n('f10', 'action.task', 'Request missing results', 'Owned nurse task with due date', { title: 'Obtain missing or outdated blood results', kind: 'information_request', role: 'nurse', priority: 'high', dueDays: 5 }),
  n('f11', 'control.await_info', 'Await new information', 'Re-evaluates when a result arrives'),
  n('f12', 'control.exception', 'Raise clinical exception', 'Source values sent to review queue', { category: 'Clinical attention required', priority: 'high' }),
  n('f13', 'control.gate', 'Clinician assessment', 'Qualified clinician assesses flagged values', { reviewType: 'Clinical exception assessment', role: 'clinician', reuseDecisionDays: 0 }),
  n('f14', 'action.checklist', 'Readiness checklist', 'Consolidated information for clinical review'),
  n('f15', 'control.gate', 'Clinical decision required', 'Explicit clinician decision on next step', { reviewType: 'Second-dose readiness review', role: 'clinician', reuseDecisionDays: 30 }),
  n('f16', 'action.task', 'Coordinate appointment', 'Administrator books the authorised appointment', { title: 'Book second-dose infusion appointment', kind: 'appointment_coordination', role: 'administrator', priority: 'medium', dueDays: 7 }),
  n('f17', 'action.draft_comm', 'Draft patient letter', 'Template draft held for staff review', { template: 'FLS second-dose letter' }),
  n('f18', 'action.update_status', 'Update pathway record', 'Internal pathway status', { status: 'Clinically reviewed, next step authorised' }),
  n('f19', 'action.schedule', 'Schedule next milestone', 'Continues the 12-month pathway', { milestone: 'Post second-dose follow-up', days: 90 }),
  n('f20', 'control.audit', 'Audit decision trail', 'Immutable audit event', { event: 'FLS coordination completed' }),
  n('f21', 'control.end', 'Coordination complete', 'Authorised next step in progress', { outcome: 'completed', summary: 'Clinician decision recorded and coordination tasks created' }),
  n('f22', 'action.update_status', 'Record not progressed', 'Clinician chose not to progress', { status: 'Not progressed: clinician decision recorded' }),
  n('f23', 'control.end', 'Closed by clinician', 'Decision recorded', { outcome: 'completed', summary: 'Clinician decided not to progress at this time' }),
  n('f24', 'control.stop', 'Not eligible yet', 'Milestone outside window'),
  n('f25', 'control.exception', 'Interface failure', 'Results could not be retrieved', { category: 'Technical failure', priority: 'high' }),
  n('f26', 'control.fallback', 'Manual result check', 'Staff check results directly', { title: 'Manual result check: laboratory interface unavailable', role: 'nurse' }),
  n('f27', 'control.end', 'Stopped: manual fallback', 'No reassurance given', { outcome: 'failed', summary: 'Interface failure; manual fallback task created' }),
];
const FLS_EDGES = [
  e('f1', 'out', 'f2'), e('f1', 'not_eligible', 'f24'), e('f2', 'out', 'f3'), e('f3', 'out', 'f4'), e('f4', 'out', 'f5'), e('f5', 'out', 'f6'),
  e('f3', 'failure', 'f25'), e('f4', 'failure', 'f25'), e('f5', 'failure', 'f25'), e('f25', 'out', 'f26'), e('f26', 'out', 'f27'),
  e('f6', 'out', 'f7'), e('f7', 'out', 'f8'), e('f8', 'out', 'f9'),
  e('f9', 'incomplete', 'f10'), e('f10', 'out', 'f11'),
  e('f9', 'attention', 'f12'), e('f12', 'out', 'f13'),
  e('f9', 'complete', 'f14'), e('f14', 'out', 'f15'),
  e('f13', 'approved', 'f16'), e('f15', 'approved', 'f16'), e('f16', 'out', 'f17'), e('f17', 'out', 'f18'), e('f18', 'out', 'f19'), e('f19', 'out', 'f20'), e('f20', 'out', 'f21'),
  e('f13', 'rejected', 'f22'), e('f15', 'rejected', 'f22'), e('f22', 'out', 'f23'),
];

const MED_NODES = [
  n('m1', 'trigger.discharge', 'Verified discharge received', 'Discharge record marked verified'),
  n('m2', 'data.discharge', 'Retrieve discharge medicines', 'Discharge medication list', { retries: 2 }),
  n('m3', 'data.reconciliation', 'Retrieve reconciliation', 'Hospital medicines reconciliation'),
  n('m4', 'rule.changes', 'Identify medication changes', 'Started, changed, stopped, short courses'),
  n('m5', 'data.followup', 'Retrieve follow-up requirements', 'Documented monitoring and owners'),
  n('m6', 'rule.missing', 'Completeness and provenance', 'Reasons, monitoring plans, owners', { ruleId: 'R-MED-001' }),
  n('m7', 'rule.conflict', 'Conflicting instructions', 'Discharge list against reconciliation', { ruleId: 'R-MED-002' }),
  n('m8', 'rule.decision', 'Route by information status', 'Complete, missing or conflicting', { mode: 'med_status' }),
  n('m9a', 'control.exception', 'Missing information', 'Listed for pharmacist review', { category: 'Missing information', priority: 'high' }),
  n('m9b', 'control.exception', 'Conflicting medication records', 'Listed for pharmacist review', { category: 'Conflicting medication records', priority: 'high' }),
  n('m9', 'action.task', 'Pharmacist review task', 'Owned pharmacist task', { title: 'Review discharge medicines discrepancy', kind: 'pharmacist_review', role: 'pharmacist', priority: 'high', dueDays: 1 }),
  n('m10', 'control.gate', 'Pharmacist intervention', 'Pharmacist resolves and confirms handover content', { reviewType: 'Pharmacist intervention', role: 'pharmacist', reuseDecisionDays: 0 }),
  n('m12', 'control.end', 'Held for pharmacist', 'Discrepancy unresolved', { outcome: 'awaiting_information', summary: 'Pharmacist did not confirm handover content' }),
  n('m11', 'rule.handover_pathway', 'Identify handover pathway', 'DMS to community pharmacy and GP'),
  n('m14', 'action.send_referral', 'Track DMS referral', 'Existing approved route, idempotent', { adapter: 'dms' }),
  n('m15', 'control.exception', 'Referral delivery failure', 'Stays visible until resolved', { category: 'Referral delivery failure', priority: 'urgent' }),
  n('m16', 'control.fallback', 'Manual handover route', 'Pharmacist sends via approved manual route', { title: 'Send handover by approved manual route (delivery failed)', role: 'pharmacist' }),
  n('m17', 'control.end', 'Awaiting manual handover', 'Exception remains open', { outcome: 'awaiting_information', summary: 'Delivery failed; manual fallback in progress' }),
  n('m18', 'rule.ack', 'Acknowledgement status', 'Window from versioned rule', { ruleId: 'R-MED-003' }),
  n('m19', 'control.exception', 'Handover not acknowledged', 'Outside acknowledgement window', { category: 'Handover not acknowledged', priority: 'high' }),
  n('m20', 'action.task', 'Chase acknowledgement', 'Pharmacist contacts pharmacy', { title: 'Chase handover acknowledgement', kind: 'handover_chase', role: 'pharmacist', priority: 'high', dueDays: 1 }),
  n('m21', 'control.end', 'Escalated', 'Awaiting acknowledgement', { outcome: 'awaiting_information', summary: 'Handover not acknowledged; chase task created' }),
  n('m22', 'control.end', 'Awaiting acknowledgement', 'Inside acknowledgement window', { outcome: 'awaiting_information', summary: 'Referral sent; acknowledgement pending' }),
  n('m23', 'action.monitoring_tasks', 'Assign monitoring tasks', 'One task per documented requirement'),
  n('m24', 'rule.overdue', 'Monitor due dates', 'Escalation interval from rule', { ruleId: 'R-ESC-001' }),
  n('m25', 'action.escalate', 'Escalate overdue monitoring', 'Raises exception and escalates task'),
  n('m26', 'control.end', 'Overdue escalated', 'Awaiting completion evidence', { outcome: 'awaiting_information', summary: 'Overdue monitoring escalated' }),
  n('m27', 'control.end', 'Monitoring active', 'Tasks on track', { outcome: 'monitoring', summary: 'Handover acknowledged; monitoring tasks on track' }),
  n('m28', 'action.complete', 'Record completion evidence', 'All required actions resolved'),
  n('m29', 'control.audit', 'Audit closure', 'Immutable audit event', { event: 'Medication coordination closed' }),
  n('m30', 'control.end', 'Coordination closed', 'Handover complete', { outcome: 'completed', summary: 'All required actions resolved with evidence' }),
];
const MED_EDGES = [
  e('m1', 'out', 'm2'), e('m2', 'out', 'm3'), e('m3', 'out', 'm4'), e('m4', 'out', 'm5'), e('m5', 'out', 'm6'), e('m6', 'out', 'm7'), e('m7', 'out', 'm8'),
  e('m8', 'missing', 'm9a'), e('m8', 'conflict', 'm9b'), e('m9a', 'out', 'm9'), e('m9b', 'out', 'm9'), e('m9', 'out', 'm10'),
  e('m10', 'approved', 'm11'), e('m10', 'rejected', 'm12'), e('m8', 'complete', 'm11'),
  e('m11', 'out', 'm14'), e('m14', 'failed', 'm15'), e('m15', 'out', 'm16'), e('m16', 'out', 'm17'),
  e('m14', 'delivered', 'm18'), e('m18', 'not_acknowledged', 'm19'), e('m19', 'out', 'm20'), e('m20', 'out', 'm21'), e('m18', 'pending', 'm22'),
  e('m18', 'acknowledged', 'm23'), e('m23', 'out', 'm24'), e('m24', 'overdue', 'm25'), e('m25', 'out', 'm26'), e('m24', 'on_track', 'm27'),
  e('m24', 'all_complete', 'm28'), e('m28', 'out', 'm29'), e('m29', 'out', 'm30'),
  e('m1', 'unverified', 'm12'), e('m2', 'failure', 'm15'),
];

// Layered layout: rank = longest path from trigger; rows packed per rank.
export function autoLayout(nodes: any[], edges: any[]) {
  const rank: Record<string, number> = {}; const ids = nodes.map(x => x.id);
  ids.forEach(id => (rank[id] = 0));
  for (let i = 0; i < ids.length; i++) for (const ed of edges) if (rank[ed.target] < rank[ed.source] + 1 && rank[ed.source] + 1 < 40) rank[ed.target] = rank[ed.source] + 1;
  const rows: Record<number, number> = {};
  return nodes.map(nd => { const r = rank[nd.id]; const row = rows[r] = (rows[r] ?? -1) + 1; return { ...nd, position: { x: r * 255, y: row * 140 } }; });
}

const def = (id: string, service: string, name: string, nodes: any[], edges: any[]) => {
  const laid = autoLayout(nodes, edges);
  return { id, service, name, versions: [{ version: 1, status: 'published', nodes: laid, edges, savedAt: '2026-10-01T09:00:00Z', by: 'Tom Hughes (synthetic)', note: 'Initial synthetic demonstration workflow' }] };
};
export const WORKFLOWS = [
  def('wf-fls', 'fls', 'FLS second-dose readiness coordination', FLS_NODES, FLS_EDGES),
  def('wf-med', 'med', 'Discharge medication continuity', MED_NODES, MED_EDGES),
];

export function validateWorkflow(nodes: any[], edges: any[]) {
  const issues: { nodeId?: string; level: 'error' | 'warning'; msg: string }[] = [];
  if (!nodes.some(x => x.type.startsWith('trigger.'))) issues.push({ level: 'error', msg: 'Workflow needs a trigger node.' });
  for (const nd of nodes) {
    const t = NODE_TYPES[nd.type];
    if (!t) { issues.push({ nodeId: nd.id, level: 'error', msg: `Unknown node type ${nd.type}` }); continue; }
    for (const k of t.required) if (nd.config?.[k] === undefined || nd.config?.[k] === '') issues.push({ nodeId: nd.id, level: 'error', msg: `${nd.label}: “${k}” is required` });
    for (const p of portsOf(nd.type, nd.config)) if (!edges.some(ed => ed.source === nd.id && ed.sourceHandle === p.id) && PORT_KIND[p.id] !== 'failure')
      issues.push({ nodeId: nd.id, level: p.id === 'out' || PORT_KIND[p.id] === 'success' ? 'error' : 'warning', msg: `${nd.label}: “${p.label || 'next'}” output is not connected` });
    if (!nd.type.startsWith('trigger.') && !edges.some(ed => ed.target === nd.id)) issues.push({ nodeId: nd.id, level: 'warning', msg: `${nd.label} is not reachable` });
  }
  // Safety: post-approval actions must only be reachable through an approval gate.
  const SENSITIVE = ['action.draft_comm', 'action.schedule'];
  const trig = nodes.filter(x => x.type.startsWith('trigger.')).map(x => x.id);
  const seen = new Set<string>(); const stack = [...trig];
  while (stack.length) { const id = stack.pop()!; if (seen.has(id)) continue; seen.add(id); const nd = nodes.find(x => x.id === id); if (nd?.type === 'control.gate') continue; edges.filter(ed => ed.source === id).forEach(ed => stack.push(ed.target)); }
  for (const nd of nodes) if (SENSITIVE.includes(nd.type) && seen.has(nd.id))
    issues.push({ nodeId: nd.id, level: 'error', msg: `${nd.label} can be reached without passing a clinical approval gate` });
  return issues;
}

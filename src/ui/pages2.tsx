import React, { useState, useMemo } from 'react';
import { useStore, user, can, isOverdue } from '../store';
import { ROLES, USERS } from '../seed';
import { Icon, Pill, Synthetic, Btn, Card, Table, Tabs, PageHead, Empty, Provenance, LabValue, PatientLink, due, Modal, Field, Help } from './common';
import { Bars, Lines } from './charts';
import { charts, svcFilter } from './metrics';
import { fmtDate, fmtDT, ageDays, titleCase, fnv } from '../util';
import { activeVersion, runRuleTests, LAB_LABEL } from '../rules';
import { PROMPTS, mockProvider } from '../ai';

export function ReviewQueue({ params }: any) {
  const db = useStore(s => s.db); const uid = useStore(s => s.userId); const decide = useStore(s => s.decide); const go = useStore(s => s.go);
  const [view, setView] = useState('awaiting'); const [selId, setSelId] = useState(params.id || null); const [rat, setRat] = useState('');
  const role = user(uid).role;
  const rows = db.reviews.filter(svcFilter(params.svc || 'all')).filter((r: any) => view === 'all' || (view === 'awaiting' ? r.status === 'awaiting' : view === 'mine' ? r.status === 'awaiting' && r.requiredRole === role : r.status === 'decided')).slice().reverse();
  const r = db.reviews.find((x: any) => x.id === selId);
  return <>
    <PageHead title="Clinical Review Queue" sub="Every clinical decision is made here by an authorised professional. The workflow pauses until a decision is recorded." />
    <div className="split">
      <Card pad={false}>
        <Tabs value={view} onChange={setView} tabs={[{ id: 'awaiting', label: 'Awaiting', count: db.reviews.filter((x: any) => x.status === 'awaiting').length }, { id: 'mine', label: 'For my role', count: db.reviews.filter((x: any) => x.status === 'awaiting' && x.requiredRole === role).length }, { id: 'decided', label: 'Decided' }, { id: 'all', label: 'All' }]} />
        <Table rows={rows} onRow={(x: any) => { setSelId(x.id); setRat(''); }} empty={<Empty icon="CircleCheck" title="No reviews in this view" />} cols={[
          { k: 'p', h: 'Patient', r: (x: any) => <PatientLink id={x.patientId} /> }, { k: 't', h: 'Review', r: (x: any) => x.type }, { k: 'rr', h: 'Requires', r: (x: any) => ROLES[x.requiredRole].label },
          { k: 's', h: 'Status', r: (x: any) => <Pill s={x.status} /> }, { k: 'a', h: 'Waiting', r: (x: any) => x.status === 'awaiting' ? `${Math.max(0, ageDays(x.createdAt))} days` : fmtDate(x.decidedAt) }]} />
      </Card>
      <Card title={r ? r.type : 'Review detail'}>
        {!r ? <Empty icon="Stethoscope" title="Select a review" /> : <>
          <dl className="kv"><dt>Patient</dt><dd><PatientLink id={r.patientId} /></dd><dt>Review</dt><dd>{r.id}</dd><dt>Requires</dt><dd>{ROLES[r.requiredRole].label}</dd><dt>Source execution</dt><dd>{r.executionId ? <button className="link" onClick={() => go('studio', { wf: r.service === 'fls' ? 'wf-fls' : 'wf-med', exec: r.executionId, patient: r.patientId })}>{r.executionId}</button> : 'Seeded record'}</dd></dl>
          <h4>Source evidence</h4>
          {r.evidence?.labs && Object.keys(r.evidence.labs).length > 0 && <ul className="evidence">{Object.entries(r.evidence.labs).map(([c, o]: any) => <li key={c}><strong>{LAB_LABEL[c]}</strong>: <LabValue o={o} />{o && <><br /><Provenance source={o.source} at={o.effective} /></>}</li>)}</ul>}
          {r.evidence?.findings?.attention?.length > 0 && <p className="banner tone-amber">Flagged by synthetic rule R-FLS-003 for clinician assessment: {r.evidence.findings.attention.map((c: string) => LAB_LABEL[c]).join(', ')}</p>}
          {r.evidence?.findings?.conflicts?.length > 0 && <p className="banner tone-amber">Conflicting instructions: {r.evidence.findings.conflicts.map((c: any) => `${c.item}: discharge ${c.discharge}, reconciliation ${c.reconciliation}`).join('; ')}</p>}
          {r.evidence?.findings?.missing?.length > 0 && r.service === 'med' && <p className="banner tone-amber">Missing: {r.evidence.findings.missing.map((m: any) => `${m.item}: ${m.issue}`).join('; ')}</p>}
          {r.evidence?.changes?.length > 0 && <p className="small">Documented changes: {r.evidence.changes.join(', ')}</p>}
          {r.evidence?.checklist && <p className="small muted">Readiness checklist prepared. Information complete for clinical review; this is not a determination that treatment is safe.</p>}
          {r.status === 'awaiting' ? <>
            {role !== r.requiredRole && <p className="banner tone-blue">You are signed in as {ROLES[role].label.toLowerCase()}. The server will reject a decision from this role. Switch user in the header to demonstrate either path.</p>}
            <Field label="Documented rationale (required)"><textarea rows={3} value={rat} onChange={e => setRat(e.target.value)} placeholder="Record the basis for your decision" /></Field>
            <div className="row gap8"><Btn kind="primary" icon="Check" onClick={() => decide(r.id, 'authorise', rat)}>Authorise next step</Btn><Btn icon="X" onClick={() => decide(r.id, 'decline', rat)}>Do not progress</Btn></div>
          </> : <dl className="kv"><dt>Decision</dt><dd><Pill tone={r.decision === 'authorise' ? 'green' : 'amber'}>{r.decision === 'authorise' ? 'Next step authorised' : 'Not progressed'}</Pill></dd><dt>Reviewer</dt><dd>{r.reviewer}</dd><dt>Decided</dt><dd>{fmtDT(r.decidedAt)}</dd><dt>Rationale</dt><dd>{r.rationale}</dd></dl>}
        </>}
      </Card>
    </div>
  </>;
}

export function Tasks({ params }: any) {
  const db = useStore(s => s.db); const uid = useStore(s => s.userId); const updateTask = useStore(s => s.updateTask); const sweep = useStore(s => s.sweep);
  const role = user(uid).role; const [view, setView] = useState(params.filter === 'overdue' ? 'overdue' : 'role'); const [selId, setSelId] = useState(params.id || null); const [ev, setEv] = useState(''); const [svc, setSvc] = useState(params.svc || 'all');
  const open = (t: any) => !['completed', 'cancelled'].includes(t.status);
  const rows = db.tasks.filter((t: any) => t.type !== 'historic').filter(svcFilter(svc)).filter((t: any) => view === 'all' || (view === 'role' && open(t) && (t.assignedRole === role || role === 'service_manager')) || (view === 'overdue' && isOverdue(t)) || (view === 'escalated' && t.status === 'escalated') || (view === 'done' && !open(t)) || (view === 'open' && open(t)))
    .sort((a: any, b: any) => a.due.localeCompare(b.due));
  const t = db.tasks.find((x: any) => x.id === selId);
  const STATUSES = ['open', 'assigned', 'in_progress', 'awaiting_information', 'awaiting_clinical_review', 'escalated', 'cancelled'];
  return <>
    <PageHead title="Task Management" sub="Owned, dated tasks created by workflows. Completion requires evidence." actions={<Btn icon="Timer" onClick={sweep}>Run escalation check</Btn>} />
    <div className="split">
      <Card pad={false}>
        <Tabs value={view} onChange={setView} tabs={[{ id: 'role', label: role === 'service_manager' ? 'All open' : `${ROLES[role].label} worklist` }, { id: 'overdue', label: 'Overdue', count: db.tasks.filter(isOverdue).length }, { id: 'escalated', label: 'Escalated' }, { id: 'open', label: 'All open' }, { id: 'done', label: 'Closed' }]} />
        <div className="filters inset"><select aria-label="Service" value={svc} onChange={e => setSvc(e.target.value)}><option value="all">Both services</option><option value="fls">Fracture liaison</option><option value="med">Medication safety</option></select><span className="muted">{rows.length} tasks</span></div>
        <Table rows={rows} onRow={(x: any) => { setSelId(x.id); setEv(''); }} empty={<Empty icon="CircleCheck" title="No tasks in this view" />} cols={[
          { k: 't', h: 'Task', r: (x: any) => <><strong>{x.title}</strong><br /><small className="muted">{x.id} · <PatientLink id={x.patientId} /></small></> },
          { k: 'r', h: 'Role', r: (x: any) => ROLES[x.assignedRole]?.label }, { k: 'p', h: 'Priority', r: (x: any) => <Pill s={x.priority} /> }, { k: 'd', h: 'Due', r: (x: any) => due(x.due, x.status) }, { k: 's', h: 'Status', r: (x: any) => <Pill s={x.status} /> }]} />
      </Card>
      <Card title={t ? t.title : 'Task detail'}>
        {!t ? <Empty icon="ClipboardCheck" title="Select a task" /> : <>
          <dl className="kv"><dt>Task</dt><dd>{t.id} · {titleCase(t.type)}</dd><dt>Patient</dt><dd><PatientLink id={t.patientId} /></dd><dt>Assigned</dt><dd>{ROLES[t.assignedRole]?.label}{t.assignedUser ? `, ${USERS.find(u => u.id === t.assignedUser)?.name}` : ''}</dd><dt>Priority</dt><dd><Pill s={t.priority} /></dd><dt>Due</dt><dd>{due(t.due, t.status)}</dd><dt>Status</dt><dd><Pill s={t.status} /></dd><dt>Source</dt><dd>{t.sourceExecution}</dd><dt>Escalation</dt><dd>{t.escalationPolicy}</dd>{t.evidence && <><dt>Evidence</dt><dd>{t.evidence}</dd></>}</dl>
          {t.detail?.length > 0 && <><h4>What is needed</h4><ul className="small">{t.detail.map((d: string, i: number) => <li key={i}>{d}</li>)}</ul></>}
          {open(t) && <>
            <div className="row gap8 wrap">{!t.assignedUser && <Btn small icon="User" onClick={() => updateTask(t.id, { assignedUser: uid, status: 'assigned' }, `Assigned to ${user(uid).name}`)}>Assign to me</Btn>}
              <select aria-label="Change status" value="" onChange={e => e.target.value && updateTask(t.id, { status: e.target.value }, `Status changed to ${e.target.value.replace(/_/g, ' ')}`)}><option value="">Change status…</option>{STATUSES.filter(s => s !== t.status).map(s => <option key={s} value={s}>{titleCase(s)}</option>)}</select></div>
            <Field label="Completion evidence" hint="Required. Describe what was done and where it is recorded."><textarea rows={2} value={ev} onChange={e => setEv(e.target.value)} /></Field>
            <Btn kind="primary" icon="Check" disabled={!ev.trim()} onClick={() => updateTask(t.id, { status: 'completed', evidence: ev }, 'Completed with evidence')}>Complete task</Btn>
          </>}
          <h4>History</h4><ul className="feed">{t.history.slice().reverse().map((h: any, i: number) => <li key={i}><span className="muted">{fmtDT(h.at)}</span> <strong>{h.by}</strong> {h.what}</li>)}</ul>
        </>}
      </Card>
    </div>
  </>;
}

export function Communications({ params }: any) {
  const db = useStore(s => s.db); const uid = useStore(s => s.userId); const edit = useStore(s => s.editComm); const signOff = useStore(s => s.signOff); const discard = useStore(s => s.discardComm); const aiDraft = useStore(s => s.aiDraft); const go = useStore(s => s.go);
  const [selId, setSelId] = useState(params.id || null); const [body, setBody] = useState<string | null>(null); const [tab, setTab] = useState('drafts');
  const [aiPid, setAiPid] = useState('PT-F1'); const p = db.patients.find((x: any) => x.id === aiPid); const task = p.service === 'fls' ? 'fls-letter' : 'med-handover'; const [pv, setPv] = useState('');
  const versions = PROMPTS[task]; const promptVersion = versions.find(v => v.version === pv)?.version || versions[versions.length - 1].version;
  const c = db.communications.find((x: any) => x.id === selId); const tmpl = c?.origin === 'ai' ? db.communications.find((x: any) => x.patientId === c.patientId && x.origin === 'template') : null;
  const ai = db.meta.aiMode === 'synthetic';
  return <>
    <PageHead title="Communications" sub="Drafts from approved templates and, when enabled, AI. Nothing is sent from this prototype, and nothing enters the clinical record automatically." />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: 'drafts', label: 'Drafts and sign-off', count: db.communications.filter((x: any) => x.status === 'draft').length }, { id: 'ai', label: 'AI documentation assistant' }, { id: 'runs', label: 'AI execution audit', count: db.aiRuns.length }]} />
    {tab === 'drafts' && <div className="split">
      <Card pad={false}><Table rows={db.communications.slice().reverse()} onRow={(x: any) => { setSelId(x.id); setBody(null); }} empty={<Empty icon="Mail" title="No drafts yet">Drafts appear when a workflow passes a clinical approval gate, or when you generate an AI draft.</Empty>} cols={[
        { k: 'p', h: 'Patient', r: (x: any) => <PatientLink id={x.patientId} /> }, { k: 't', h: 'Draft', r: (x: any) => x.template }, { k: 'o', h: 'Origin', r: (x: any) => x.origin === 'ai' ? <Pill tone="ai">AI draft</Pill> : <Pill tone="grey">Template</Pill> }, { k: 's', h: 'Status', r: (x: any) => <Pill s={x.status} /> }]} /></Card>
      <Card title={c ? c.template : 'Draft'}>
        {!c ? <Empty icon="Mail" title="Select a draft" /> : <>
          {c.origin === 'ai' && <div className="banner tone-ai"><Icon name="Sparkles" /> AI-generated draft. Requires professional verification. Generated by {mockProvider.label}, prompt {c.promptVersion}.</div>}
          <Field label={`Body${c.edited ? ' (edited by staff)' : ''}`}><textarea rows={12} value={body ?? c.body} disabled={c.status !== 'draft'} onChange={e => setBody(e.target.value)} /></Field>
          {c.citations?.length > 0 && <><h4>Sources cited</h4><ol className="small cites">{c.citations.map((s: any, i: number) => <li key={i}>[S{i + 1}] {s.kind === 'obs' ? `${s.label} ${s.value} ${s.unit}, ${fmtDate(s.effective)}` : s.kind === 'med' ? `${s.name} ${s.dose} (${s.change})` : s.kind === 'followup' ? `${s.item}, due ${fmtDate(s.due)}` : s.name} · {s.source}</li>)}</ol></>}
          {c.uncertainties?.length > 0 && <><h4>Uncertainty reported by the assistant</h4><ul className="small">{c.uncertainties.map((u: string, i: number) => <li key={i} className="missing">{u}</li>)}</ul></>}
          {tmpl && <details><summary>Compare with template draft</summary><div className="cmp"><pre>{tmpl.body}</pre><pre>{c.body}</pre></div></details>}
          {c.status === 'draft' ? <div className="row gap8 wrap"><Btn icon="Save" disabled={body === null} onClick={() => { edit(c.id, body!); setBody(null); }}>Save edits</Btn><Btn kind="primary" icon="BadgeCheck" disabled={body !== null} onClick={() => signOff(c.id)}>Sign off</Btn><Btn kind="ghost" icon="Trash2" onClick={() => discard(c.id)}>Discard</Btn></div>
            : <p className="muted">{c.status === 'signed_off' ? `Signed off by ${c.signedOffBy} on ${fmtDT(c.signedOffAt)}. Ready for sending through an approved route; the prototype does not send it.` : 'Discarded.'}</p>}
        </>}
      </Card>
    </div>}
    {tab === 'ai' && <div className="split">
      <Card title="Generate a draft" help="Provider-independent adapter. Only a deterministic offline mock provider is configured. AI is off unless a service manager enables it for the synthetic environment.">
        <p>Status: {ai ? <Pill tone="ai">Enabled for synthetic data</Pill> : <Pill tone="grey">Disabled</Pill>} {!ai && <button className="link" onClick={() => go('admin', { tab: 'ai' })}>Change in Administration</button>}</p>
        <Field label="Synthetic patient"><select value={aiPid} onChange={e => setAiPid(e.target.value)}>{db.patients.map((x: any) => <option key={x.id} value={x.id}>{x.name} ({x.service === 'fls' ? 'FLS' : 'Medication'})</option>)}</select></Field>
        <Field label="Task"><input disabled value={task === 'fls-letter' ? 'Patient correspondence draft' : 'Discharge handover summary'} /></Field>
        <Field label="Prompt version"><select value={promptVersion} onChange={e => setPv(e.target.value)}>{versions.map(v => <option key={v.version}>{v.version}</option>)}</select></Field>
        <pre className="json small">{versions.find(v => v.version === promptVersion)?.text}</pre>
        <Btn kind="primary" icon="Sparkles" disabled={!ai} onClick={() => { const id = aiDraft(aiPid, task, promptVersion); if (id) { setSelId(id); setTab('drafts'); setBody(null); } }}>Generate draft</Btn>
      </Card>
      <Card title="Safeguards"><ul className="checks"><li>Every statement cites a source record; missing facts are listed as uncertainty, not invented.</li><li>Drafts are labelled AI-generated and need professional sign-off.</li><li>Drafts never enter the clinical record and are never sent automatically.</li><li>AI cannot create tasks that change, start or stop medicines.</li><li>Each generation is logged with prompt version, provider, source count and timing.</li></ul></Card>
    </div>}
    {tab === 'runs' && <Card pad={false}><Table rows={db.aiRuns.slice().reverse()} empty={<Empty icon="Sparkles" title="No AI runs recorded" />} cols={[{ k: 'at', h: 'When', r: (x: any) => fmtDT(x.at) }, { k: 'by', h: 'By' }, { k: 'p', h: 'Patient', r: (x: any) => <PatientLink id={x.patientId} /> }, { k: 'pv', h: 'Prompt', r: (x: any) => x.promptVersion }, { k: 's', h: 'Sources', r: (x: any) => x.sourceCount }, { k: 'c', h: 'Citations', r: (x: any) => x.citations }, { k: 'u', h: 'Uncertainties', r: (x: any) => x.uncertainties }, { k: 'ms', h: 'Time', r: (x: any) => `${x.ms} ms` }]} /></Card>}
  </>;
}

export function IntegrationHub() {
  const db = useStore(s => s.db); const setHealth = useStore(s => s.setHealth); const test = useStore(s => s.testConn); const [fx, setFx] = useState<any>(null);
  const fixture = (pid: string) => ({ resourceType: 'Bundle', type: 'searchset', meta: { tag: [{ code: 'SYNTHETIC', display: 'Synthetic test data' }] }, entry: db.observations.filter((o: any) => o.patientId === pid).map((o: any) => ({ resource: { resourceType: 'Observation', id: o.id, status: o.status, code: { text: o.label }, subject: { reference: `Patient/${pid}`, identifier: { system: 'https://fhir.nhs.uk/Id/nhs-number', value: o.patientId === pid ? db.patients.find((p: any) => p.id === pid).nhsNumber.replace(/\s/g, '') : '' } }, effectiveDateTime: o.effective, valueQuantity: { value: o.value, unit: o.unit } } })) });
  return <>
    <PageHead title="Integration Hub" sub="Adapter interfaces with synthetic fixtures. No live Epic, GP, community pharmacy or NHS connection exists or is implied." />
    <div className="banner tone-blue"><Icon name="Info" /> Live credentials, interoperability approvals and access permissions must be obtained and verified separately. Change an adapter’s simulated health to see how workflows handle failure.</div>
    <div className="adapters">{db.integrations.map((a: any) => <Card key={a.id} title={a.name} actions={<Pill s={a.health} />}>
      <dl className="kv small"><dt>Standard</dt><dd>{a.standard}</dd><dt>Mode</dt><dd>{a.mode}</dd><dt>Live status</dt><dd>{a.liveStatus}</dd><dt>Permissions</dt><dd>{a.scopes.length ? a.scopes.join(', ') : 'None granted'}</dd><dt>Schema mapping</dt><dd>{a.mapping.length ? a.mapping.join('; ') : '—'}</dd><dt>Retry policy</dt><dd>{a.retry}</dd><dt>Last test</dt><dd>{a.lastTest ? `${fmtDT(a.lastTest.at)}: ${a.lastTest.msg} (${a.lastTest.latencyMs} ms)` : 'Not tested'}</dd></dl>
      {a.health !== 'not_configured' && <div className="row gap8 wrap"><select aria-label={`Simulated health for ${a.name}`} value={a.health} onChange={e => setHealth(a.id, e.target.value)}><option value="healthy">Healthy</option><option value="degraded">Degraded (first call times out)</option><option value="down">Down</option></select><Btn small icon="Activity" onClick={() => test(a.id)}>Test connection</Btn></div>}
    </Card>)}</div>
    <div className="grid2">
      <Card title="Discovery items (unverified)" help="System names from the medication proposal were transcribed from a meeting and must be confirmed by the local digital team.">
        <Table rows={db.discovery} rowKey="name" cols={[{ k: 'name', h: 'Reported name' }, { k: 'described', h: 'Described use' }, { k: 'status', h: 'Status', r: (x: any) => <Pill tone="amber">{x.status}</Pill> }]} />
      </Card>
      <Card title="Mock FHIR fixtures"><p className="muted small">Synthetic FHIR R4 Observation bundles used by the laboratory adapter.</p><div className="row gap8 wrap">{db.patients.filter((p: any) => p.service === 'fls').map((p: any) => <Btn small key={p.id} onClick={() => setFx({ p, b: fixture(p.id) })}>{p.name}</Btn>)}</div></Card>
    </div>
    {fx && <Modal title={`FHIR fixture: ${fx.p.name}`} wide onClose={() => setFx(null)}><pre className="json">{JSON.stringify(fx.b, null, 2)}</pre></Modal>}
  </>;
}

export function Analytics() {
  const db = useStore(s => s.db); const [svc, setSvc] = useState('all'); const c = useMemo(() => charts(db, svc), [db, svc]);
  const ex = db.executions.filter(svcFilter(svc));
  const nodeFail = useMemo(() => { const m: any = {}; ex.forEach((e: any) => e.runs.forEach((r: any) => { if (r.port && r.port !== 'out') m[r.label + ' → ' + r.port.replace(/_/g, ' ')] = (m[r.label + ' → ' + r.port.replace(/_/g, ' ')] || 0) + 1; })); return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a: any, b: any) => b.value - a.value).slice(0, 8); }, [ex]);
  const tasksDone = db.tasks.filter(svcFilter(svc)).filter((t: any) => t.status === 'completed');
  return <>
    <PageHead title="Analytics and Reporting" sub="All figures are computed from the synthetic dataset. They are not service performance measures." actions={<div className="seg">{[['all', 'Both'], ['fls', 'FLS'], ['med', 'Medication']].map(([k, l]) => <button key={k} className={svc === k ? 'on' : ''} onClick={() => setSvc(k)}>{l}</button>)}</div>} />
    <div className="grid2">
      <Card title="Tasks created and completed"><Lines data={c.trend} keys={[{ k: 'created', label: 'Created', color: 'var(--purple)' }, { k: 'completed', label: 'Completed', color: 'var(--green)' }]} /></Card>
      <Card title="Branches taken (decision outputs)">{nodeFail.length ? <Bars data={nodeFail} horizontal h={Math.max(180, nodeFail.length * 34)} color="var(--orange)" /> : <Empty title="No branch data yet" />}</Card>
      <Card title="Execution outcomes"><Bars data={c.execStatus} /></Card>
      <Card title="Open work by role"><Bars data={c.workload} color="var(--purple)" /></Card>
    </div>
    <Card title="Execution register" pad={false}><Table dense rows={ex.slice().reverse()} cols={[{ k: 'id', h: 'Execution' }, { k: 'p', h: 'Patient', r: (e: any) => <PatientLink id={e.patientId} /> }, { k: 'w', h: 'Workflow', r: (e: any) => `${e.workflowName} v${e.version}` }, { k: 't', h: 'Trigger', r: (e: any) => e.trigger }, { k: 'n', h: 'Nodes run', r: (e: any) => e.runs.length }, { k: 'r', h: 'Retries', r: (e: any) => e.retryLog.length }, { k: 's', h: 'Status', r: (e: any) => <Pill s={e.status} /> }]} /></Card>
    <p className="muted small">{tasksDone.length} completed tasks in the dataset, including {tasksDone.filter((t: any) => t.type === 'historic').length} historic synthetic records used to populate trend lines.</p>
  </>;
}

export function Governance({ params }: any) {
  const db = useStore(s => s.db); const setGov = useStore(s => s.setGov); const [tab, setTab] = useState(params.corr ? 'audit' : 'audit'); const [q, setQ] = useState(params.corr || ''); const [g, setG] = useState<any>(null); const [st, setSt] = useState(''); const [note, setNote] = useState('');
  const chainOk = useMemo(() => db.audit.every((a: any, i: number) => (i === 0 ? a.prevHash === 'GENESIS' : a.prevHash === db.audit[i - 1].hash) && a.hash === fnv(a.prevHash + JSON.stringify({ ...a, hash: '' }))), [db.audit.length]);
  const rows = db.audit.filter((a: any) => !q || JSON.stringify(a).toLowerCase().includes(q.toLowerCase())).slice().reverse().slice(0, 300);
  return <>
    <PageHead title="Governance and Audit" sub="Audit trail, clinical hazard log and governance evidence. Indicators reflect evidence status only; nothing here implies certification or approval." />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: 'audit', label: 'Audit trail', count: db.audit.length }, { id: 'hazards', label: 'Clinical hazard log', count: db.hazards.length }, { id: 'evidence', label: 'Governance evidence' }]} />
    {tab === 'audit' && <Card pad={false} title={<span className="row gap8">Append-only audit log {chainOk ? <Pill tone="green">Hash chain intact</Pill> : <Pill tone="red">Hash chain broken</Pill>}</span>} actions={<input aria-label="Filter audit" placeholder="Filter by patient, execution, action" value={q} onChange={e => setQ(e.target.value)} />}>
      <Table dense rows={rows} cols={[{ k: 'at', h: 'When', r: (a: any) => fmtDT(a.at) }, { k: 'actor', h: 'Actor' }, { k: 'action', h: 'Action', r: (a: any) => <code>{a.action}</code> }, { k: 'd', h: 'Detail', r: (a: any) => a.detail }, { k: 'p', h: 'Patient', r: (a: any) => a.patientId ? <PatientLink id={a.patientId} /> : '—' }, { k: 'c', h: 'Correlation', r: (a: any) => <small>{a.correlationId || '—'}</small> }, { k: 'h', h: 'Hash', r: (a: any) => <small className="mono">{a.hash}</small> }]} />
    </Card>}
    {tab === 'hazards' && <Card pad={false}><Table rows={db.hazards} cols={[{ k: 'id', h: 'Hazard' }, { k: 'title', h: 'Description', r: (h: any) => <><strong>{h.title}</strong><br /><small>Cause: {h.cause}. Effect: {h.effect}.</small></> }, { k: 'control', h: 'Control in prototype' }, { k: 'r', h: 'Initial risk', r: (h: any) => `${h.severity} / ${h.likelihood}` }, { k: 's', h: 'Status', r: (h: any) => <Pill tone="blue">{h.status}</Pill> }]} /><p className="muted small pad12">Draft hazard log for a synthetic prototype. A clinical safety officer must review it under DCB0129 before any use with real patients.</p></Card>}
    {tab === 'evidence' && <Card pad={false}><Table rows={db.governance} onRow={(x: any) => { setG(x); setSt(x.status); setNote(x.note); }} cols={[{ k: 'item', h: 'Requirement' }, { k: 's', h: 'Status', r: (x: any) => <Pill s={x.status} /> }, { k: 'note', h: 'Evidence note', r: (x: any) => x.note || <span className="muted">—</span> }, { k: 'u', h: 'Updated', r: (x: any) => x.updatedBy ? `${x.updatedBy}, ${fmtDate(x.updatedAt)}` : '—' }]} /></Card>}
    {g && <Modal title={g.item} onClose={() => setG(null)}><Field label="Status"><select value={st} onChange={e => setSt(e.target.value)}>{['Not assessed', 'In progress', 'Evidence reviewed'].map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Evidence note" hint="“Evidence reviewed” needs a description of the evidence."><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field><div className="row gap8 end"><Btn onClick={() => setG(null)}>Cancel</Btn><Btn kind="primary" onClick={() => { setGov(g.id, st, note); setG(null); }}>Save</Btn></div></Modal>}
  </>;
}

export function Administration({ params }: any) {
  const db = useStore(s => s.db); const uid = useStore(s => s.userId); const reset = useStore(s => s.reset); const setAi = useStore(s => s.setAiMode); const draftRule = useStore(s => s.draftRule); const approveRule = useStore(s => s.approveRule);
  const [tab, setTab] = useState(params.tab || 'rules'); const [rid, setRid] = useState('R-FLS-002'); const r = db.rules.find((x: any) => x.id === rid); const av = activeVersion(r);
  const [pjson, setPjson] = useState(''); const [rnote, setRnote] = useState(''); const tests = runRuleTests(r); const [confirm, setConfirm] = useState(false);
  const PERMS = ['clinical.approve', 'task.update', 'result.record', 'comms.signoff', 'workflow.run', 'workflow.publish', 'rule.approve', 'integration.manage', 'governance.manage'];
  return <>
    <PageHead title="Administration" sub="Rules, roles, AI settings and environment." />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: 'rules', label: 'Rules management' }, { id: 'roles', label: 'Users and roles' }, { id: 'ai', label: 'AI settings' }, { id: 'env', label: 'Environment and readiness' }]} />
    {tab === 'rules' && <div className="split">
      <Card pad={false} title="Versioned rules"><Table rows={db.rules} onRow={(x: any) => { setRid(x.id); setPjson(''); }} cols={[{ k: 'id', h: 'Rule' }, { k: 'name', h: 'Name' }, { k: 'v', h: 'Active', r: (x: any) => `v${activeVersion(x)?.version}` }, { k: 'd', h: 'Drafts', r: (x: any) => x.versions.filter((v: any) => v.status === 'draft').length || '—' }]} /></Card>
      <Card title={`${r.id} ${r.name}`}>
        <p className="banner tone-amber">{r.disclaimer}</p>
        <p>{r.description}</p>
        <dl className="kv"><dt>Owner</dt><dd>{r.owner}</dd><dt>Active version</dt><dd>v{av.version}, effective {fmtDate(av.effective)}, approved by {av.approvedBy}</dd></dl>
        <h4>Versions</h4><ul className="list">{r.versions.map((v: any) => <li key={v.version}><div><Pill s={v.status} /> v{v.version} · {v.changeNote}<pre className="json small">{JSON.stringify(v.params)}</pre></div>{v.status === 'draft' && <Btn small icon="BadgeCheck" onClick={() => approveRule(r.id, v.version)}>Approve</Btn>}</li>)}</ul>
        <h4>Test cases (active version)</h4><ul className="small">{tests.map((t: any, i: number) => <li key={i}><Pill tone={t.pass ? 'green' : 'red'}>{t.pass ? 'Pass' : 'Fail'}</Pill> {t.name}</li>)}</ul>
        <h4>Propose a new version</h4>
        <Field label="Parameters (JSON)"><textarea className="mono" rows={4} value={pjson || JSON.stringify(av.params, null, 1)} onChange={e => setPjson(e.target.value)} /></Field>
        <Field label="Change note"><input value={rnote} onChange={e => setRnote(e.target.value)} /></Field>
        <Btn icon="Save" onClick={() => { try { draftRule(r.id, JSON.parse(pjson || JSON.stringify(av.params)), rnote || 'Parameter change'); setPjson(''); setRnote(''); } catch { useStore.getState().toast('Parameters must be valid JSON', 'error'); } }}>Save as draft version</Btn>
        <p className="muted small">Approval requires the service manager role and passing test cases. Workflows always use the latest approved version.</p>
        <h4>Change history</h4><ul className="feed">{r.history.slice().reverse().map((h: any, i: number) => <li key={i}><span className="muted">{fmtDT(h.at)}</span> <strong>{h.by}</strong> {h.what}</li>)}</ul>
      </Card>
    </div>}
    {tab === 'roles' && <Card pad={false} title="Role permissions (enforced in the service layer, not only the UI)"><Table rows={Object.entries(ROLES).map(([k, v]) => ({ id: k, ...v }))} cols={[{ k: 'label', h: 'Role' }, ...PERMS.map(p => ({ k: p, h: p, r: (x: any) => x.perms.includes(p) ? <Icon name="Check" size={16} className="ok-ic" aria-label="Allowed" /> : <span className="muted" aria-label="Not allowed">·</span> }))]} />
      <Table rows={USERS} cols={[{ k: 'name', h: 'Demo user' }, { k: 'title', h: 'Title' }, { k: 'role', h: 'Role', r: (u: any) => ROLES[u.role].label }, { k: 'c', h: '', r: (u: any) => u.id === uid ? <Pill tone="blue">Current</Pill> : '' }]} /></Card>}
    {tab === 'ai' && <Card title="AI assistance">
      <p>Current mode: {db.meta.aiMode === 'synthetic' ? <Pill tone="ai">Enabled for synthetic data</Pill> : <Pill tone="grey">Disabled</Pill>}</p>
      <p className="muted">The deterministic workflows never depend on AI. When enabled here, AI nodes and the documentation assistant use the offline mock provider. A production provider such as Azure OpenAI would only be configured after information governance and clinical safety approval.</p>
      <div className="row gap8"><Btn kind={db.meta.aiMode === 'synthetic' ? 'secondary' : 'primary'} icon="Sparkles" onClick={() => setAi(db.meta.aiMode === 'synthetic' ? 'disabled' : 'synthetic')}>{db.meta.aiMode === 'synthetic' ? 'Disable AI assistance' : 'Enable for synthetic environment'}</Btn></div>
      {!can(uid, 'governance.manage') && <p className="banner tone-blue">Only the service manager can change this setting.</p>}
    </Card>}
    {tab === 'env' && <div className="grid2">
      <Card title="Environment"><dl className="kv"><dt>Environment</dt><dd>Synthetic demonstration (browser)</dd><dt>Tenant</dt><dd>{db.meta.tenant}</dd><dt>Demo clock</dt><dd>{fmtDate(db.meta.seededAt)} (fixed for reproducible scenarios)</dd><dt>Records</dt><dd>{db.patients.length} patients, {db.tasks.length} tasks, {db.executions.length} executions, {db.audit.length} audit events</dd><dt>Persistence</dt><dd>This browser only</dd></dl>
        <Btn kind="danger" icon="RotateCcw" onClick={() => setConfirm(true)}>Reset synthetic data</Btn></Card>
      <Card title="Production-readiness gaps"><ul className="checks gaps">{['Backend services (NestJS API, PostgreSQL with Prisma migrations, Redis and BullMQ workers) replace the in-browser service layer', 'Real authentication (NHS CIS2 or organisational SSO) replaces the demo role switcher', 'Server-side permission enforcement and tenant isolation in the database', 'Live adapters only after Epic, GP and DMS interface approvals and credentials', 'Clinical sign-off of every rule threshold; current rules are synthetic', 'DCB0129 safety case, DCB0160 deployment assessment, DPIA, DSPT, penetration test', 'Medical device intended-purpose assessment', 'Accessibility audit against WCAG 2.2 AA with assistive-technology users', 'AI provider evaluation, prompt test sets and monitoring before any enablement', 'Operational monitoring, OpenTelemetry tracing, backup and incident processes'].map(x => <li key={x}>{x}</li>)}</ul></Card>
    </div>}
    {confirm && <Modal title="Reset synthetic data?" onClose={() => setConfirm(false)}><p>This restores the original scenarios and clears all runs, decisions and edits made in this browser.</p><div className="row gap8 end"><Btn onClick={() => setConfirm(false)}>Cancel</Btn><Btn kind="danger" onClick={() => { reset(); setConfirm(false); }}>Reset data</Btn></div></Modal>}
  </>;
}

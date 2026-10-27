import React, { useState, useMemo } from 'react';
import { useStore, user, can, isOverdue, GUIDED_PATIENTS } from '../store';
import { Icon, Pill, Synthetic, Btn, Card, Kpi, Table, Tabs, PageHead, Empty, Provenance, LabValue, PatientLink, due, Modal, Field } from './common';
import { Bars, Lines } from './charts';
import { kpis, charts, patientFlags, latestExec, svcFilter } from './metrics';
import { fmtDate, fmtDT, ageDays } from '../util';
import { ruleParams, LAB_LABEL } from '../rules';

const pl = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const SvcSelect = ({ v, set }: any) => <div className="seg" role="radiogroup" aria-label="Service">{[['all', 'Both services'], ['fls', 'Fracture liaison'], ['med', 'Medication safety']].map(([k, l]) => <button key={k} role="radio" aria-checked={v === k} className={v === k ? 'on' : ''} onClick={() => set(k)}>{l}</button>)}</div>;

export function CommandCentre() {
  const db = useStore(s => s.db); const go = useStore(s => s.go); const [svc, setSvc] = useState('all');
  const k = useMemo(() => kpis(db, svc), [db, svc]); const c = useMemo(() => charts(db, svc), [db, svc]);
  const [gSvc, setGSvc] = useState('fls'); const scen = db.patients.filter((p: any) => p.service === gSvc); const [gPid, setGPid] = useState('PT-F1');
  const gp = db.patients.find((p: any) => p.id === gPid) || scen[0]; const gex = latestExec(db, gp.id);
  return <>
    <PageHead title="Command Centre" sub="Live coordination state across both pathways, computed from the synthetic database." actions={<SvcSelect v={svc} set={setSvc} />} />
    <div className="kpis">
      <Kpi icon="Users" label="Active patients" value={k.active} onClick={() => go('worklists', { svc, flag: 'active' })} />
      <Kpi icon="ClipboardCheck" label="Open tasks" value={k.openTasks} tone="purple" onClick={() => go('tasks', { svc })} />
      <Kpi icon="Stethoscope" label="Awaiting clinical review" value={k.review} tone="purple" onClick={() => go('reviews', { svc })} />
      <Kpi icon="Timer" label="Overdue actions" value={k.overdue} tone="red" onClick={() => go('tasks', { svc, filter: 'overdue' })} />
      <Kpi icon="SearchX" label="Incomplete information" value={k.incomplete} tone="amber" onClick={() => go('worklists', { svc, flag: 'incomplete' })} />
      <Kpi icon="Send" label="Pending handovers" value={k.handovers} tone="amber" onClick={() => go('worklists', { svc: 'med', flag: 'handover' })} />
      <Kpi icon="CircleCheck" label="Completed workflows" value={k.completed} tone="green" onClick={() => go('worklists', { svc, flag: 'closed' })} />
      <Kpi icon="Plug" label="Failed integrations" value={k.failedInt} tone={k.failedInt ? 'red' : 'grey'} onClick={() => go('integrations')} />
    </div>

    <Card title="Guided demonstration" help="Pick a synthetic scenario, then watch the real workflow engine run it node by node. Approvals, tasks and audit entries are persisted.">
      <div className="guided">
        <ol className="steps">
          <li><span>1</span>Choose a service<div className="seg">{[['fls', 'Fracture liaison'], ['med', 'Medication safety']].map(([kk, l]) => <button key={kk} className={gSvc === kk ? 'on' : ''} onClick={() => { setGSvc(kk); setGPid(kk === 'fls' ? 'PT-F1' : 'PT-M2'); }}>{l}</button>)}</div></li>
          <li><span>2</span>Select a scenario<select value={gp.id} onChange={e => setGPid(e.target.value)} aria-label="Scenario">{scen.map((p: any) => <option key={p.id} value={p.id}>{p.scenario} ({p.name}){GUIDED_PATIENTS.includes(p.id) && !latestExec(db, p.id) ? ' · not yet run' : ''}</option>)}</select></li>
          <li><span>3</span>Open the workflow and run it<Btn kind="primary" icon="Play" onClick={() => go('studio', { wf: gSvc === 'fls' ? 'wf-fls' : 'wf-med', patient: gp.id, autoplay: true })}>Simulate in Workflow Studio</Btn></li>
        </ol>
        <p className="muted small">Current state for {gp.name}: {gex ? <Pill s={gex.status} /> : <Pill s="pending">Not yet run</Pill>} {gex?.summary}. Then approve from the review queue (switch to a clinician or pharmacist), open the generated task, and check the audit trail.</p>
      </div>
    </Card>

    <div className="grid2">
      <Card title="Workload trend (14 days)"><Lines data={c.trend} keys={[{ k: 'created', label: 'Tasks created', color: 'var(--purple)' }, { k: 'completed', label: 'Tasks completed', color: 'var(--green)' }]} /></Card>
      <Card title="Open tasks by priority"><Bars data={c.priority} onClick={() => go('tasks', { svc })} /></Card>
      <Card title="Workflow execution status"><Bars data={c.execStatus} /></Card>
      <Card title="Open exceptions by category">{c.exceptions.length ? <Bars data={c.exceptions} horizontal color="var(--amber-strong)" h={Math.max(160, c.exceptions.length * 38)} /> : <Empty icon="CircleCheck" title="No open exceptions" />}</Card>
      <Card title="Overdue task ageing"><Bars data={c.ageing} color="var(--red)" onClick={() => go('tasks', { svc, filter: 'overdue' })} /></Card>
      <Card title="Handover completion">{svc === 'fls' ? <Empty title="Handovers apply to medication safety" /> : <Bars data={c.handover} />}</Card>
      <Card title="Open tasks by role"><Bars data={c.workload} color="var(--purple)" /></Card>
      <Card title="Recent activity" actions={<Btn small onClick={() => go('governance')}>Full audit trail</Btn>}>
        <ul className="feed">{[...db.audit].reverse().slice(0, 7).map((a: any) => <li key={a.id}><span className="muted">{fmtDT(a.at)}</span> <strong>{a.actor}</strong> {a.action.replace(/[._]/g, ' ')}: {a.detail}</li>)}</ul>
      </Card>
    </div>
  </>;
}

const STAGES: any = {
  fls: [
    { t: 'Patient cohort identification', d: 'Patients approaching key milestones', c: 'blue' }, { t: 'Information retrieval and checks', d: 'Gather and validate required information', c: 'green' },
    { t: 'Rule-based analysis', d: 'Deterministic rules find the action needed', c: 'orange' }, { t: 'Task generation and coordination', d: 'Owned tasks keep patients moving', c: 'purple' },
    { t: 'Clinical review and decision', d: 'Clinicians make every clinical decision', c: 'blue' }, { t: 'Outcome and follow-up', d: 'Record actions and continue monitoring', c: 'green' }],
  med: [
    { t: 'Admission and inpatient care', d: 'Key information captured during the stay', c: 'blue' }, { t: 'Discharge planning', d: 'Discharge medication plan', c: 'green' },
    { t: 'Rule-based checks', d: 'Find gaps and required actions', c: 'orange' }, { t: 'Task generation and coordination', d: 'Assign follow-up to owners', c: 'purple' },
    { t: 'Handover and communication', d: 'Right information to the right people', c: 'blue' }, { t: 'Post-discharge monitoring', d: 'Track completion and escalate', c: 'green' }],
};

export function ServicePage({ service }: { service: 'fls' | 'med' }) {
  const db = useStore(s => s.db); const go = useStore(s => s.go); const run = useStore(s => s.run);
  const pts = db.patients.filter((p: any) => p.service === service); const flags = pts.map((p: any) => ({ p, f: patientFlags(db, p) }));
  const tasks = db.tasks.filter((t: any) => t.service === service && t.type !== 'historic'); const open = tasks.filter((t: any) => !['completed', 'cancelled'].includes(t.status));
  const execs = pts.map((p: any) => latestExec(db, p.id)).filter(Boolean); const F = (k: string) => execs.reduce((n: number, e: any) => n + (e.ctx.findings[k]?.length || 0), 0);
  const revs = db.reviews.filter((r: any) => r.service === service);
  const { params: win } = ruleParams(db.rules, 'R-FLS-004');
  const stats = service === 'fls' ? [
    [`${pts.length} synthetic cohort patients`, `${db.milestones.filter((m: any) => m.name === 'Second zoledronate dose review' && Math.abs(ageDays(m.due)) <= win.windowDays).length} second-dose milestones inside ${win.windowDays}-day window`, '≈465 second-dose patients reported in the proposal: planning reference only, not loaded'],
    [`${execs.reduce((n: number, e: any) => n + Object.values(e.ctx.labs).filter((x: any) => x && !x.interfaceFailure).length, 0)} results retrieved with provenance`, `Laboratory adapter: ${db.integrations.find((a: any) => a.id === 'epic-lab').health}`],
    [`${pl(F('missing'), 'missing result')}`, `${pl(F('outdated'), 'outdated result')}`, `${pl(F('attention'), 'value', 'values')} flagged for clinician`],
    [pl(open.length, 'open task'), `${open.filter(isOverdue).length} overdue`],
    [`${revs.filter((r: any) => r.status === 'awaiting').length} awaiting clinician`, pl(revs.filter((r: any) => r.status === 'decided').length, 'decision') + ' recorded'],
    [pl(pts.filter((p: any) => p.pathwayStatus.startsWith('Clinically reviewed')).length, 'next step') + ' authorised', `${db.milestones.filter((m: any) => pts.some((p: any) => p.id === m.patientId) && m.status === 'upcoming').length} upcoming milestones`],
  ] : [
    [`${pts.length} synthetic discharges`, `${db.medications.filter((m: any) => m.list === 'reconciliation').length} reconciliation entries`],
    [`${db.discharges.filter((d: any) => d.verified).length} verified discharge records`, `${db.medications.filter((m: any) => m.list === 'discharge' && m.change !== 'unchanged').length} medicines started, changed or stopped`, pl(db.medications.filter((m: any) => m.courseDays).length, 'short course') + ' tracked'],
    [pl(F('missing'), 'missing item'), pl(F('conflicts'), 'conflicting instruction')],
    [pl(open.length, 'open task'), `${open.filter(isOverdue).length} overdue`],
    [`${db.referrals.filter((r: any) => r.status === 'acknowledged').length} acknowledged`, `${db.referrals.filter((r: any) => r.status === 'sent').length} awaiting acknowledgement`, `${db.referrals.filter((r: any) => r.status === 'delivery_failed').length} delivery failed`],
    [pl(tasks.filter((t: any) => t.type === 'monitoring' && !['completed', 'cancelled'].includes(t.status)).length, 'monitoring task') + ' open', `${pts.filter((p: any) => p.pathwayStatus === 'Coordination closed').length} coordination closed`],
  ];
  const wf = service === 'fls' ? 'wf-fls' : 'wf-med';
  const strip = service === 'fls' ? ['Patient demographics', 'Encounters and diagnoses', 'Laboratory results', 'Medications and treatments', 'Appointments', 'Clinical notes and documents', 'Tasks and care team activity'] : ['Hospital EPR', 'Prescribing and medicines record', 'Laboratory results', 'Community pharmacy (DMS)', 'GP systems', 'Discharge documents and referrals', 'Patient communication'];
  return <>
    <PageHead title={service === 'fls' ? 'Fracture Liaison Service' : 'Medication Safety and Discharge Coordination'} sub={service === 'fls' ? 'Second-dose zoledronate coordination across the 12-month pathway. Clinicians decide treatment suitability.' : 'Accountable follow-up of discharge medicine changes. No prescribing, dose or discontinuation decisions are automated.'}
      actions={<><Btn icon="Workflow" onClick={() => go('studio', { wf })}>Open workflow</Btn><Btn kind="primary" icon="Users" onClick={() => go('worklists', { svc: service })}>Patient worklist</Btn></>} />
    <div className="stages">{STAGES[service].map((s: any, i: number) => <div key={i} className={`stage st-${s.c}`}><div className="stage-h"><span className="stage-n">{i + 1}</span><h3>{s.t}</h3></div><p>{s.d}</p><ul>{stats[i].map((x: string, j: number) => <li key={j}>{x}</li>)}</ul></div>)}</div>
    <div className="strip"><strong>{service === 'fls' ? 'Epic integration layer (synthetic adapters)' : 'Systems integration layer (synthetic adapters)'}</strong><div className="chips">{strip.map(s => <span key={s} className="chip">{s}</span>)}</div><Btn small onClick={() => go('integrations')}>Integration Hub</Btn></div>
    <Card title="Pathway cohort" pad={false}>
      <Table rows={flags} rowKey="id" onRow={(r: any) => go('patient', { id: r.p.id })} cols={[
        { k: 'n', h: 'Patient', r: (r: any) => <><strong>{r.p.name}</strong><br /><small className="muted">{r.p.nhsNumber} <Synthetic /></small></> },
        { k: 's', h: 'Scenario', r: (r: any) => r.p.scenario },
        { k: 'st', h: 'Pathway status', r: (r: any) => r.p.pathwayStatus },
        { k: 'w', h: 'Latest workflow', r: (r: any) => r.f.exec ? <Pill s={r.f.exec.status} /> : <Pill s="pending">Not yet run</Pill> },
        { k: 'fl', h: 'Flags', r: (r: any) => <div className="row gap4 wrap">{r.f.awaitingReview && <Pill tone="purple">Review</Pill>}{r.f.incomplete && <Pill tone="amber">Information</Pill>}{r.f.overdue && <Pill tone="red">Overdue</Pill>}{r.f.exceptions.length > 0 && <Pill tone="amber">{r.f.exceptions.length} exception{r.f.exceptions.length > 1 ? 's' : ''}</Pill>}</div> },
        { k: 'a', h: '', w: 210, r: (r: any) => <div className="row gap4" onClick={e => e.stopPropagation()}><Btn small icon="Play" onClick={() => go('studio', { wf, patient: r.p.id, autoplay: true })}>Simulate</Btn><Btn small icon="RefreshCw" onClick={() => run(wf, r.p.id, { trigger: 'Manual trigger' })}>Run</Btn></div> },
      ]} />
    </Card>
    <div className="strip gov"><Icon name="ShieldCheck" /><span>Governance, safety and audit apply across the whole workflow: role-based access, hash-linked audit log, clinical approval gates and versioned rules. Compliance status is shown in Governance and Audit; nothing here is certified.</span></div>
  </>;
}

export function Worklists({ params }: any) {
  const db = useStore(s => s.db); const go = useStore(s => s.go);
  const [svc, setSvc] = useState(params.svc || 'all'); const [flag, setFlag] = useState(params.flag || 'all'); const [q, setQ] = useState('');
  const rows = db.patients.filter(svcFilter(svc)).map((p: any) => ({ id: p.id, p, f: patientFlags(db, p) }))
    .filter((r: any) => flag === 'all' || (flag === 'active' && r.f.active) || (flag === 'incomplete' && r.f.incomplete) || (flag === 'review' && r.f.awaitingReview) || (flag === 'overdue' && r.f.overdue) || (flag === 'handover' && r.f.pendingHandover) || (flag === 'closed' && r.f.closed) || (flag === 'exceptions' && r.f.exceptions.length))
    .filter((r: any) => (r.p.name + r.p.nhsNumber).toLowerCase().includes(q.toLowerCase()));
  return <>
    <PageHead title="Patient Worklists" sub="Synthetic patients across both pathways. Select a row to open Patient 360." />
    <div className="filters">
      <SvcSelect v={svc} set={setSvc} />
      <select aria-label="Filter" value={flag} onChange={e => setFlag(e.target.value)}>{[['all', 'All patients'], ['active', 'Active'], ['incomplete', 'Incomplete information'], ['review', 'Awaiting clinical review'], ['overdue', 'Overdue actions'], ['handover', 'Pending handover'], ['exceptions', 'Open exceptions'], ['closed', 'Workflow completed']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input aria-label="Filter by name" placeholder="Filter by name or NHS number" value={q} onChange={e => setQ(e.target.value)} />
      <span className="muted">{rows.length} patient{rows.length === 1 ? '' : 's'}</span>
    </div>
    <Card pad={false}><Table rows={rows} onRow={(r: any) => go('patient', { id: r.p.id })} empty={<Empty title="No patients match these filters" action={<Btn onClick={() => { setFlag('all'); setQ(''); setSvc('all'); }}>Clear filters</Btn>} />} cols={[
      { k: 'n', h: 'Patient', r: (r: any) => <><strong>{r.p.name}</strong><br /><small className="muted">{r.p.nhsNumber} <Synthetic /></small></> },
      { k: 'sv', h: 'Service', r: (r: any) => r.p.service === 'fls' ? 'Fracture liaison' : 'Medication safety' },
      { k: 'sc', h: 'Scenario', r: (r: any) => r.p.scenario },
      { k: 'w', h: 'Workflow', r: (r: any) => r.f.exec ? <Pill s={r.f.exec.status} /> : <Pill s="pending">Not yet run</Pill> },
      { k: 't', h: 'Open tasks', r: (r: any) => r.f.openTasks },
      { k: 'fl', h: 'Flags', r: (r: any) => <div className="row gap4 wrap">{r.f.awaitingReview && <Pill tone="purple">Review</Pill>}{r.f.incomplete && <Pill tone="amber">Information</Pill>}{r.f.overdue && <Pill tone="red">Overdue</Pill>}{r.f.pendingHandover && <Pill tone="amber">Handover</Pill>}</div> },
    ]} /></Card>
  </>;
}

export function Patient360({ params }: any) {
  const db = useStore(s => s.db); const go = useStore(s => s.go); const uid = useStore(s => s.userId); const run = useStore(s => s.run);
  const recordResult = useStore(s => s.recordResult); const recordAck = useStore(s => s.recordAck); const resolve = useStore(s => s.resolveException);
  const [tab, setTab] = useState(params.tab || 'overview'); const [resModal, setResModal] = useState(false); const [code, setCode] = useState('VITD'); const [val, setVal] = useState('');
  const [exRes, setExRes] = useState<any>(null); const [note, setNote] = useState('');
  const p = db.patients.find((x: any) => x.id === params.id);
  if (!p) return <Empty title="Patient not found" action={<Btn onClick={() => go('worklists')}>Back to worklists</Btn>} />;
  const f = patientFlags(db, p); const ex = f.exec; const wf = p.service === 'fls' ? 'wf-fls' : 'wf-med';
  const obs = db.observations.filter((o: any) => o.patientId === p.id); const meds = db.medications.filter((m: any) => m.patientId === p.id);
  const dis = db.discharges.find((d: any) => d.patientId === p.id); const ref = db.referrals.find((r: any) => r.patientId === p.id);
  const tasks = db.tasks.filter((t: any) => t.patientId === p.id && t.type !== 'historic'); const comms = db.communications.filter((c: any) => c.patientId === p.id);
  const audit = db.audit.filter((a: any) => a.patientId === p.id).reverse(); const { params: rec } = ruleParams(db.rules, 'R-FLS-002');
  const conflicts = ex?.ctx?.findings?.conflicts || [];
  const summary = p.service === 'fls'
    ? `${p.name} is in the fracture liaison pathway. The second zoledronate dose review is due ${fmtDate(db.milestones.find((m: any) => m.patientId === p.id && m.name === 'Second zoledronate dose review')?.due)}. ${['VITD', 'EGFR', 'CA_ADJ'].map(c => { const o = obs.find((x: any) => x.code === c); return o ? `${LAB_LABEL[c]} recorded ${fmtDate(o.effective)}` : `${LAB_LABEL[c]} not available`; }).join('; ')}.`
    : `${p.name} was discharged ${fmtDate(dis?.dischargedAt)} from ${dis?.ward}. ${meds.filter((m: any) => m.list === 'discharge' && m.change !== 'unchanged').length} medicines were started, changed or stopped. Handover: ${ref ? ref.status.replace('_', ' ') : 'not yet sent'}.`;
  return <>
    <PageHead title={p.name} crumbs={[{ label: 'Patient Worklists', page: 'worklists' }]} sub={<>{p.nhsNumber} <Synthetic>Synthetic test identifier</Synthetic> · Born {fmtDate(p.dob)} · {p.sex === 'F' ? 'Female' : 'Male'} · {p.service === 'fls' ? 'Fracture Liaison Service' : 'Medication safety'}</>}
      actions={<>
        <Btn icon="Workflow" onClick={() => go('studio', { wf, patient: p.id, exec: ex?.id })}>View in Workflow Studio</Btn>
        {p.service === 'fls' && <Btn icon="FlaskConical" onClick={() => setResModal(true)}>Record new result</Btn>}
        {p.service === 'med' && ref?.status === 'sent' && <Btn icon="MailCheck" onClick={() => recordAck(p.id)}>Record acknowledgement</Btn>}
        <Btn kind="primary" icon="RefreshCw" onClick={() => run(wf, p.id, { trigger: 'Manual trigger' })}>Run workflow</Btn>
      </>} />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'medicines', label: 'Medicines', count: meds.length }, { id: 'investigations', label: 'Investigations', count: obs.length }, { id: 'pathway', label: 'Pathway' }, { id: 'tasks', label: 'Tasks', count: tasks.filter((t: any) => !['completed', 'cancelled'].includes(t.status)).length }, { id: 'comms', label: 'Communications', count: comms.length }, { id: 'history', label: 'History' }]} />
    {tab === 'overview' && <div className="grid2">
      <Card title="Clinical summary" help="Assembled deterministically from recorded data. It contains no AI-generated text.">
        <p>{summary}</p>
        <dl className="kv"><dt>Scenario</dt><dd>{p.scenario}</dd><dt>Pathway status</dt><dd>{p.pathwayStatus}</dd><dt>Latest workflow</dt><dd>{ex ? <><Pill s={ex.status} /> {ex.summary}</> : 'Not yet run'}</dd><dt>Execution</dt><dd>{ex ? `${ex.id} · ${ex.workflowName} v${ex.version} · ${ex.trigger}` : '—'}</dd></dl>
      </Card>
      <Card title="Open clinical exceptions">{f.exceptions.length ? <ul className="list">{f.exceptions.map((e: any) => <li key={e.id}><div><Pill s={e.priority} /> <strong>{e.category}</strong><p>{e.summary}</p><small className="muted">{e.id} · raised {fmtDT(e.createdAt)} by {e.sourceExecution}</small></div><Btn small onClick={() => { setExRes(e); setNote(''); }}>Resolve</Btn></li>)}</ul> : <Empty icon="CircleCheck" title="No open exceptions" />}</Card>
      <Card title="Open tasks">{tasks.filter((t: any) => !['completed', 'cancelled'].includes(t.status)).map((t: any) => <div key={t.id} className="mini-row" onClick={() => go('tasks', { id: t.id })}><Pill s={t.status} /> {t.title} <span className="muted">· {t.assignedRole} · due {due(t.due, t.status)}</span></div>)}{!tasks.some((t: any) => !['completed', 'cancelled'].includes(t.status)) && <Empty title="No open tasks" />}</Card>
      <Card title="Clinical reviews">{db.reviews.filter((r: any) => r.patientId === p.id).map((r: any) => <div key={r.id} className="mini-row" onClick={() => go('reviews', { id: r.id })}><Pill s={r.status} /> {r.type} {r.decision && <span className="muted">· {r.decision === 'authorise' ? 'next step authorised' : 'not progressed'} by {r.reviewer}</span>}</div>)}{!db.reviews.some((r: any) => r.patientId === p.id) && <Empty title="No reviews yet" />}</Card>
    </div>}
    {tab === 'medicines' && <>
      {conflicts.length > 0 && <div className="banner tone-amber"><Icon name="GitCompare" /> {conflicts.length} conflicting instruction{conflicts.length > 1 ? 's' : ''} detected for pharmacist review: {conflicts.map((c: any) => `${c.item} (discharge ${c.discharge}, reconciliation ${c.reconciliation})`).join('; ')}</div>}
      {['discharge', 'reconciliation', 'treatment'].map(list => { const rows = meds.filter((m: any) => m.list === list); return rows.length ? <Card key={list} title={list === 'discharge' ? 'Discharge medication list' : list === 'reconciliation' ? 'Medicines reconciliation' : 'Treatment history'} pad={false}>
        <Table rows={rows} cols={[{ k: 'name', h: 'Medicine', r: (m: any) => <strong>{m.name}</strong> }, { k: 'd', h: 'Dose and frequency', r: (m: any) => `${m.dose} ${m.frequency}` }, { k: 'c', h: 'Change', r: (m: any) => <Pill tone={{ started: 'blue', changed: 'amber', stopped: 'red', unchanged: 'grey' }[m.change as string]}>{m.change}</Pill> }, { k: 'r', h: 'Documented reason / monitoring', r: (m: any) => <>{m.reason || (m.change !== 'unchanged' && list === 'discharge' ? <span className="missing">No reason documented</span> : '—')}{m.previous && <><br /><small>Previously {m.previous}</small></>}{m.courseDays && <><br /><small>{m.courseDays}-day course, ends {fmtDate(m.courseEnd)}</small></>}{m.monitoringRequired && <><br />{m.monitoring ? <small>Monitoring: {m.monitoring}</small> : <span className="missing">Monitoring flagged, no plan documented</span>}</>}</> }, { k: 'p', h: 'Provenance', r: (m: any) => <Provenance source={m.source} at={m.recordedAt} verification={m.verification} /> }]} />
      </Card> : null; })}
      <p className="muted small">The platform displays and compares documented information only. It never changes, starts or stops medicines.</p>
    </>}
    {tab === 'investigations' && <Card title="Laboratory results" help="Every value shows its source, date, status and verification. A missing value is shown as missing, never as normal.">
      {p.service === 'fls' ? <Table rows={['VITD', 'EGFR', 'CA_ADJ'].map(c => ({ id: c, c, o: obs.find((x: any) => x.code === c) }))} cols={[{ k: 'c', h: 'Result', r: (r: any) => LAB_LABEL[r.c] }, { k: 'v', h: 'Value', r: (r: any) => <LabValue o={r.o} maxAge={rec.maxAgeDays[r.c]} /> }, { k: 'l', h: 'Recency limit (synthetic rule)', r: (r: any) => `${rec.maxAgeDays[r.c]} days` }, { k: 'p', h: 'Provenance', r: (r: any) => r.o ? <Provenance source={r.o.source} at={r.o.effective} status={r.o.status} verification={r.o.verification} /> : <span className="muted">No record in source system</span> }]} />
        : obs.length ? null : <Empty icon="TestTube" title="No laboratory results in the discharge record">Monitoring requirements are listed under Pathway.</Empty>}
    </Card>}
    {tab === 'pathway' && <div className="grid2">
      {p.service === 'fls' ? <Card title="Treatment milestones (12-month pathway)"><ol className="timeline">{db.milestones.filter((m: any) => m.patientId === p.id).sort((a: any, b: any) => a.due.localeCompare(b.due)).map((m: any) => <li key={m.id} className={`tl-${m.status}`}><strong>{m.name}</strong><span>{fmtDate(m.due)} · <Pill s={m.status} /></span><small className="muted">{m.source}</small></li>)}</ol></Card>
        : <Card title="Discharge record">{dis ? <dl className="kv"><dt>Discharged</dt><dd>{fmtDate(dis.dischargedAt)}, {dis.ward}</dd><dt>Verified</dt><dd>{dis.verified ? `Yes, ${dis.verifiedBy}` : <span className="missing">Not verified</span>}</dd><dt>Community pharmacy</dt><dd>{dis.nominatedPharmacy}</dd><dt>GP practice</dt><dd>{dis.gpPractice}</dd><dt>Source</dt><dd><Provenance source={dis.source} /></dd></dl> : <Empty title="No discharge record" />}</Card>}
      {p.service === 'med' && <Card title="Follow-up requirements">{dis?.followUp.map((fu: any) => <div key={fu.id} className="mini-row"><strong>{fu.item}</strong> <span className="muted">· {fu.responsible}{fu.verified ? ' (verified owner)' : ''} · due {due(fu.due)}</span></div>)}</Card>}
      {p.service === 'med' && <Card title="Handover referral">{ref ? <dl className="kv"><dt>Type</dt><dd>{ref.type}</dd><dt>Status</dt><dd><Pill s={ref.status} /></dd><dt>Sent</dt><dd>{fmtDT(ref.sentAt)}</dd><dt>Acknowledged</dt><dd>{ref.ackAt ? fmtDT(ref.ackAt) : <span className="missing">Not acknowledged</span>}</dd>{ref.error && <><dt>Error</dt><dd className="overdue">{ref.error}</dd></>}<dt>Channel</dt><dd>{ref.channel} (no message leaves the prototype)</dd></dl> : <Empty title="No referral yet" />}</Card>}
    </div>}
    {tab === 'tasks' && <Card pad={false}><Table rows={tasks} onRow={(t: any) => go('tasks', { id: t.id })} cols={[{ k: 'title', h: 'Task' }, { k: 'r', h: 'Role', r: (t: any) => t.assignedRole }, { k: 'p', h: 'Priority', r: (t: any) => <Pill s={t.priority} /> }, { k: 'd', h: 'Due', r: (t: any) => due(t.due, t.status) }, { k: 's', h: 'Status', r: (t: any) => <Pill s={t.status} /> }]} /></Card>}
    {tab === 'comms' && <Card pad={false}><Table rows={comms} onRow={(c: any) => go('comms', { id: c.id })} empty={<Empty icon="Mail" title="No communications drafted" />} cols={[{ k: 't', h: 'Draft', r: (c: any) => c.template }, { k: 'o', h: 'Origin', r: (c: any) => c.origin === 'ai' ? <Pill tone="ai">AI draft</Pill> : <Pill tone="grey">Approved template</Pill> }, { k: 's', h: 'Status', r: (c: any) => <Pill s={c.status} /> }, { k: 'c', h: 'Created', r: (c: any) => fmtDT(c.createdAt) }]} /></Card>}
    {tab === 'history' && <div className="grid2">
      <Card title="Workflow executions" pad={false}><Table rows={db.executions.filter((e: any) => e.patientId === p.id).reverse()} onRow={(e: any) => go('studio', { wf: e.workflowId, exec: e.id, patient: p.id })} cols={[{ k: 'id', h: 'Execution' }, { k: 't', h: 'Trigger', r: (e: any) => e.trigger }, { k: 's', h: 'Status', r: (e: any) => <Pill s={e.status} /> }, { k: 'a', h: 'Started', r: (e: any) => fmtDT(e.startedAt) }]} /></Card>
      <Card title="Audit timeline"><ul className="feed">{audit.map((a: any) => <li key={a.id}><span className="muted">{fmtDT(a.at)}</span> <strong>{a.actor}</strong> {a.action.replace(/[._]/g, ' ')}: {a.detail}</li>)}</ul></Card>
    </div>}
    {resModal && <Modal title="Record a new laboratory result (synthetic)" onClose={() => setResModal(false)}>
      <p className="muted">Simulates a “Laboratory result available” event. Any open information task is completed with this as evidence, and the workflow re-evaluates.</p>
      <Field label="Result"><select value={code} onChange={e => setCode(e.target.value)}>{['VITD', 'EGFR', 'CA_ADJ'].map(c => <option key={c} value={c}>{LAB_LABEL[c]}</option>)}</select></Field>
      <Field label="Value" hint={{ VITD: 'nmol/L', EGFR: 'mL/min/1.73m²', CA_ADJ: 'mmol/L' }[code]}><input type="number" step="any" value={val} onChange={e => setVal(e.target.value)} /></Field>
      {!can(uid, 'result.record') && <p className="banner tone-amber">Your role cannot record results. Switch to the specialist nurse or pharmacist.</p>}
      <div className="row gap8 end"><Btn onClick={() => setResModal(false)}>Cancel</Btn><Btn kind="primary" disabled={val === ''} onClick={() => { recordResult(p.id, code, Number(val)); setResModal(false); setVal(''); }}>Record result and re-evaluate</Btn></div>
    </Modal>}
    {exRes && <Modal title={`Resolve: ${exRes.category}`} onClose={() => setExRes(null)}><p>{exRes.summary}</p><Field label="Resolution note"><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field><div className="row gap8 end"><Btn onClick={() => setExRes(null)}>Cancel</Btn><Btn kind="primary" onClick={() => { resolve(exRes.id, note); setExRes(null); }}>Resolve exception</Btn></div></Modal>}
  </>;
}

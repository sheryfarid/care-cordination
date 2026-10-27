import React, { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Handle, Position, useReactFlow, applyNodeChanges, applyEdgeChanges, MarkerType } from '@xyflow/react';
import { create } from 'zustand';
import { useStore, user, can } from '../store';
import { NODE_TYPES, CATEGORIES, PORT_KIND, portsOf, validateWorkflow, autoLayout } from '../workflows';
import { dryRunTo } from '../engine';
import { ROLES } from '../seed';
import { Icon, Pill, Btn, Tabs, Modal, Field, Empty, PageHead, Synthetic } from './common';
import { fmtDT, clone, titleCase } from '../util';

const PORT_COLOR: Record<string, string> = { success: 'var(--green)', missing: 'var(--amber-strong)', conflict: 'var(--orange)', escalation: 'var(--red)', failure: 'var(--red)', neutral: 'var(--grey)' };
const catColor = (cat: string) => CATEGORIES.find(c => c.id === cat)?.color || 'var(--grey)';

// ----- Local editor state (Zustand) with undo/redo -----
type Snap = { nodes: any[]; edges: any[] };
const useEditor = create<{ nodes: any[]; edges: any[]; past: Snap[]; future: Snap[]; dirty: boolean;
  load: (n: any[], e: any[]) => void; snap: () => void; set: (p: Partial<Snap>, dirty?: boolean) => void; undo: () => void; redo: () => void; }>((set, get) => ({
  nodes: [], edges: [], past: [], future: [], dirty: false,
  load: (nodes, edges) => set({ nodes, edges, past: [], future: [], dirty: false }),
  snap: () => set({ past: [...get().past.slice(-60), { nodes: get().nodes, edges: get().edges }], future: [] }),
  set: (p, dirty = true) => set({ ...p, dirty: dirty || get().dirty } as any),
  undo: () => { const { past, nodes, edges, future } = get(); if (!past.length) return; const prev = past[past.length - 1]; set({ ...prev, past: past.slice(0, -1), future: [{ nodes, edges }, ...future], dirty: true }); },
  redo: () => { const { past, nodes, edges, future } = get(); if (!future.length) return; set({ ...future[0], future: future.slice(1), past: [...past, { nodes, edges }], dirty: true }); },
}));

const edgeStyle = (e: any, hot = false) => { const kind = PORT_KIND[e.sourceHandle] || 'success'; const c = PORT_COLOR[kind];
  return { ...e, type: 'smoothstep', animated: hot, label: e.sourceHandle && e.sourceHandle !== 'out' ? e.sourceHandle.replace(/_/g, ' ') : undefined, labelStyle: { fill: c, fontWeight: 600, fontSize: 11 }, labelBgStyle: { fill: 'var(--surface)' }, labelBgPadding: [4, 2], style: { stroke: c, strokeWidth: hot ? 3 : 1.6, strokeDasharray: kind === 'escalation' ? '6 4' : kind === 'neutral' ? '2 4' : undefined, opacity: hot ? 1 : 0.85 }, markerEnd: { type: MarkerType.ArrowClosed, color: c, width: 16, height: 16 } }; };
const toRF = (def: any) => ({ nodes: def.nodes.map((n: any) => ({ id: n.id, type: 'clinical', position: n.position || { x: 0, y: 0 }, data: { type: n.type, label: n.label, description: n.description, config: n.config || {} } })), edges: def.edges.map((e: any) => edgeStyle(e)) });
const toDef = (nodes: any[], edges: any[]) => ({ nodes: nodes.map(n => ({ id: n.id, type: n.data.type, label: n.data.label, description: n.data.description, config: n.data.config, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })), edges: edges.map(e => ({ id: e.id, source: e.source, sourceHandle: e.sourceHandle, target: e.target })) });

const Overlay = createContext<{ status: Record<string, any>; issues: Record<string, any[]> }>({ status: {}, issues: {} });

const RUN_LABEL: Record<string, string> = { pending: 'Pending', running: 'Running', completed: 'Completed', awaiting_approval: 'Awaiting approval', failed: 'Failed', skipped: 'Skipped' };
function ClinicalNode({ id, data, selected }: any) {
  const { status, issues } = useContext(Overlay); const t = NODE_TYPES[data.type] || { cat: 'control', icon: 'Circle', label: data.type };
  const ports = portsOf(data.type, data.config); const st = status[id]; const iss = issues[id] || []; const err = iss.some((i: any) => i.level === 'error');
  return <div className={`wnode run-${st?.s || 'none'}${selected ? ' sel' : ''}`} style={{ '--cat': catColor(t.cat) } as any} aria-label={`${data.label}, ${RUN_LABEL[st?.s] || 'not run'}`}>
    {!data.type.startsWith('trigger.') && <Handle type="target" position={Position.Left} className="h-in" />}
    <div className="wnode-h"><span className="wnode-ic"><Icon name={t.icon} size={16} /></span><strong>{data.label}</strong></div>
    <p className="wnode-d">{data.description || t.label}</p>
    <div className="wnode-f">
      <span className={`rs rs-${st?.s || 'none'}`}>{st ? RUN_LABEL[st.s] : t.label}</span>
      <span title={err ? iss.map((i: any) => i.msg).join('\n') : 'Configuration valid'} className={err ? 'cfg-bad' : 'cfg-ok'}><Icon name={err ? 'CircleAlert' : 'CircleCheck'} size={14} /></span>
    </div>
    {st?.result && <div className="wnode-r">{st.result}</div>}
    {ports.map((p: any, i: number) => <Handle key={p.id} id={p.id} type="source" position={Position.Right} className={`h-out k-${PORT_KIND[p.id]}`} style={{ top: ports.length === 1 ? '50%' : `${28 + (i * 56) / Math.max(1, ports.length - 1)}%` }} title={p.label || 'next'} />)}
    {ports.length > 1 && <div className="port-labels">{ports.map((p: any, i: number) => <span key={p.id} style={{ top: `${28 + (i * 56) / Math.max(1, ports.length - 1)}%`, color: PORT_COLOR[PORT_KIND[p.id]] }}>{p.label}</span>)}</div>}
  </div>;
}
const nodeTypes = { clinical: ClinicalNode };

function summarise(run: any) {
  if (!run) return null; if (run.message) return run.message;
  const o = run.output || {}; if (run.port && run.port !== 'out') return `→ ${run.port.replace(/_/g, ' ')}`;
  if (o.task) return `Task ${o.task}${o.duplicateSuppressed ? ' (existing)' : ''}`; if (o.exception) return `Exception ${o.exception}`; if (o.review) return `Review ${o.review}`;
  if (o.value !== undefined) return o.value === null ? 'Not available' : `${o.value} ${o.unit || ''}`;
  if (o.missing) return `${o.missing.length} missing`; if (o.outdated) return `${o.outdated.length} outdated`; if (o.needsClinicianAttention) return `${o.needsClinicianAttention.length} flagged`; if (o.conflicts) return `${Array.isArray(o.conflicts) ? o.conflicts.length : o.conflicts} conflicts`;
  return 'Done';
}

function Studio({ params }: any) {
  const db = useStore(s => s.db); const uid = useStore(s => s.userId); const go = useStore(s => s.go); const toast = useStore(s => s.toast);
  const run = useStore(s => s.run); const step = useStore(s => s.step); const playing = useStore(s => s.playing); const setPlaying = useStore(s => s.setPlaying); const speed = useStore(s => s.speed); const setSpeed = useStore(s => s.setSpeed);
  const decide = useStore(s => s.decide); const saveDraft = useStore(s => s.saveDraft); const publish = useStore(s => s.publish);
  const ed = useEditor(); const rf = useReactFlow();
  const [wfId, setWfId] = useState(params.wf || 'wf-fls'); const wf = db.workflows.find((w: any) => w.id === wfId);
  const published = [...wf.versions].reverse().find((v: any) => v.status === 'published');
  const [viewV, setViewV] = useState<number>(published.version); const ver = wf.versions.find((v: any) => v.version === viewV) || published;
  const [readOnly, setReadOnly] = useState(true); const [sel, setSel] = useState<string | null>(null); const [tab, setTab] = useState(params.patient ? 'sim' : 'inspect');
  const svcPts = db.patients.filter((p: any) => p.service === wf.service);
  const [simPid, setSimPid] = useState(params.patient || svcPts[0].id); const [execId, setExecId] = useState<string | null>(params.exec || null);
  const [replay, setReplay] = useState<number | null>(null); const [search, setSearch] = useState(''); const [modal, setModal] = useState<string | null>(null);
  const [rationale, setRationale] = useState(''); const [ioText, setIoText] = useState(''); const [cmp, setCmp] = useState<[number, number]>([1, wf.versions.length]); const [testRes, setTestRes] = useState<any>(null); const [note, setNote] = useState('');
  const searchRef = useRef<HTMLInputElement>(null); const autoplayed = useRef(false);

  const showStart = () => { const ids = [...useEditor.getState().nodes].sort((a, b) => a.position.x - b.position.x).slice(0, 7).map(n => ({ id: n.id })); rf.fitView({ nodes: ids, padding: 0.25, maxZoom: 0.95, duration: 300 }); };
  useEffect(() => { const { nodes, edges } = toRF(ver); ed.load(nodes, edges); setSel(null); setTimeout(showStart, 80); }, [wfId, viewV]);
  useEffect(() => { if (wf.service !== db.patients.find((p: any) => p.id === simPid)?.service) setSimPid(svcPts[0].id); }, [wfId]);
  useEffect(() => { if (params.autoplay && !autoplayed.current) { autoplayed.current = true; setTimeout(() => startSim(), 500); } }, []);

  const def = useMemo(() => toDef(ed.nodes, ed.edges), [ed.nodes, ed.edges]);
  const issues = useMemo(() => validateWorkflow(def.nodes, def.edges), [def]);
  const issueMap = useMemo(() => { const m: any = {}; issues.forEach(i => { if (i.nodeId) (m[i.nodeId] = m[i.nodeId] || []).push(i); }); return m; }, [issues]);
  const exec = execId ? db.executions.find((e: any) => e.id === execId) : null;
  const shownRuns = exec ? (replay !== null ? exec.runs.slice(0, replay) : exec.runs) : [];
  const status = useMemo(() => {
    const m: any = {}; if (!exec) return m;
    shownRuns.forEach((r: any) => (m[r.nodeId] = { s: r.status, result: summarise(r) }));
    const finished = !['running', 'awaiting_approval'].includes(exec.status) && replay === null;
    if (exec.status === 'running' && replay === null && exec.queue[0]) m[exec.queue[0]] = { s: 'running' };
    ed.nodes.forEach(n => { if (!m[n.id]) m[n.id] = { s: finished ? 'skipped' : 'pending' }; });
    return m;
  }, [exec, shownRuns.length, replay, ed.nodes]);
  const [follow, setFollow] = useState(true);
  useEffect(() => { if (!follow || !exec || exec.status !== 'running' || replay !== null) return; const n = ed.nodes.find(x => x.id === exec.queue[0]); if (n) rf.setCenter(n.position.x + 110, n.position.y + 60, { zoom: Math.max(rf.getZoom(), 0.75), duration: 280 }); }, [exec?.runs.length, exec?.status]);
  useEffect(() => { if (!exec || exec.status !== 'awaiting_approval' || !follow) return; const r = exec.runs[exec.runs.length - 1]; const n = r && ed.nodes.find(x => x.id === r.nodeId); if (n) rf.setCenter(n.position.x + 110, n.position.y + 60, { zoom: Math.max(rf.getZoom(), 0.75), duration: 280 }); }, [exec?.status]);
  const hot = useMemo(() => new Set(shownRuns.filter((r: any) => r.port).map((r: any) => `${r.nodeId}|${r.port}`)), [shownRuns.length, exec]);
  const edges = useMemo(() => ed.edges.map(e => hot.has(`${e.source}|${e.sourceHandle}`) ? edgeStyle(e, true) : e), [ed.edges, hot]);

  const editable = !readOnly;
  const onNodesChange = useCallback((all: any[]) => { const ch = editable ? all : all.filter(c => c.type === 'select' || c.type === 'dimensions'); if (!ch.length) return; if (ch.some(c => c.type === 'remove')) ed.snap(); ed.set({ nodes: applyNodeChanges(ch, useEditor.getState().nodes) }, ch.some(c => ['position', 'remove'].includes(c.type))); const s = ch.find(c => c.type === 'select' && c.selected); if (s) { setSel(s.id); setTab('inspect'); } }, [editable]);
  const onEdgesChange = useCallback((ch: any[]) => { if (!editable && ch.some(c => c.type === 'remove')) return; if (ch.some(c => c.type === 'remove')) ed.snap(); ed.set({ edges: applyEdgeChanges(ch, useEditor.getState().edges) }, ch.some(c => c.type === 'remove')); }, [editable]);
  const onConnect = useCallback((c: any) => { if (!editable) return; ed.snap(); const e = edgeStyle({ id: `${c.source}.${c.sourceHandle}-${c.target}`, source: c.source, sourceHandle: c.sourceHandle || 'out', target: c.target }); ed.set({ edges: [...useEditor.getState().edges.filter(x => x.id !== e.id), e] }); }, [editable]);
  const addNode = (type: string, position: any) => { if (!editable) { toast('Select “Edit as draft” to change the workflow.', 'info'); return; } const t = NODE_TYPES[type]; ed.snap(); const config: any = {}; t.fields.forEach((f: any) => { if (f.type === 'select') config[f.key] = f.options[0]; if (f.type === 'number') config[f.key] = 1; }); if (type === 'control.end') config.outcome = 'completed'; const id = `n${Date.now().toString(36)}`; ed.set({ nodes: [...useEditor.getState().nodes.map(n => ({ ...n, selected: false })), { id, type: 'clinical', position, selected: true, data: { type, label: t.label, description: '', config } }] }); setSel(id); setTab('inspect'); };
  const onDrop = (e: any) => { e.preventDefault(); const type = e.dataTransfer.getData('application/x-node'); if (type) addNode(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); };
  const duplicate = () => { if (!editable) return; const chosen = ed.nodes.filter(n => n.selected); if (!chosen.length) return; ed.snap(); const map: any = {}; const copies = chosen.map(n => { const id = `n${Math.random().toString(36).slice(2, 7)}`; map[n.id] = id; return { ...clone(n), id, selected: true, position: { x: n.position.x + 40, y: n.position.y + 40 } }; }); const ec = ed.edges.filter(e => map[e.source] && map[e.target]).map(e => edgeStyle({ ...e, id: `${map[e.source]}.${e.sourceHandle}-${map[e.target]}`, source: map[e.source], target: map[e.target] })); ed.set({ nodes: [...ed.nodes.map(n => ({ ...n, selected: false })), ...copies], edges: [...ed.edges, ...ec] }); };
  const layout = () => { if (!editable) return; ed.snap(); const laid = autoLayout(def.nodes, def.edges); ed.set({ nodes: ed.nodes.map(n => ({ ...n, position: laid.find((l: any) => l.id === n.id).position })) }); setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 30); };
  const doSave = () => { if (!editable) return; const v = saveDraft(wfId, def.nodes, def.edges, note); if (v) { setViewV(v); setReadOnly(false); setNote(''); setModal(null); } };
  useEffect(() => { const h = (e: KeyboardEvent) => { const tag = (e.target as any)?.tagName; if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return; const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (editable) e.shiftKey ? ed.redo() : ed.undo(); } else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); if (editable) ed.redo(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); } else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (editable) setModal('save'); } else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [editable, ed.nodes, ed.edges]);

  const startSim = () => { const draft = ed.dirty || ver.status !== 'published' ? def : undefined; const id = run(wfId, simPid, { animate: true, draft, trigger: draft ? 'Simulation (unpublished draft)' : 'Simulation' }); if (id) { setExecId(id); setReplay(null); setTab('sim'); } };
  const selNode = ed.nodes.find(n => n.id === sel); const selRun = exec && sel ? [...shownRuns].reverse().find((r: any) => r.nodeId === sel) : null;
  const updateSel = (patch: any) => { ed.snap(); ed.set({ nodes: ed.nodes.map(n => n.id === sel ? { ...n, data: { ...n.data, ...patch, config: { ...n.data.config, ...(patch.config || {}) } } } : n) }); };
  const review = exec?.awaitingReview ? db.reviews.find((r: any) => r.id === exec.awaitingReview) : null;
  const wfExecs = db.executions.filter((e: any) => e.workflowId === wfId).slice().reverse();
  const matches = search.length > 1 ? ed.nodes.filter(n => (n.data.label + n.data.type).toLowerCase().includes(search.toLowerCase())) : [];
  const focusNode = (n: any) => { rf.setCenter(n.position.x + 110, n.position.y + 50, { zoom: 1.2, duration: 400 }); ed.set({ nodes: ed.nodes.map(x => ({ ...x, selected: x.id === n.id })) }, false); setSel(n.id); setTab('inspect'); setSearch(''); };
  const diff = useMemo(() => { const a = wf.versions.find((v: any) => v.version === cmp[0]); const b = wf.versions.find((v: any) => v.version === cmp[1]); if (!a || !b) return []; const out: any[] = [];
    b.nodes.forEach((n: any) => { const o = a.nodes.find((x: any) => x.id === n.id); if (!o) out.push({ k: 'Added', t: n.label }); else if (JSON.stringify([o.label, o.config, o.type]) !== JSON.stringify([n.label, n.config, n.type])) out.push({ k: 'Changed', t: n.label, d: Object.keys({ ...o.config, ...n.config }).filter(k => JSON.stringify(o.config[k]) !== JSON.stringify(n.config[k])).map(k => `${k}: ${JSON.stringify(o.config[k])} → ${JSON.stringify(n.config[k])}`).join('; ') || 'label or type' }); });
    a.nodes.forEach((n: any) => { if (!b.nodes.some((x: any) => x.id === n.id)) out.push({ k: 'Removed', t: n.label }); });
    b.edges.forEach((e: any) => { if (!a.edges.some((x: any) => x.id === e.id)) out.push({ k: 'Connection added', t: `${e.source} (${e.sourceHandle}) → ${e.target}` }); });
    a.edges.forEach((e: any) => { if (!b.edges.some((x: any) => x.id === e.id)) out.push({ k: 'Connection removed', t: `${e.source} (${e.sourceHandle}) → ${e.target}` }); }); return out; }, [cmp, wf]);
  const errs = issues.filter(i => i.level === 'error').length;

  return <div className="studio">
    <div className="studio-bar">
      <select aria-label="Workflow" value={wfId} onChange={e => { setWfId(e.target.value); const w = db.workflows.find((x: any) => x.id === e.target.value); setViewV([...w.versions].reverse().find((v: any) => v.status === 'published').version); setExecId(null); setReadOnly(true); }}>{db.workflows.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
      <select aria-label="Version" value={viewV} onChange={e => { setViewV(Number(e.target.value)); setReadOnly(true); }}>{wf.versions.map((v: any) => <option key={v.version} value={v.version}>v{v.version} · {v.status}</option>)}</select>
      {ed.dirty && <Pill tone="amber">Unsaved changes</Pill>}
      {readOnly ? <Btn small icon="Pencil" onClick={() => setReadOnly(false)}>Edit as draft</Btn> : <Btn small icon="Eye" onClick={() => setReadOnly(true)}>Read-only review</Btn>}
      <span className="sep" />
      <Btn small icon="Undo2" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!editable || !ed.past.length} onClick={ed.undo} />
      <Btn small icon="Redo2" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!editable || !ed.future.length} onClick={ed.redo} />
      <Btn small icon="Copy" aria-label="Duplicate" title="Duplicate selection (Ctrl+D)" disabled={!editable} onClick={duplicate} />
      <Btn small icon="Map" title="Fit whole workflow" onClick={() => rf.fitView({ padding: 0.1, duration: 300 })}>Fit</Btn>
      <Btn small icon="LayoutGrid" title="Automatic layout" disabled={!editable} onClick={layout}>Layout</Btn>
      <div className="node-search"><Icon name="Search" size={15} /><input ref={searchRef} aria-label="Find node" placeholder="Find node (Ctrl+F)" value={search} onChange={e => setSearch(e.target.value)} />{matches.length > 0 && <div className="dropdown">{matches.slice(0, 8).map(n => <button key={n.id} onClick={() => focusNode(n)}><Icon name={NODE_TYPES[n.data.type]?.icon} size={15} />{n.data.label}</button>)}</div>}</div>
      <span className="sep" />
      <Btn small icon="Download" onClick={() => { setIoText(JSON.stringify({ format: 'care-coordination-workflow/1', workflow: wfId, ...def }, null, 2)); setModal('export'); }}>Export</Btn>
      <Btn small icon="Upload" disabled={!editable} onClick={() => { setIoText(''); setModal('import'); }}>Import</Btn>
      <Btn small icon="GitCompare" onClick={() => { setCmp([Math.max(1, wf.versions.length - 1), wf.versions.length]); setModal('compare'); }}>Compare</Btn>
      <Btn small icon="Save" disabled={!editable} onClick={() => setModal('save')}>Save draft</Btn>
      <Btn small kind="primary" icon="Rocket" disabled={ver.status !== 'draft' || ed.dirty} title={ver.status !== 'draft' ? 'Save a draft version first' : ''} onClick={() => publish(wfId, ver.version)}>Publish</Btn>
    </div>
    <div className="studio-body">
      <aside className="palette" aria-label="Node palette">
        <p className="muted small">Drag a node onto the canvas{readOnly ? ' (switch to Edit as draft first)' : ''}. Nodes only accept typed settings; scripts cannot be added.</p>
        {CATEGORIES.map(c => <details key={c.id} open={c.id !== 'ai'}><summary style={{ color: c.color }}>{c.label}</summary>
          {Object.entries(NODE_TYPES).filter(([, t]: any) => t.cat === c.id).map(([k, t]: any) => <div key={k} className="pal-item" draggable={editable} onDragStart={e => { e.dataTransfer.setData('application/x-node', k); e.dataTransfer.effectAllowed = 'move'; }} onDoubleClick={() => addNode(k, rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') addNode(k, rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })); }} style={{ '--cat': c.color } as any}><Icon name={t.icon} size={15} />{t.label}</div>)}
        </details>)}
      </aside>
      <div className="canvas" onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
        {readOnly && <div className="canvas-note"><Icon name="Eye" size={14} /> Read-only review of v{ver.version} ({ver.status})</div>}
        <Overlay.Provider value={{ status, issues: issueMap }}>
          <ReactFlow nodes={ed.nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
            onNodeDragStart={() => editable && ed.snap()} nodesDraggable={editable} nodesConnectable={editable} elementsSelectable deleteKeyCode={editable ? ['Backspace', 'Delete'] : null}
            multiSelectionKeyCode="Shift" selectionOnDrag={false} panOnScroll={false} minZoom={0.15} maxZoom={2} fitView proOptions={{ hideAttribution: true }} onPaneClick={() => setSel(null)}>
            <Background gap={22} size={1.2} color="var(--grid)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n: any) => { const s = status[n.id]?.s; return s === 'completed' ? '#007F3B' : s === 'failed' ? '#D5281B' : s === 'awaiting_approval' ? '#5C3EA8' : s === 'running' ? '#005EB8' : '#AEB7BD'; }} maskColor="rgba(120,130,140,0.18)" />
          </ReactFlow>
        </Overlay.Provider>
        <div className="legend">{[['success', 'Success'], ['missing', 'Missing data'], ['conflict', 'Conflict'], ['escalation', 'Clinical escalation'], ['failure', 'Technical failure']].map(([k, l]) => <span key={k}><i style={{ background: PORT_COLOR[k] }} />{l}</span>)}</div>
      </div>
      <aside className="inspector">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'inspect', label: 'Node' }, { id: 'sim', label: 'Simulate' }, { id: 'runs', label: 'Runs', count: wfExecs.length }, { id: 'issues', label: 'Checks', count: issues.length }]} />
        <div className="insp-b">
          {tab === 'inspect' && (selNode ? <>
            <div className="row gap8"><span className="wnode-ic" style={{ '--cat': catColor(NODE_TYPES[selNode.data.type]?.cat) } as any}><Icon name={NODE_TYPES[selNode.data.type]?.icon} /></span><div><strong>{NODE_TYPES[selNode.data.type]?.label}</strong><br /><small className="muted">{selNode.data.type} · id {selNode.id}</small></div></div>
            <Field label="Name"><input value={selNode.data.label} disabled={!editable} onChange={e => updateSel({ label: e.target.value })} /></Field>
            <Field label="Description"><input value={selNode.data.description} disabled={!editable} onChange={e => updateSel({ description: e.target.value })} /></Field>
            {NODE_TYPES[selNode.data.type]?.fields.map((f: any) => <Field key={f.key} label={f.label}>{f.type === 'select' ? <select disabled={!editable} value={selNode.data.config[f.key] ?? ''} onChange={e => updateSel({ config: { [f.key]: e.target.value } })}>{f.options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select> : <input type={f.type === 'number' ? 'number' : 'text'} disabled={!editable} value={selNode.data.config[f.key] ?? ''} onChange={e => updateSel({ config: { [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value } })} />}</Field>)}
            {(issueMap[selNode.id] || []).map((i: any, k: number) => <p key={k} className={`banner tone-${i.level === 'error' ? 'red' : 'amber'}`}>{i.msg}</p>)}
            <h4>Last execution result</h4>
            {selRun ? <><p><Pill s={selRun.status} /> {selRun.port && <>output <strong>{selRun.port.replace(/_/g, ' ')}</strong></>} {selRun.attempts > 1 && <span className="muted">· {selRun.attempts} attempts</span>}</p>{selRun.message && <p className="small">{selRun.message}</p>}{selRun.input && <><small className="muted">Rule inputs</small><pre className="json">{JSON.stringify(selRun.input, null, 2)}</pre></>}<small className="muted">Outputs</small><pre className="json">{JSON.stringify(selRun.output || {}, null, 2)}</pre></> : <p className="muted small">{exec ? 'Not executed in the selected run.' : 'Select a run in the Runs tab, or start a simulation.'}</p>}
            <h4>Node test run</h4>
            <p className="muted small">Dry-runs the path to this node for {db.patients.find((p: any) => p.id === simPid)?.name} on a disposable copy. Nothing is saved, and approval gates are never simulated.</p>
            <Btn small icon="FlaskConical" onClick={() => setTestRes(dryRunTo(db, wfId, simPid, selNode.id, def))}>Test this node</Btn>
            {testRes && <div className="test-res">{testRes.reached ? <><p><Pill s={testRes.run.status} /> {testRes.run.port && `→ ${testRes.run.port}`}</p><pre className="json">{JSON.stringify(testRes.run.output || testRes.run.message || {}, null, 2)}</pre></> : <p className="banner tone-amber">{testRes.stoppedBecause}</p>}<small className="muted">Path: {testRes.path.join(' → ')}</small></div>}
          </> : <Empty icon="Workflow" title="Select a node">Click a node to inspect its configuration and last result. Shift-drag to select several.</Empty>)}

          {tab === 'sim' && <>
            <Field label="Synthetic patient scenario"><select value={simPid} onChange={e => setSimPid(e.target.value)}>{svcPts.map((p: any) => <option key={p.id} value={p.id}>{p.name}: {p.scenario}</option>)}</select></Field>
            <div className="row gap8 wrap"><Btn kind="primary" icon="Play" onClick={startSim}>Start simulation</Btn>
              {exec && exec.status === 'running' && (playing === exec.id ? <Btn icon="Pause" onClick={() => setPlaying(null)}>Pause</Btn> : <Btn icon="Play" onClick={() => setPlaying(exec.id)}>Resume</Btn>)}
              {exec && exec.status === 'running' && <Btn icon="SkipForward" onClick={() => step(exec.id)}>Step</Btn>}
              <label className="row gap4 small"><input type="checkbox" checked={follow} onChange={e => setFollow(e.target.checked)} /> Follow</label><select aria-label="Speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value={900}>Slow</option><option value={550}>Normal</option><option value={200}>Fast</option></select></div>
            <p className="muted small">Each step calls the execution engine, which evaluates the real rules against the patient’s seeded records and persists the result. {ed.dirty || ver.status !== 'published' ? 'This will run the unpublished draft on screen.' : `Runs published v${ver.version}.`}</p>
            {exec ? <>
              <div className="exec-h"><strong>{exec.id}</strong> <Pill s={exec.status} /><br /><small className="muted">{db.patients.find((p: any) => p.id === exec.patientId)?.name} · v{exec.version} · {exec.trigger}</small>{exec.summary && <p>{exec.summary}</p>}</div>
              {review && <div className="gate-box"><h4><Icon name="ShieldCheck" size={16} /> {review.type}</h4><p className="small">Requires a {ROLES[review.requiredRole].label.toLowerCase()}. You are signed in as {ROLES[user(uid).role].label.toLowerCase()}.{user(uid).role !== review.requiredRole && ' Switch role in the header to decide.'}</p>
                {review.evidence?.checklist && <ul className="small">{review.evidence.checklist.map((c: any) => <li key={c.item}>{c.item}: {c.value} ({c.status})</li>)}</ul>}
                {review.evidence?.findings?.attention?.length > 0 && <p className="small banner tone-amber">Flagged for clinician attention: {review.evidence.findings.attention.join(', ')}</p>}
                {review.evidence?.findings?.conflicts?.length > 0 && <p className="small banner tone-amber">Conflicts: {review.evidence.findings.conflicts.map((c: any) => `${c.item} ${c.discharge} vs ${c.reconciliation}`).join('; ')}</p>}
                {review.service === 'fls' && <p className="small muted">“Information complete for review” is not a determination that treatment is safe.</p>}
                <Field label="Rationale (required)"><textarea rows={2} value={rationale} onChange={e => setRationale(e.target.value)} /></Field>
                <div className="row gap8 wrap"><Btn kind="primary" icon="Check" onClick={() => { decide(review.id, 'authorise', rationale, true); setRationale(''); }}>Authorise next step</Btn><Btn icon="X" onClick={() => { decide(review.id, 'decline', rationale, true); setRationale(''); }}>Do not progress</Btn></div>
                <Btn small kind="ghost" onClick={() => go('reviews', { id: review.id })}>Open in review queue</Btn></div>}
              <h4>Node-by-node log</h4>
              <ol className="runlog">{exec.runs.map((r: any, i: number) => <li key={i} className={`rs-${r.status}`} onClick={() => { setSel(r.nodeId); setTab('inspect'); }}><span className={`rs rs-${r.status}`}>{RUN_LABEL[r.status]}</span> {r.label}<small>{summarise(r)}</small></li>)}</ol>
              <div className="row gap8 wrap">{exec.runs.filter((r: any) => r.output?.task).map((r: any) => <Btn key={r.output.task} small icon="ClipboardCheck" onClick={() => go('tasks', { id: r.output.task })}>Open task {r.output.task}</Btn>)}<Btn small icon="ScrollText" onClick={() => go('governance', { corr: exec.id })}>Audit trail</Btn></div>
            </> : <Empty icon="Play" title="No run selected">Start a simulation to watch the engine execute.</Empty>}
          </>}

          {tab === 'runs' && <>
            {exec && <div className="replay"><h4>Replay {exec.id}</h4><input type="range" min={0} max={exec.runs.length} value={replay ?? exec.runs.length} onChange={e => setReplay(Number(e.target.value))} aria-label="Replay position" /><div className="row gap8"><span className="small">Step {replay ?? exec.runs.length} of {exec.runs.length}</span><Btn small icon="Play" onClick={() => { let i = 0; setReplay(0); const t = setInterval(() => { i++; setReplay(i); if (i >= exec.runs.length) { clearInterval(t); setReplay(null); } }, 350); }}>Replay</Btn>{replay !== null && <Btn small onClick={() => setReplay(null)}>Live view</Btn>}</div></div>}
            <ul className="runs">{wfExecs.map((e: any) => <li key={e.id} className={e.id === execId ? 'on' : ''}><button onClick={() => { setExecId(e.id); setReplay(null); }}><span><strong>{db.patients.find((p: any) => p.id === e.patientId)?.name}</strong> <Pill s={e.status} /></span><small className="muted">{e.id} · v{e.version} · {fmtDT(e.startedAt)} · {e.trigger}</small></button></li>)}</ul>
            {!wfExecs.length && <Empty title="No runs yet" />}
          </>}

          {tab === 'issues' && <>{issues.length ? <ul className="issues">{issues.map((i, k) => <li key={k}><Pill tone={i.level === 'error' ? 'red' : 'amber'}>{i.level}</Pill> <button className="link" onClick={() => { const n = ed.nodes.find(x => x.id === i.nodeId); if (n) focusNode(n); }}>{i.msg}</button></li>)}</ul> : <Empty icon="CircleCheck" title="All checks pass">This version can be published.</Empty>}
            <p className="muted small">Publishing is blocked while errors remain, including any path that reaches correspondence or scheduling without a clinical approval gate.</p></>}
        </div>
      </aside>
    </div>
    {modal === 'save' && <Modal title="Save as draft version" onClose={() => setModal(null)}><Field label="Change note"><input value={note} onChange={e => setNote(e.target.value)} placeholder="What changed and why" /></Field><p className="muted small">{errs ? `${errs} validation error(s). Drafts can be saved, but cannot be published until fixed.` : 'No validation errors.'}</p><div className="row gap8 end"><Btn onClick={() => setModal(null)}>Cancel</Btn><Btn kind="primary" onClick={doSave}>Save draft</Btn></div></Modal>}
    {modal === 'export' && <Modal title="Export workflow JSON" onClose={() => setModal(null)} wide><textarea className="mono" rows={18} readOnly value={ioText} /><div className="row gap8 end"><Btn icon="Copy" onClick={() => { navigator.clipboard?.writeText(ioText).then(() => toast('Copied to clipboard'), () => toast('Select the text and copy it manually', 'info')); }}>Copy</Btn></div></Modal>}
    {modal === 'import' && <Modal title="Import workflow JSON" onClose={() => setModal(null)} wide><textarea className="mono" rows={14} value={ioText} onChange={e => setIoText(e.target.value)} placeholder='{"nodes": [...], "edges": [...]}' /><div className="row gap8 end"><Btn kind="primary" onClick={() => { try { const j = JSON.parse(ioText); if (!Array.isArray(j.nodes) || !Array.isArray(j.edges)) throw new Error('JSON needs nodes and edges arrays'); const bad = j.nodes.find((n: any) => !NODE_TYPES[n.type]); if (bad) throw new Error(`Unknown node type ${bad.type}`); if (j.nodes.some((n: any) => 'code' in (n.config || {}) && n.type !== 'data.lab')) throw new Error('Script fields are not allowed'); ed.snap(); const r = toRF({ nodes: autoLayout(j.nodes, j.edges).map((n: any, i: number) => ({ ...n, position: j.nodes[i].position || n.position })), edges: j.edges }); ed.set({ nodes: r.nodes, edges: r.edges }); setModal(null); toast('Imported as unsaved changes'); } catch (e: any) { toast(`Import failed: ${e.message}`, 'error'); } }}>Import</Btn></div></Modal>}
    {modal === 'compare' && <Modal title="Compare workflow versions" onClose={() => setModal(null)} wide><div className="row gap8">{[0, 1].map(i => <select key={i} value={cmp[i]} onChange={e => { const c = [...cmp] as any; c[i] = Number(e.target.value); setCmp(c); }}>{wf.versions.map((v: any) => <option key={v.version} value={v.version}>v{v.version} · {v.status} · {v.note}</option>)}</select>)}</div>
      {diff.length ? <ul className="diff">{diff.map((d, i) => <li key={i}><Pill tone={d.k.includes('Removed') || d.k.includes('removed') ? 'red' : d.k.includes('Added') || d.k.includes('added') ? 'green' : 'amber'}>{d.k}</Pill> {d.t}{d.d && <small> {d.d}</small>}</li>)}</ul> : <Empty title="No differences" />}</Modal>}
  </div>;
}

export function WorkflowStudio({ params }: any) {
  return <><PageHead title="Workflow Studio" actions={<Synthetic>Synthetic rules, not for clinical use</Synthetic>} />
    <ReactFlowProvider><Studio params={params} /></ReactFlowProvider></>;
}

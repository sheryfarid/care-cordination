import { ageDays, TODAY } from './util';

// Deterministic rules engine. Logic is fixed code; only approved parameters vary by version.
// Every threshold here is SYNTHETIC and NOT SUITABLE FOR CLINICAL USE.
const SYN = 'Synthetic demonstration rule. Not suitable for clinical use.';
const v = (version: number, params: any, status = 'approved', note = 'Initial synthetic version') =>
  ({ version, params, status, effective: '2026-10-01', approvedBy: status === 'approved' ? 'Tom Hughes (synthetic)' : null, changeNote: note });

export const RULES: any[] = [
  { id: 'R-FLS-004', name: 'Milestone eligibility window', service: 'fls', owner: 'FLS clinical lead (synthetic)', description: 'Patient enters the workflow when the second-dose review milestone falls within the window.', versions: [v(1, { windowDays: 30 })],
    tests: [{ name: 'Due in 12 days is eligible', input: { dueInDays: 12 }, expect: { eligible: true } }, { name: 'Due in 45 days is not eligible', input: { dueInDays: 45 }, expect: { eligible: false } }] },
  { id: 'R-FLS-001', name: 'Required results present', service: 'fls', owner: 'FLS clinical lead (synthetic)', description: 'Vitamin D, renal function and adjusted calcium must each be available.', versions: [v(1, { required: ['VITD', 'EGFR', 'CA_ADJ'] })],
    tests: [{ name: 'Missing vitamin D is flagged', input: { labs: { EGFR: { value: 60 }, CA_ADJ: { value: 2.3 } } }, expect: { missing: ['VITD'] } }, { name: 'All present gives no missing', input: { labs: { VITD: { value: 60 }, EGFR: { value: 60 }, CA_ADJ: { value: 2.3 } } }, expect: { missing: [] } }] },
  { id: 'R-FLS-002', name: 'Result recency', service: 'fls', owner: 'FLS clinical lead (synthetic)', description: 'Each result must fall inside a maximum age in days.', versions: [v(1, { maxAgeDays: { VITD: 180, EGFR: 90, CA_ADJ: 90 } })],
    tests: [{ name: 'Calcium 230 days old is outdated', input: { labs: { CA_ADJ: { ageDays: 230 } } }, expect: { outdated: ['CA_ADJ'] } }, { name: 'eGFR 20 days old is current', input: { labs: { EGFR: { ageDays: 20 } } }, expect: { outdated: [] } }] },
  { id: 'R-FLS-003', name: 'Values needing clinician attention', service: 'fls', owner: 'FLS clinical lead (synthetic)', description: 'Flags values outside synthetic review bounds so a clinician assesses them. Does not determine suitability.', versions: [v(1, { EGFR: { below: 35 }, CA_ADJ: { below: 2.2, above: 2.6 }, VITD: { below: 25 } })],
    tests: [{ name: 'eGFR 31 is flagged for review', input: { labs: { EGFR: { value: 31 } } }, expect: { attention: ['EGFR'] } }, { name: 'eGFR 68 is not flagged', input: { labs: { EGFR: { value: 68 } } }, expect: { attention: [] } }] },
  { id: 'R-MED-001', name: 'Discharge information completeness and provenance', service: 'med', owner: 'Pharmacy lead (synthetic)', description: 'Changed or started medicines need a documented reason; medicines flagged for monitoring need a monitoring plan; follow-up owners must be verified; every record needs a source.', versions: [v(1, { requireReason: true, requireMonitoringPlan: true, requireVerifiedOwner: true })],
    tests: [{ name: 'Monitoring flag without plan is missing', input: { meds: [{ name: 'X', change: 'started', reason: 'r', monitoringRequired: true, source: 's' }], followUp: [] }, expect: { missingCount: 1 } }] },
  { id: 'R-MED-002', name: 'Conflicting medication instructions', service: 'med', owner: 'Pharmacy lead (synthetic)', description: 'Compares dose and frequency between discharge list and reconciliation where no change is documented.', versions: [v(1, { compare: ['dose', 'frequency'] })],
    tests: [{ name: 'Dose mismatch is a conflict', input: { discharge: [{ name: 'B', dose: '2.5 mg', frequency: 'OD', change: 'unchanged' }], recon: [{ name: 'B', dose: '5 mg', frequency: 'OD' }] }, expect: { conflicts: 1 } }] },
  { id: 'R-MED-003', name: 'Handover acknowledgement window', service: 'med', owner: 'Pharmacy lead (synthetic)', description: 'A sent referral without acknowledgement after the window is escalated.', versions: [v(1, { ackWindowDays: 2 })],
    tests: [{ name: 'Sent 6 days ago, no ack, is overdue', input: { sentDaysAgo: 6, ack: false }, expect: { state: 'not_acknowledged' } }, { name: 'Sent 1 day ago, no ack, is pending', input: { sentDaysAgo: 1, ack: false }, expect: { state: 'pending' } }] },
  { id: 'R-ESC-001', name: 'Task escalation interval', service: 'both', owner: 'Service manager (synthetic)', description: 'Open tasks past due by this many days are escalated.', versions: [v(1, { escalateAfterDays: 2 })],
    tests: [{ name: '5 days overdue escalates', input: { overdueDays: 5 }, expect: { escalate: true } }] },
].map(r => ({ ...r, disclaimer: SYN, history: [{ at: '2026-10-01', by: 'Tom Hughes (synthetic)', what: 'Version 1 approved for synthetic environment' }] }));

export const activeVersion = (rule: any) => [...rule.versions].reverse().find((x: any) => x.status === 'approved');
export const ruleParams = (rules: any[], id: string) => { const r = rules.find(x => x.id === id); const av = r && activeVersion(r); return { params: av?.params, version: av?.version }; };

const LABEL: any = { VITD: 'Vitamin D', EGFR: 'Renal function (eGFR)', CA_ADJ: 'Adjusted calcium' };

export const EVAL: Record<string, (p: any, input: any) => any> = {
  'R-FLS-004': (p, i) => ({ eligible: i.dueInDays <= p.windowDays && i.dueInDays >= -p.windowDays }),
  'R-FLS-001': (p, i) => ({ missing: p.required.filter((c: string) => !i.labs[c] || i.labs[c].value === null || i.labs[c].value === undefined) }),
  'R-FLS-002': (p, i) => ({ outdated: Object.keys(i.labs).filter(c => i.labs[c] && p.maxAgeDays[c] !== undefined && (i.labs[c].ageDays ?? ageDays(i.labs[c].effective)) > p.maxAgeDays[c]) }),
  'R-FLS-003': (p, i) => ({ attention: Object.keys(i.labs).filter(c => { const o = i.labs[c]; const b = p[c]; if (!o || o.value == null || !b) return false; return (b.below !== undefined && o.value < b.below) || (b.above !== undefined && o.value > b.above); }) }),
  'R-MED-001': (p, i) => {
    const missing: any[] = [];
    for (const m of i.meds) {
      if (!m.source) missing.push({ item: m.name, issue: 'No source provenance' });
      if (p.requireReason && ['started', 'changed', 'stopped'].includes(m.change) && !m.reason) missing.push({ item: m.name, issue: `No documented reason for ${m.change} medicine` });
      if (p.requireMonitoringPlan && m.monitoringRequired && !m.monitoring && !(i.followUp || []).some((f: any) => f.item?.toLowerCase().includes(m.name.toLowerCase()))) missing.push({ item: m.name, issue: 'Flagged as requiring monitoring but no monitoring plan documented' });
    }
    for (const f of i.followUp || []) if (p.requireVerifiedOwner && !f.verified) missing.push({ item: f.item, issue: 'Responsible owner not verified' });
    return { missing, missingCount: missing.length };
  },
  'R-MED-002': (p, i) => {
    const conflicts: any[] = [];
    for (const d of i.discharge) {
      const r = i.recon.find((x: any) => x.name === d.name);
      if (!r || d.change === 'stopped') continue;
      const diffs = p.compare.filter((f: string) => d[f] !== r[f]);
      if (diffs.length && d.change === 'unchanged') conflicts.push({ item: d.name, discharge: `${d.dose} ${d.frequency}`, reconciliation: `${r.dose} ${r.frequency}`, fields: diffs });
    }
    return { conflicts: conflicts.length, list: conflicts };
  },
  'R-MED-003': (p, i) => ({ state: i.ack ? 'acknowledged' : i.sentDaysAgo > p.ackWindowDays ? 'not_acknowledged' : 'pending' }),
  'R-ESC-001': (p, i) => ({ escalate: i.overdueDays > p.escalateAfterDays }),
};

export function runRuleTests(rule: any, params?: any) {
  const p = params || activeVersion(rule)?.params;
  return rule.tests.map((t: any) => {
    let out: any; let pass = false;
    try {
      out = EVAL[rule.id](p, t.input);
      pass = Object.keys(t.expect).every(k => JSON.stringify(Array.isArray(out[k]) ? out[k].map((x: any) => x.item || x) : out[k]) === JSON.stringify(t.expect[k]));
    } catch (e: any) { out = { error: e.message }; }
    return { ...t, out, pass };
  });
}
export const LAB_LABEL = LABEL;
export const _today = TODAY;

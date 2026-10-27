import { daysAgo, daysFrom, TODAY } from './util';
import { RULES } from './rules';
import { WORKFLOWS } from './workflows';

// Synthetic demonstration dataset. Every person, identifier and result below is fictional.
// NHS numbers use the 999 test range and are labelled synthetic wherever shown.
const SRC_EPIC = 'Synthetic Epic FHIR fixture';
const SRC_LAB = 'Synthetic laboratory fixture (FHIR Observation)';
const SRC_EPMA = 'Synthetic e-prescribing fixture';
const SRC_REC = 'Synthetic reconciliation record';

export const ROLES: Record<string, { label: string; perms: string[] }> = {
  clinician: { label: 'Clinician', perms: ['clinical.approve', 'task.update', 'comms.signoff', 'patient.read', 'workflow.run'] },
  nurse: { label: 'Specialist nurse', perms: ['task.update', 'patient.read', 'workflow.run', 'result.record'] },
  pharmacist: { label: 'Pharmacist', perms: ['clinical.approve', 'task.update', 'comms.signoff', 'patient.read', 'workflow.run', 'result.record'] },
  administrator: { label: 'Administrator', perms: ['task.update', 'patient.read', 'workflow.run', 'integration.manage'] },
  service_manager: { label: 'Service manager', perms: ['patient.read', 'workflow.run', 'workflow.publish', 'rule.approve', 'governance.manage', 'integration.manage', 'task.update'] },
};

export const USERS = [
  { id: 'U-CLIN', name: 'Dr Amara Okafor', role: 'clinician', service: 'both', title: 'Consultant (synthetic)' },
  { id: 'U-NURSE', name: 'Siân Bell', role: 'nurse', service: 'fls', title: 'FLS specialist nurse (synthetic)' },
  { id: 'U-PHARM', name: 'Rahul Mehta', role: 'pharmacist', service: 'med', title: 'Discharge pharmacist (synthetic)' },
  { id: 'U-ADMIN', name: 'Grace Liu', role: 'administrator', service: 'both', title: 'Pathway coordinator (synthetic)' },
  { id: 'U-MGR', name: 'Tom Hughes', role: 'service_manager', service: 'both', title: 'Service manager (synthetic)' },
];

const P = (id: string, name: string, nhs: string, dob: string, sex: string, service: string, scenario: string, extra: any = {}) =>
  ({ id, name, nhsNumber: nhs, dob, sex, service, scenario, pathwayStatus: 'Active', ...extra });

const obs = (patientId: string, code: string, value: number | null, unit: string, d: number, extra: any = {}) => ({
  id: `OBS-${patientId}-${code}`, patientId, code, value, unit, effective: daysAgo(d),
  source: SRC_LAB, status: 'final', verification: 'Matched to fixture checksum', ...extra,
});
const LABELS: Record<string, string> = { VITD: 'Vitamin D (25-OH)', EGFR: 'Renal function (eGFR)', CA_ADJ: 'Adjusted calcium' };

export function buildSeed() {
  const patients = [
    P('PT-F1', 'Margaret Ellis', '999 000 0011', '1948-03-12', 'F', 'fls', 'Complete information awaiting review'),
    P('PT-F2', 'Dennis Hartley', '999 000 0028', '1944-07-02', 'M', 'fls', 'Missing vitamin D result'),
    P('PT-F3', 'Joan Pryce', '999 000 0036', '1952-01-23', 'F', 'fls', 'Outdated calcium information'),
    P('PT-F4', 'Arthur Bowen', '999 000 0044', '1941-11-08', 'M', 'fls', 'Renal function requiring clinician assessment'),
    P('PT-F5', 'Eileen Marsh', '999 000 0052', '1946-05-17', 'F', 'fls', 'Overdue appointment coordination', { pathwayStatus: 'Clinically reviewed, next step authorised' }),
    P('PT-F6', 'Frank Whitlock', '999 000 0060', '1950-09-30', 'M', 'fls', 'Completed clinical review', { pathwayStatus: 'Clinically reviewed, next step authorised' }),
    P('PT-M1', 'Helen Carter', '999 000 0079', '1955-02-14', 'F', 'med', 'Discharge medicines changed', { ack: 'ack' }),
    P('PT-M2', 'Robert Singh', '999 000 0087', '1947-08-21', 'M', 'med', 'Conflicting medication instructions', { ack: 'ack' }),
    P('PT-M3', 'Patricia Gomez', '999 000 0095', '1958-12-03', 'F', 'med', 'Missing monitoring requirement information', { ack: 'ack' }),
    P('PT-M4', 'Kenneth Adeyemi', '999 000 0109', '1943-04-27', 'M', 'med', 'Referral awaiting acknowledgement', { ack: 'none' }),
    P('PT-M5', 'Sheila Brook', '999 000 0117', '1951-06-09', 'F', 'med', 'Overdue post-discharge monitoring', { ack: 'ack' }),
    P('PT-M6', 'Douglas Reid', '999 000 0125', '1956-10-11', 'M', 'med', 'Completed pharmacist handover', { ack: 'ack', pathwayStatus: 'Coordination closed' }),
    P('PT-M7', 'Norah Quinn', '999 000 0133', '1949-03-05', 'F', 'med', 'Referral delivery failure', { ack: 'fail' }),
  ];

  const observations = [
    obs('PT-F1', 'VITD', 62, 'nmol/L', 67), obs('PT-F1', 'EGFR', 68, 'mL/min/1.73m²', 20), obs('PT-F1', 'CA_ADJ', 2.38, 'mmol/L', 20),
    obs('PT-F2', 'EGFR', 55, 'mL/min/1.73m²', 30), obs('PT-F2', 'CA_ADJ', 2.31, 'mmol/L', 30),
    obs('PT-F3', 'VITD', 71, 'nmol/L', 110), obs('PT-F3', 'EGFR', 60, 'mL/min/1.73m²', 38), obs('PT-F3', 'CA_ADJ', 2.29, 'mmol/L', 230),
    obs('PT-F4', 'VITD', 58, 'nmol/L', 80), obs('PT-F4', 'EGFR', 31, 'mL/min/1.73m²', 15), obs('PT-F4', 'CA_ADJ', 2.34, 'mmol/L', 15),
    obs('PT-F5', 'VITD', 66, 'nmol/L', 60), obs('PT-F5', 'EGFR', 72, 'mL/min/1.73m²', 25), obs('PT-F5', 'CA_ADJ', 2.41, 'mmol/L', 25),
    obs('PT-F6', 'VITD', 80, 'nmol/L', 50), obs('PT-F6', 'EGFR', 64, 'mL/min/1.73m²', 28), obs('PT-F6', 'CA_ADJ', 2.36, 'mmol/L', 28),
  ].map(o => ({ ...o, label: LABELS[o.code] }));

  const milestones = patients.filter(p => p.service === 'fls').flatMap((p, i) => [
    { id: `MS-${p.id}-1`, patientId: p.id, name: 'Zoledronate dose 1 administered', due: daysAgo(340 - i * 4), status: 'completed', source: SRC_EPIC },
    { id: `MS-${p.id}-2`, patientId: p.id, name: 'Second zoledronate dose review', due: daysFrom(12 + i * 3), status: p.id === 'PT-F6' || p.id === 'PT-F5' ? 'reviewed' : 'upcoming', source: 'Synthetic pathway rule (12-month pathway)' },
    { id: `MS-${p.id}-3`, patientId: p.id, name: '12-month pathway review', due: daysFrom(40 + i * 3), status: 'upcoming', source: 'Synthetic pathway rule (12-month pathway)' },
  ]);

  const M = (patientId: string, name: string, dose: string, freq: string, change: string, extra: any = {}) =>
    ({ id: `MED-${patientId}-${name.split(' ')[0]}-${extra.list || 'd'}`, patientId, name, dose, frequency: freq, change, list: 'discharge', source: SRC_EPMA, recordedAt: daysAgo(3), verification: 'Pharmacist-verified flag present in fixture', ...extra });
  const medications = [
    // FLS treatment history
    ...['PT-F1', 'PT-F2', 'PT-F3', 'PT-F4', 'PT-F5', 'PT-F6'].map((id, i) => ({ id: `MED-${id}-ZOL`, patientId: id, name: 'Zoledronic acid IV infusion', dose: 'Dose 1 of planned course', frequency: 'Annual', change: 'unchanged', list: 'treatment', source: SRC_EPIC, recordedAt: daysAgo(340 - i * 4), verification: 'Administration record in fixture' })),
    // M1 — changes documented and consistent
    M('PT-M1', 'Apixaban', '5 mg', 'Twice daily', 'started', { reason: 'New atrial fibrillation (synthetic)' }),
    M('PT-M1', 'Ramipril', '2.5 mg', 'Once daily', 'changed', { reason: 'Dose reduced after acute kidney injury (synthetic)', previous: '5 mg once daily' }),
    M('PT-M1', 'Naproxen', '—', '—', 'stopped', { reason: 'Stopped: bleeding risk with anticoagulant (synthetic)' }),
    M('PT-M1', 'Atorvastatin', '20 mg', 'At night', 'unchanged'),
    M('PT-M1', 'Ramipril', '2.5 mg', 'Once daily', 'changed', { list: 'reconciliation', source: SRC_REC }),
    M('PT-M1', 'Apixaban', '5 mg', 'Twice daily', 'started', { list: 'reconciliation', source: SRC_REC }),
    // M2 — conflict between discharge list and reconciliation
    M('PT-M2', 'Bisoprolol', '2.5 mg', 'Once daily', 'unchanged'),
    M('PT-M2', 'Bisoprolol', '5 mg', 'Once daily', 'unchanged', { list: 'reconciliation', source: SRC_REC }),
    M('PT-M2', 'Furosemide', '40 mg', 'Every morning', 'started', { reason: 'Fluid overload (synthetic)' }),
    // M3 — monitoring flagged but plan missing; 10-day short course
    M('PT-M3', 'Prednisolone', '30 mg', 'Once daily', 'started', { reason: 'Short course (synthetic)', courseDays: 10, courseEnd: daysFrom(7) }),
    M('PT-M3', 'Amiodarone', '200 mg', 'Once daily', 'started', { reason: 'Rhythm control (synthetic)', monitoringRequired: true }),
    // M4..M7 — complete records
    M('PT-M4', 'Edoxaban', '60 mg', 'Once daily', 'started', { reason: 'Anticoagulation (synthetic)' }),
    M('PT-M5', 'Spironolactone', '25 mg', 'Once daily', 'started', { reason: 'Heart failure (synthetic)', monitoringRequired: true, monitoring: 'Potassium and renal function blood test' }),
    M('PT-M6', 'Lansoprazole', '30 mg', 'Once daily', 'started', { reason: 'Gastroprotection (synthetic)' }),
    M('PT-M7', 'Levothyroxine', '75 micrograms', 'Once daily', 'changed', { reason: 'Dose adjusted (synthetic)', previous: '50 micrograms once daily' }),
  ];

  const D = (patientId: string, d: number, followUp: any[], extra: any = {}) => ({ id: `DIS-${patientId}`, patientId, dischargedAt: daysAgo(d), ward: 'Ward D8 (synthetic)', verified: true, verifiedBy: 'Synthetic ward pharmacist', source: 'Synthetic discharge summary fixture', nominatedPharmacy: 'Synthetic Community Pharmacy A', gpPractice: 'Synthetic GP Practice 1', ...extra, followUp });
  const discharges = [
    D('PT-M1', 3, [{ id: 'FU-M1-1', item: 'Renal function blood test', due: daysFrom(8), responsible: 'GP practice', verified: true }, { id: 'FU-M1-2', item: 'New medicine review (DMS)', due: daysFrom(5), responsible: 'Community pharmacy', verified: true }]),
    D('PT-M2', 2, [{ id: 'FU-M2-1', item: 'Weight and fluid review', due: daysFrom(6), responsible: 'GP practice', verified: true }]),
    D('PT-M3', 2, [{ id: 'FU-M3-1', item: 'Prednisolone course completion check', due: daysFrom(7), responsible: 'Community pharmacy', verified: true }]),
    D('PT-M4', 8, [{ id: 'FU-M4-1', item: 'Anticoagulant counselling follow-up', due: daysFrom(3), responsible: 'Community pharmacy', verified: true }]),
    D('PT-M5', 16, [{ id: 'FU-M5-1', item: 'Potassium and renal function blood test', due: daysAgo(10), responsible: 'GP practice', verified: true }]),
    D('PT-M6', 21, [{ id: 'FU-M6-1', item: 'New medicine review (DMS)', due: daysAgo(12), responsible: 'Community pharmacy', verified: true }]),
    D('PT-M7', 1, [{ id: 'FU-M7-1', item: 'Thyroid function blood test', due: daysFrom(40), responsible: 'GP practice', verified: true }]),
  ];

  const referrals = [
    { id: 'REF-M4', patientId: 'PT-M4', type: 'Discharge Medicines Service referral', channel: 'Synthetic DMS adapter', status: 'sent', sentAt: daysAgo(6), ackAt: null, idempotencyKey: 'PT-M4:dms' },
    { id: 'REF-M5', patientId: 'PT-M5', type: 'Discharge Medicines Service referral', channel: 'Synthetic DMS adapter', status: 'acknowledged', sentAt: daysAgo(15), ackAt: daysAgo(14), idempotencyKey: 'PT-M5:dms' },
    { id: 'REF-M6', patientId: 'PT-M6', type: 'Discharge Medicines Service referral', channel: 'Synthetic DMS adapter', status: 'acknowledged', sentAt: daysAgo(20), ackAt: daysAgo(19), idempotencyKey: 'PT-M6:dms' },
  ];

  const T = (id: string, patientId: string, service: string, type: string, title: string, role: string, priority: string, due: string, status: string, extra: any = {}) =>
    ({ id, patientId, service, type, title, assignedRole: role, assignedUser: extra.assignedUser || null, priority, due, status, createdAt: extra.createdAt || daysAgo(5), sourceExecution: extra.sourceExecution || 'Seeded scenario', escalationPolicy: extra.escalationPolicy || 'Escalate to service manager 2 days after due date (synthetic rule R-ESC-001)', evidence: extra.evidence || null, idempotencyKey: extra.key || `${patientId}:${type}`, history: [{ at: extra.createdAt || daysAgo(5), by: 'System (seed)', what: 'Task created' }], ...extra });
  const tasks = [
    T('TSK-0F5A', 'PT-F5', 'fls', 'appointment_coordination', 'Book second-dose infusion appointment', 'administrator', 'high', daysAgo(8), 'assigned', { assignedUser: 'U-ADMIN', createdAt: daysAgo(14) }),
    T('TSK-0F6A', 'PT-F6', 'fls', 'appointment_coordination', 'Book second-dose infusion appointment', 'administrator', 'medium', daysAgo(6), 'completed', { assignedUser: 'U-ADMIN', createdAt: daysAgo(12), evidence: 'Appointment booked in synthetic appointments fixture, ref APT-5531' }),
    T('TSK-0M5A', 'PT-M5', 'med', 'monitoring', 'Confirm potassium and renal function blood test completed (GP practice)', 'pharmacist', 'high', daysAgo(10), 'open', { createdAt: daysAgo(15), key: 'PT-M5:monitoring:FU-M5-1', followUpId: 'FU-M5-1' }),
    T('TSK-0M6A', 'PT-M6', 'med', 'monitoring', 'Confirm new medicine review completed (community pharmacy)', 'pharmacist', 'medium', daysAgo(12), 'completed', { createdAt: daysAgo(19), key: 'PT-M6:monitoring:FU-M6-1', followUpId: 'FU-M6-1', evidence: 'DMS completion message received (synthetic), ref DMS-88213' }),
    // Historic closed work to give the trend charts real rows
    ...Array.from({ length: 14 }, (_, i) => T(`TSK-H${i}`, i % 2 ? 'PT-F6' : 'PT-M6', i % 2 ? 'fls' : 'med', 'historic', i % 2 ? 'Chase blood result (historic)' : 'Confirm handover (historic)', i % 3 ? 'nurse' : 'pharmacist', ['low', 'medium', 'high'][i % 3], daysAgo(14 - i), 'completed', { createdAt: daysAgo(15 - i), key: `hist-${i}`, evidence: 'Historic synthetic record' })),
  ];

  const reviews = [
    { id: 'REV-F5', patientId: 'PT-F5', service: 'fls', type: 'Second-dose readiness review', requiredRole: 'clinician', status: 'decided', decision: 'authorise', rationale: 'Results reviewed; authorised arrangement of second dose (synthetic).', reviewer: 'Dr Amara Okafor', decidedAt: daysAgo(15), createdAt: daysAgo(16), evidence: [], executionId: null },
    { id: 'REV-F6', patientId: 'PT-F6', service: 'fls', type: 'Second-dose readiness review', requiredRole: 'clinician', status: 'decided', decision: 'authorise', rationale: 'Results reviewed; authorised arrangement of second dose (synthetic).', reviewer: 'Dr Amara Okafor', decidedAt: daysAgo(13), createdAt: daysAgo(14), evidence: [], executionId: null },
    { id: 'REV-M6', patientId: 'PT-M6', service: 'med', type: 'Pharmacist handover review', requiredRole: 'pharmacist', status: 'decided', decision: 'authorise', rationale: 'Handover content verified (synthetic).', reviewer: 'Rahul Mehta', decidedAt: daysAgo(20), createdAt: daysAgo(21), evidence: [], executionId: null },
  ];

  const integrations = [
    { id: 'epic-fhir', name: 'Epic EPR (patient, encounters, documents)', service: 'fls', standard: 'HL7 FHIR R4 (mock)', health: 'healthy', mode: 'Synthetic adapter', scopes: ['Patient.read', 'Encounter.read', 'DocumentReference.read'], mapping: ['Patient.identifier → nhsNumber', 'Patient.birthDate → dob', 'Encounter.period → encounter dates'], retry: '3 attempts, exponential backoff 2s/4s/8s', lastTest: null, liveStatus: 'Not connected. Live access requires Epic App Orchard / local approval.' },
    { id: 'epic-lab', name: 'Laboratory results', service: 'fls', standard: 'FHIR Observation (mock)', health: 'healthy', mode: 'Synthetic adapter', scopes: ['Observation.read'], mapping: ['Observation.code (LOINC) → VITD / EGFR / CA_ADJ', 'Observation.effectiveDateTime → effective', 'Observation.status → status'], retry: '3 attempts, exponential backoff', lastTest: null, liveStatus: 'Not connected.' },
    { id: 'epic-appt', name: 'Appointments', service: 'fls', standard: 'FHIR Appointment (mock)', health: 'healthy', mode: 'Synthetic adapter', scopes: ['Appointment.read'], mapping: ['Appointment.start → appointment date'], retry: '3 attempts', lastTest: null, liveStatus: 'Not connected.' },
    { id: 'hospital-epr', name: 'Hospital EPR and discharge summaries', service: 'med', standard: 'FHIR Composition (mock)', health: 'healthy', mode: 'Synthetic adapter', scopes: ['Composition.read', 'MedicationStatement.read'], mapping: ['Composition.section[medications] → discharge list'], retry: '3 attempts', lastTest: null, liveStatus: 'Not connected. Actual EPR to be confirmed in discovery.' },
    { id: 'eprescribing', name: 'Electronic prescribing and reconciliation', service: 'med', standard: 'FHIR MedicationRequest (mock)', health: 'healthy', mode: 'Synthetic adapter', scopes: ['MedicationRequest.read'], mapping: ['MedicationRequest.dosageInstruction → dose, frequency'], retry: '3 attempts', lastTest: null, liveStatus: 'Not connected.' },
    { id: 'dms', name: 'Discharge Medicines Service messaging', service: 'med', standard: 'Existing NHS DMS route (mock)', health: 'healthy', mode: 'Synthetic adapter', scopes: ['Referral.send', 'Acknowledgement.read'], mapping: ['Discharge medicines → DMS referral payload'], retry: '3 attempts, idempotency key per patient', lastTest: null, liveStatus: 'Not connected. No messages leave this prototype.' },
    { id: 'gp', name: 'GP and community systems', service: 'med', standard: 'To be confirmed (e.g. GP Connect)', health: 'not_configured', mode: 'Discovery item', scopes: [], mapping: [], retry: '—', lastTest: null, liveStatus: 'Not configured.' },
  ];
  const discovery = [
    { name: '“Alira”', described: 'Hospital notes, prescribing, blood tests and radiology', status: 'Unverified: name transcribed from meeting notes' },
    { name: '“Heidi”', described: 'Consultation capture', status: 'Unverified: name transcribed from meeting notes' },
    { name: '“EMIS”', described: 'Pharmacy dispensing', status: 'Unverified: system and interface to be confirmed by local digital team' },
  ];

  const hazards = [
    { id: 'HAZ-001', title: 'Missing result displayed as normal or complete', cause: 'Null value rendered with default styling', effect: 'Treatment review proceeds without required information', control: 'Missing values rendered as explicit “Not available”; completeness rule fails closed; test “missing never complete”', severity: 'Major', likelihood: 'Low', status: 'Control implemented (synthetic)' },
    { id: 'HAZ-002', title: 'Interface failure produces false reassurance', cause: 'Adapter timeout treated as empty result', effect: 'Absent results interpreted as no results', control: 'Adapter failure routes to technical-failure branch and manual fallback task', severity: 'Major', likelihood: 'Medium', status: 'Control implemented (synthetic)' },
    { id: 'HAZ-003', title: 'Workflow bypasses clinical approval', cause: 'Edge drawn around approval gate', effect: 'Action without clinical authorisation', control: 'Publish validation requires gate before post-approval actions; backend permission check on approval', severity: 'Catastrophic', likelihood: 'Low', status: 'Control implemented (synthetic)' },
    { id: 'HAZ-004', title: 'Duplicate handover or task on retry', cause: 'Repeated trigger', effect: 'Confusing duplicate communications', control: 'Idempotency keys on tasks and referrals', severity: 'Minor', likelihood: 'Medium', status: 'Control implemented (synthetic)' },
    { id: 'HAZ-005', title: 'AI draft contains invented fact', cause: 'Model hallucination', effect: 'Incorrect correspondence', control: 'AI disabled by default; source citations; mandatory human sign-off; never auto-sent', severity: 'Major', likelihood: 'Medium', status: 'Control implemented (synthetic)' },
    { id: 'HAZ-006', title: 'Unacknowledged handover lost from view', cause: 'No acknowledgement tracking', effect: 'Community follow-up does not occur', control: 'Acknowledgement window rule and open exception until resolved', severity: 'Major', likelihood: 'Medium', status: 'Control implemented (synthetic)' },
  ];
  const governance = [
    { id: 'GOV-1', item: 'Clinical safety case (DCB0129, manufacturer)', status: 'Not assessed', note: '' },
    { id: 'GOV-2', item: 'Clinical risk management (DCB0160, deploying organisation)', status: 'Not assessed', note: '' },
    { id: 'GOV-3', item: 'Data protection impact assessment', status: 'In progress', note: 'Draft scope prepared for synthetic prototype only.' },
    { id: 'GOV-4', item: 'Data Security and Protection Toolkit obligations', status: 'Not assessed', note: '' },
    { id: 'GOV-5', item: 'Medical device intended-purpose assessment (UK MDR)', status: 'In progress', note: 'Intended purpose drafted as administrative coordination; requires regulatory review.' },
    { id: 'GOV-6', item: 'Information governance assessment', status: 'Not assessed', note: '' },
    { id: 'GOV-7', item: 'Penetration test and secure hosting review', status: 'Not assessed', note: '' },
    { id: 'GOV-8', item: 'Clinical sign-off of pathway rules', status: 'Not assessed', note: 'All rules are synthetic demonstration rules.' },
  ];

  return {
    meta: { seededAt: TODAY.toISOString(), aiMode: 'disabled', tenant: 'ORG-SYNTH-01' },
    patients, observations, milestones, medications, discharges, referrals, tasks, reviews,
    exceptions: [] as any[], communications: [] as any[], executions: [] as any[], audit: [] as any[], aiRuns: [] as any[],
    integrations, discovery, hazards, governance,
    rules: RULES, workflows: WORKFLOWS,
  };
}

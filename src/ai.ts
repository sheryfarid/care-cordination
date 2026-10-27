import { fmtDate } from './util';
import { LAB_LABEL } from './rules';

// Provider-independent AI adapter. Only a deterministic mock provider exists in this prototype.
// A real provider (e.g. Azure OpenAI where authorised) would implement the same interface.
export interface AiProvider { id: string; label: string; generate(req: { promptVersion: string; task: string; sources: any[] }): { text: string; citations: any[]; uncertainties: string[] } }

export const PROMPTS: Record<string, { version: string; text: string }[]> = {
  'fls-letter': [{ version: 'fls-letter-v0.2', text: 'Draft a plain-English letter. Use only supplied facts. Cite each fact. List missing facts as uncertainties.' }, { version: 'fls-letter-v0.3', text: 'As v0.2, plus: never state suitability for treatment.' }],
  'med-handover': [{ version: 'med-handover-v0.1', text: 'Summarise medicine changes for the next care provider. Cite each fact. Do not recommend changes.' }],
};

export const mockProvider: AiProvider = {
  id: 'mock-deterministic', label: 'Synthetic mock provider (deterministic, offline)',
  generate({ task, sources }) {
    const cites: any[] = []; const unc: string[] = [];
    const cite = (s: any) => { cites.push(s); return `[S${cites.length}]`; };
    if (task === 'fls-letter') {
      const p = sources.find(s => s.kind === 'patient');
      const lines = [`Dear ${p.name} ${cite(p)},`, '', 'Your bone health team is preparing for the next stage of your treatment plan.'];
      for (const code of ['VITD', 'EGFR', 'CA_ADJ']) {
        const o = sources.find(s => s.kind === 'obs' && s.code === code);
        if (o) lines.push(`Your ${LAB_LABEL[code].toLowerCase()} was recorded on ${fmtDate(o.effective)} ${cite(o)}.`);
        else unc.push(`${LAB_LABEL[code]} not found in sources; the draft does not mention it.`);
      }
      lines.push('', 'A member of the team will contact you about the next appointment. Your clinician will make any treatment decision.', '', 'Yours sincerely,', 'Fracture Liaison Service (synthetic)');
      return { text: lines.join('\n'), citations: cites, uncertainties: unc };
    }
    const p = sources.find(s => s.kind === 'patient');
    const meds = sources.filter(s => s.kind === 'med');
    const lines = [`Discharge medicines handover for ${p.name} ${cite(p)}`, ''];
    for (const m of meds) lines.push(`• ${m.name} ${m.dose !== '—' ? m.dose + ' ' + m.frequency : ''}: ${m.change}${m.reason ? ` (${m.reason})` : ''} ${cite(m)}`);
    const fu = sources.filter(s => s.kind === 'followup');
    if (fu.length) { lines.push('', 'Documented follow-up:'); fu.forEach(f => lines.push(`• ${f.item}, due ${fmtDate(f.due)}, owner ${f.responsible} ${cite(f)}`)); } else unc.push('No follow-up requirements found in sources.');
    meds.filter(m => m.monitoringRequired && !m.monitoring).forEach(m => unc.push(`${m.name} is flagged for monitoring but no plan is recorded.`));
    return { text: lines.join('\n'), citations: cites, uncertainties: unc };
  },
};

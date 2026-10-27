// Shared helpers. The demo clock is fixed so that synthetic scenarios stay reproducible.
export const TODAY = new Date('2026-10-20T09:00:00Z');
export const DAY = 86400000;
let counter = 1000;
export const uid = (p: string) => `${p}-${(++counter).toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
export const addDays = (d: string | Date, n: number) => new Date(new Date(d).getTime() + n * DAY).toISOString();
export const daysAgo = (n: number) => addDays(TODAY, -n);
export const daysFrom = (n: number) => addDays(TODAY, n);
export const ageDays = (iso: string, ref: Date = TODAY) => Math.floor((ref.getTime() - new Date(iso).getTime()) / DAY);
export const fmtDate = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDT = (iso?: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const nowIso = () => {
  // Demo time advances in real seconds from the fixed demo date, so ordering stays correct.
  const offset = Date.now() - START;
  return new Date(TODAY.getTime() + offset).toISOString();
};
const START = Date.now();
export const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());

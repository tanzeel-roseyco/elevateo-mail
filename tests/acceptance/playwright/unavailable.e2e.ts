import { unavailable } from './cases.js';

// AIDEV-NOTE: Missing controlled backend faults are explicit evidence gaps, never simulated passing UI cases.
const missing: Record<string, string> = {
  'SCN-READ-001-P': 'Seed exposes one own mailbox; multiple authorized capability-varying mailbox partition unavailable',
  'SCN-DRAFT-001-F2': 'Boundary rejection with independent unchanged database evidence not supplied in this slice',
  'SCN-DRAFT-003-F2': 'No controlled recorded-conflict or unrelated-operation lookup response with independent outcome/recovery evidence supplied',
  'SCN-GUI-006-F1': 'No independently controlled invalid API routing response supplied',
};
for (const [id, reason] of Object.entries(missing)) unavailable(id, reason);

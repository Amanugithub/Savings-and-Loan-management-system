// The nine real loan statuses a member-facing screen needs to reason about
// (backend/src/db/migrations/postgres/master.sql, loans.status CHECK).
export const TERMINAL_STATUSES = ['guarantor_declined', 'recommendation_declined', 'rejected', 'closed'];
export const IN_PROGRESS_STATUSES = [
  'awaiting_guarantor',
  'awaiting_recommendation',
  'awaiting_committee_approval',
  'approved',
];

export function isInProgress(status) {
  return IN_PROGRESS_STATUSES.includes(status);
}

export function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

const STATUS_EYEBROW = {
  awaiting_guarantor: 'AWAITING GUARANTOR',
  awaiting_recommendation: 'UNDER REVIEW',
  awaiting_committee_approval: 'UNDER REVIEW',
  approved: 'APPROVED — AWAITING DISBURSEMENT',
  active: 'ACTIVE LOAN',
  closed: 'CLOSED',
  rejected: 'REJECTED',
  guarantor_declined: 'GUARANTOR DECLINED',
  recommendation_declined: 'DECLINED',
};

export function statusEyebrow(status) {
  return STATUS_EYEBROW[status] ?? status.replaceAll('_', ' ').toUpperCase();
}

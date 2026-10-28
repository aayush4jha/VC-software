import type { TerminalStatus } from '@/types/database';

/**
 * The board columns that hold companies by status rather than by stage.
 *
 * A company with a terminal status is off the pipeline, so it has no stage
 * column to sit in. Only Rejected had a column of its own, which left anyone
 * marked Awaiting Response, Blocker or Next Round Analysis on no column at all
 * — 81 of the Notion import among them, invisible on the board. The titles are
 * the team's own, from Notion's Deal Status.
 *
 * `key` is what the Stage filter stores for the column, beside stage ids.
 */
export const STATUS_COLUMNS: { key: string; title: string; statuses: TerminalStatus[]; color: string }[] = [
    { key: '__awaiting__', title: 'Awaiting Response/Blocker', statuses: ['Awaiting Response', 'Blocker'], color: '#f59e0b' },
    { key: '__next_round__', title: 'Next Round Evaluation', statuses: ['Next Round Analysis'], color: '#0ea5e9' },
    { key: '__rejected__', title: 'Rejected', statuses: ['Rejected'], color: '#ef4444' },
];

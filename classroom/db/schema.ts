import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  expectedGroups: integer('expected_groups').notNull(),
  phase: text('phase').notNull().default('open'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [check('sessions_phase_check', sql`${table.phase} IN ('open', 'locked', 'revealed', 'closed')`)]);

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  label: text('label').notNull(),
  labelKey: text('label_key').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  recoveryPinHash: text('recovery_pin_hash'),
  joinedAt: text('joined_at').notNull(),
}, table => [uniqueIndex('groups_session_label_key_unique').on(table.sessionId, table.labelKey)]);

export const responses = sqliteTable('responses', {
  groupId: text('group_id').primaryKey().references(() => groups.id),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  baselineSveT: real('baseline_sve_t').notNull(),
  baselineBiopileT: real('baseline_biopile_t').notNull(),
  providerUuid: text('provider_uuid').notNull(),
  changedSveT: real('changed_sve_t').notNull(),
  changedBiopileT: real('changed_biopile_t').notNull(),
  gacReason: text('gac_reason').notNull(),
  cutoffChoice: text('cutoff_choice').notNull(),
  explanation: text('explanation').notNull(),
  snapshot: text('snapshot').notNull(),
  methodUuid: text('method_uuid').notNull(),
  electricityFlowUuid: text('electricity_flow_uuid').notNull(),
  revision: integer('revision').notNull().default(1),
  submittedAt: text('submitted_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('responses_session_idx').on(table.sessionId)]);

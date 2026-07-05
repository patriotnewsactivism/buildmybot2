/**
 * AI Employees Schema
 * Database tables for AI employees that autonomously run the company.
 * Each employee has a role, personality, and set of responsibilities.
 * All task executions are logged in aiEmployeeLogs.
 */

import { pgTable, text, timestamp, boolean, integer, jsonb, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './schema';

// ─── AI Employees ────────────────────────────────────────────
export const aiEmployees = pgTable('ai_employees', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),

  // Identity
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 100 }).notNull(),
  avatar: text('avatar'), // URL or emoji
  description: text('description'),
  instructions: text('instructions'), // System prompt for this employee

  // Status
  status: varchar('status', { length: 50 }).default('active').notNull(), // active, busy, paused, off
  lastActiveAt: timestamp('last_active_at'),
  tasksCompleted: integer('tasks_completed').default(0).notNull(),
  tasksToday: integer('tasks_today').default(0).notNull(),

  // Configuration
  emailEnabled: boolean('email_enabled').default(false).notNull(),
  emailAddresses: jsonb('email_addresses'), // Array of email addresses this employee monitors
  schedule: jsonb('schedule'), // { days: [1-5], startTime: '09:00', endTime: '17:00' }

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull(),
});

export const aiEmployeesRelations = relations(aiEmployees, ({ many }) => ({
  logs: many(aiEmployeeLogs),
}));

// ─── AI Employee Logs ────────────────────────────────────────
export const aiEmployeeLogs = pgTable('ai_employee_logs', {
  id: text('id').primaryKey(),
  employeeId: text('employee_id').references(() => aiEmployees.id, { onDelete: 'cascade' }),
  organizationId: text('organization_id'),

  // Task details
  employeeName: varchar('employee_name', { length: 100 }),
  role: varchar('role', { length: 100 }),
  taskType: varchar('task_type', { length: 100 }).notNull(), // email_response, support_triage, content_creation, standup, health_check, lead_followup, etc.
  status: varchar('status', { length: 50 }).default('pending').notNull(), // pending, running, completed, failed

  // I/O
  input: jsonb('input'), // Task input data
  output: jsonb('output'), // Task output/result
  summary: text('summary'), // Human-readable summary
  metadata: jsonb('metadata'), // Extra context (tokens used, model, duration, etc.)

  // Timing
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  duration: integer('duration'), // milliseconds
});

export const aiEmployeeLogsRelations = relations(aiEmployeeLogs, ({ one }) => ({
  employee: one(aiEmployees, {
    fields: [aiEmployeeLogs.employeeId],
    references: [aiEmployees.id],
  }),
}));

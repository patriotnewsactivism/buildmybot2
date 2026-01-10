import { index, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

// Session storage table for user authentication
export const sessions = pgTable(
  'sessions',
  {
    sid: varchar('sid').primaryKey(),
    sess: jsonb('sess').notNull(),
    expire: timestamp('expire').notNull(),
  },
  (table) => [index('IDX_session_expire').on(table.expire)],
);

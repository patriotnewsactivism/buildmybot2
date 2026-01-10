import { pool } from '../db';

type RequestRecord = {
  timestamp: number;
  status: number;
  durationMs: number;
  userId?: string;
};

class SystemMetricsService {
  private records: RequestRecord[] = [];
  private activeUsers: Map<string, number> = new Map();

  recordRequest(record: RequestRecord) {
    this.records.push(record);
    if (record.userId) {
      this.activeUsers.set(record.userId, record.timestamp);
    }
    this.prune();
  }

  private prune() {
    const cutoff = Date.now() - 60 * 1000;
    this.records = this.records.filter((record) => record.timestamp >= cutoff);
  }

  getSnapshot() {
    const now = Date.now();
    const minuteCutoff = now - 60 * 1000;
    const activeCutoff = now - 15 * 60 * 1000;

    const recent = this.records.filter(
      (record) => record.timestamp >= minuteCutoff,
    );
    const total = recent.length;
    const errors = recent.filter((record) => record.status >= 500).length;
    const avgLatency = total
      ? Math.round(
          recent.reduce((sum, record) => sum + record.durationMs, 0) / total,
        )
      : 0;

    const activeUsers = Array.from(this.activeUsers.entries()).filter(
      ([, lastSeen]) => lastSeen >= activeCutoff,
    );

    return {
      apiCallsPerMin: total,
      errorRate: total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0,
      avgLatencyMs: avgLatency,
      activeUsers: activeUsers.length,
      dbConnections: pool.totalCount ?? 0,
      dbIdleConnections: pool.idleCount ?? 0,
      dbWaitingConnections: pool.waitingCount ?? 0,
    };
  }
}

export const systemMetricsService = new SystemMetricsService();

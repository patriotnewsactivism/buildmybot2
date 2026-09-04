// =====================================================================
// P1: real analytics aggregation helpers (no synthesised series).
// =====================================================================

/**
 * Buckets rows into the last `days` calendar days (UTC) using whichever
 * timestamp column the table actually has. Returns real counts only —
 * days with no rows report 0 instead of being interpolated.
 */
export function bucketByDay(
  rows: any[],
  days: number,
): Array<{ date: string; count: number }> {
  const buckets: Array<{ date: string; count: number }> = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    index.set(date, buckets.length);
    buckets.push({ date, count: 0 });
  }
  for (const row of rows || []) {
    const raw = row?.timestamp || row?.created_at || row?.createdAt;
    if (!raw) continue;
    const date = String(raw).slice(0, 10);
    const pos = index.get(date);
    if (pos !== undefined) buckets[pos].count += 1;
  }
  return buckets;
}

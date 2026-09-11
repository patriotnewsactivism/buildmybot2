/**
 * Structured latency / audio diagnostics for Telnyx media bridges.
 * Keeps counters cheap and secret-free for call-log metadata and logs.
 */

export interface MediaDiagnosticsSnapshot {
  inboundFrames: number;
  outboundFrames: number;
  inboundBytes: number;
  outboundBytes: number;
  pendingInboundBytes: number;
  pendingOutboundBytes: number;
  bargeIns: number;
  droppedInboundChunks: number;
  droppedOutboundBytes: number;
  functionCalls: number;
  functionCancels: number;
  settingsAppliedAtMs: number | null;
  firstInboundAtMs: number | null;
  firstOutboundAtMs: number | null;
  msToSettingsApplied: number | null;
  msToFirstInbound: number | null;
  msToFirstOutbound: number | null;
  inboundFrameRateHz: number | null;
  outboundFrameRateHz: number | null;
}

export class MediaDiagnostics {
  readonly startedAtMs = Date.now();

  inboundFrames = 0;
  outboundFrames = 0;
  inboundBytes = 0;
  outboundBytes = 0;
  pendingInboundBytes = 0;
  pendingOutboundBytes = 0;
  bargeIns = 0;
  droppedInboundChunks = 0;
  droppedOutboundBytes = 0;
  functionCalls = 0;
  functionCancels = 0;

  settingsAppliedAtMs: number | null = null;
  firstInboundAtMs: number | null = null;
  firstOutboundAtMs: number | null = null;

  markSettingsApplied(): void {
    if (this.settingsAppliedAtMs == null) {
      this.settingsAppliedAtMs = Date.now();
    }
  }

  recordInbound(bytes: number): void {
    this.inboundFrames += 1;
    this.inboundBytes += bytes;
    if (this.firstInboundAtMs == null) {
      this.firstInboundAtMs = Date.now();
    }
  }

  recordOutbound(bytes: number): void {
    this.outboundFrames += 1;
    this.outboundBytes += bytes;
    if (this.firstOutboundAtMs == null) {
      this.firstOutboundAtMs = Date.now();
    }
  }

  snapshot(): MediaDiagnosticsSnapshot {
    const now = Date.now();
    const elapsedSec = Math.max(0.001, (now - this.startedAtMs) / 1000);
    const delta = (at: number | null): number | null =>
      at == null ? null : Math.max(0, at - this.startedAtMs);

    return {
      inboundFrames: this.inboundFrames,
      outboundFrames: this.outboundFrames,
      inboundBytes: this.inboundBytes,
      outboundBytes: this.outboundBytes,
      pendingInboundBytes: this.pendingInboundBytes,
      pendingOutboundBytes: this.pendingOutboundBytes,
      bargeIns: this.bargeIns,
      droppedInboundChunks: this.droppedInboundChunks,
      droppedOutboundBytes: this.droppedOutboundBytes,
      functionCalls: this.functionCalls,
      functionCancels: this.functionCancels,
      settingsAppliedAtMs: this.settingsAppliedAtMs,
      firstInboundAtMs: this.firstInboundAtMs,
      firstOutboundAtMs: this.firstOutboundAtMs,
      msToSettingsApplied: delta(this.settingsAppliedAtMs),
      msToFirstInbound: delta(this.firstInboundAtMs),
      msToFirstOutbound: delta(this.firstOutboundAtMs),
      inboundFrameRateHz: this.inboundFrames / elapsedSec,
      outboundFrameRateHz: this.outboundFrames / elapsedSec,
    };
  }

  log(prefix: string, callControlId: string): void {
    const snap = this.snapshot();
    console.info(
      `${prefix} diagnostics call=${callControlId} ` +
        `inFrames=${snap.inboundFrames} outFrames=${snap.outboundFrames} ` +
        `bargeIns=${snap.bargeIns} pendingIn=${snap.pendingInboundBytes} ` +
        `pendingOut=${snap.pendingOutboundBytes} droppedIn=${snap.droppedInboundChunks} ` +
        `droppedOut=${snap.droppedOutboundBytes} msSettings=${snap.msToSettingsApplied} ` +
        `msFirstIn=${snap.msToFirstInbound} msFirstOut=${snap.msToFirstOutbound} ` +
        `inHz=${snap.inboundFrameRateHz?.toFixed(1)} outHz=${snap.outboundFrameRateHz?.toFixed(1)}`,
    );
  }
}

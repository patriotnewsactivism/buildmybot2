import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import { repairLogs, NewRepairLog, RepairLog, bots } from '../../shared/schema';
import logger from '../utils/logger';

export type FailurePattern = 'KNOWLEDGE_SOURCE_BROKEN' | 'API_KEY_INVALID' | 'BOT_CONFIG_INVALID' | 'VOICE_AGENT_OFFLINE';
export type FixAction = 'RESCAN_KNOWLEDGE_SOURCE' | 'PROMPT_API_KEY_UPDATE' | 'RESET_BOT_CONFIG' | 'RESTART_VOICE_AGENT';

interface RecoveryPrompt {
  title: string;
  description: string;
  actionLabel: string;
  fixAction: FixAction;
  metadata?: Record<string, any>;
}

interface FailurePatternDefinition {
  pattern: FailurePattern;
  regex?: RegExp; // Optional regex for log parsing
  keywords?: string[]; // Optional keywords for log parsing
  prompt: (log: RepairLog) => RecoveryPrompt;
  autoFix?: (log: RepairLog) => Promise<boolean>; // Optional automatic fix function
  undo?: (log: RepairLog) => Promise<boolean>; // Optional undo function for the fix
}

class ErrorRecoveryService {
  private failurePatterns: Map<FailurePattern, FailurePatternDefinition> = new Map();

  constructor() {
    this.registerFailurePatterns();
  }

  private registerFailurePatterns() {
    this.failurePatterns.set('KNOWLEDGE_SOURCE_BROKEN', {
      pattern: 'KNOWLEDGE_SOURCE_BROKEN',
      keywords: ['knowledge source failed', 'rag processing error', 'document parse error'],
      prompt: (log: RepairLog) => ({
        title: 'Knowledge Source Processing Failed',
        description: `The knowledge source '${(log.metadata as Record<string, any>)?.sourceName || 'unknown'}' for bot '${log.botId}' encountered an error during processing. This might affect your bot's ability to answer questions accurately.`,
        actionLabel: 'Rescan Knowledge Source',
        fixAction: 'RESCAN_KNOWLEDGE_SOURCE',
        metadata: { knowledgeSourceId: (log.metadata as Record<string, any>)?.knowledgeSourceId }
      }),
      autoFix: async (log: RepairLog) => {
        logger.info(`Attempting auto-fix for KNOWLEDGE_SOURCE_BROKEN for bot ${log.botId}, source ${(log.metadata as Record<string, any>)?.knowledgeSourceId}`);
        // Simulate a fix, in a real scenario this would call a service to re-process the source
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Placeholder for actual re-scan logic
        return Math.random() > 0.5; // Simulate success/failure
      }
    });

    this.failurePatterns.set('API_KEY_INVALID', {
      pattern: 'API_KEY_INVALID',
      keywords: ['invalid api key', 'authentication failed', 'openai key error'],
      prompt: (log: RepairLog) => ({
        title: 'Invalid API Key Detected',
        description: `The API key configured for your bot '${log.botId}' appears to be invalid or expired. This prevents the bot from functioning correctly.`, 
        actionLabel: 'Update API Key',
        fixAction: 'PROMPT_API_KEY_UPDATE',
        metadata: { apiKeyType: (log.metadata as Record<string, any>)?.apiKeyType }
      })
    });

    this.failurePatterns.set('BOT_CONFIG_INVALID', {
      pattern: 'BOT_CONFIG_INVALID',
      keywords: ['bot configuration error', 'malformed config', 'missing required field'],
      prompt: (log: RepairLog) => ({
        title: 'Bot Configuration Error',
        description: `Bot '${log.botId}' has an invalid or incomplete configuration. This could lead to unexpected behavior.`, 
        actionLabel: 'Review Bot Configuration',
        fixAction: 'RESET_BOT_CONFIG'
      }),
      autoFix: async (log: RepairLog) => {
        logger.info(`Attempting auto-fix for BOT_CONFIG_INVALID for bot ${log.botId}`);
        try {
          // In a real scenario, this would attempt to load a default config or fix common issues
          await db.update(bots)
            .set({ model: 'gpt-5o-mini', temperature: 0.7, voiceEnabled: false, voiceId: null })
            .where(eq(bots.id, log.botId));
          return true;
        } catch (error) {
          logger.error(`Auto-fix failed for BOT_CONFIG_INVALID for bot ${log.botId}:`, error);
          return false;
        }
      }
    });

    this.failurePatterns.set('VOICE_AGENT_OFFLINE', {
      pattern: 'VOICE_AGENT_OFFLINE',
      keywords: ['voice agent unreachable', 'call routing failed', 'twilio error'],
      prompt: (log: RepairLog) => ({
        title: 'Voice Agent Offline',
        description: `The voice agent for bot '${log.botId}' appears to be offline or unreachable. Incoming calls may not be handled.`, 
        actionLabel: 'Restart Voice Agent',
        fixAction: 'RESTART_VOICE_AGENT'
      }),
      autoFix: async (log: RepairLog) => {
        logger.info(`Attempting auto-fix for VOICE_AGENT_OFFLINE for bot ${log.botId}`);
        // Simulate restarting the voice agent service
        await new Promise(resolve => setTimeout(resolve, 3000));
        return Math.random() > 0.7; // Simulate higher chance of failure for complex fix
      }
    });
  }

  /**
   * Logs a new repair event and attempts to match it against known failure patterns.
   * @param newLog Data for the new repair log entry.
   * @returns The created RepairLog entry.
   */
  public async logRepairEvent(newLog: Omit<NewRepairLog, 'id' | 'createdAt' | 'status' | 'attemptCount'>): Promise<RepairLog> {
    const issueType = this.detectFailurePattern(newLog.description);
    const logToInsert: NewRepairLog = {
      ...newLog,
      id: `repair_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      issueType: issueType || 'UNKNOWN_ERROR',
      status: 'pending',
      attemptCount: 0,
      createdAt: new Date(),
      metadata: newLog.metadata || {}
    };

    const [insertedLog] = await db.insert(repairLogs).values(logToInsert).returning();
    logger.info(`Logged repair event: ${insertedLog.id} for bot ${insertedLog.botId}, type: ${insertedLog.issueType}`);
    return insertedLog;
  }

  /**
   * Detects a failure pattern based on the error description.
   * @param description The error description.
   * @returns The detected FailurePattern or 'UNKNOWN_ERROR'.
   */
  private detectFailurePattern(description: string): FailurePattern | 'UNKNOWN_ERROR' {
    const lowerDescription = description.toLowerCase();
    for (const [pattern, def] of this.failurePatterns.entries()) {
      if (def.regex && def.regex.test(lowerDescription)) {
        return pattern;
      }
      if (def.keywords && def.keywords.some(keyword => lowerDescription.includes(keyword))) {
        return pattern;
      }
    }
    return 'UNKNOWN_ERROR';
  }

  /**
   * Retrieves pending repair logs for a given bot or organization.
   * @param botId Optional bot ID.
   * @param organizationId Optional organization ID.
   * @returns A list of pending RepairLog entries.
   */
  public async getPendingRepairLogs(botId?: string, organizationId?: string): Promise<RepairLog[]> {
    const conditions = [eq(repairLogs.status, 'pending')];
    if (botId) {
      conditions.push(eq(repairLogs.botId, botId));
    }
    if (organizationId) {
      conditions.push(eq(repairLogs.organizationId, organizationId));
    }
    return db.select().from(repairLogs).where(and(...conditions));
  }

  /**
   * Attempts to apply a fix for a given repair log.
   * @param repairLogId The ID of the repair log.
   * @returns True if the fix was successful, false otherwise.
   */
  public async applyFix(repairLogId: string): Promise<{ success: boolean; message?: string; }> {
    const [log] = await db.select().from(repairLogs).where(eq(repairLogs.id, repairLogId));
    if (!log) {
      return { success: false, message: 'Repair log not found.' };
    }

    const patternDef = this.failurePatterns.get(log.issueType as FailurePattern);
    if (!patternDef || !patternDef.autoFix) {
      return { success: false, message: `No automatic fix available for issue type: ${log.issueType}` };
    }

    await db.update(repairLogs)
      .set({ attemptCount: log.attemptCount + 1, lastAttemptAt: new Date() })
      .where(eq(repairLogs.id, repairLogId));

    try {
      const fixSuccessful = await patternDef.autoFix(log);
      if (fixSuccessful) {
        await db.update(repairLogs)
          .set({ status: 'resolved', resolvedAt: new Date() })
          .where(eq(repairLogs.id, repairLogId));
        logger.info(`Auto-fix successful for repair log ${repairLogId}`);
        return { success: true, message: 'Fix applied successfully.' };
      } else {
        logger.warn(`Auto-fix failed for repair log ${repairLogId}`);
        return { success: false, message: 'Automatic fix failed. Please try manual intervention.' };
      }
    } catch (error) {
      logger.error(`Error during auto-fix for repair log ${repairLogId}:`, error);
      await db.update(repairLogs)
        .set({ status: 'failed' })
        .where(eq(repairLogs.id, repairLogId));
      return { success: false, message: `An error occurred during the fix: ${(error as Error).message}` };
    }
  }

  /**
   * Marks a repair log as resolved manually.
   * @param repairLogId The ID of the repair log.
   */
  public async markAsResolved(repairLogId: string): Promise<void> {
    await db.update(repairLogs)
      .set({ status: 'resolved', resolvedAt: new Date() })
      .where(eq(repairLogs.id, repairLogId));
    logger.info(`Repair log ${repairLogId} marked as resolved manually.`);
  }

  /**
   * Generates a recovery prompt for a given repair log.
   * @param log The repair log entry.
   * @returns A RecoveryPrompt object.
   */
  public getRecoveryPrompt(log: RepairLog): RecoveryPrompt | null {
    const patternDef = this.failurePatterns.get(log.issueType as FailurePattern);
    if (patternDef && patternDef.prompt) {
      return patternDef.prompt(log);
    }
    return null;
  }

  /**
   * Retrieves the success rate for a given fix action or overall.
   * @param fixAction Optional fix action to filter by.
   * @returns The success rate as a percentage (0-100).
   */
  public async getFixSuccessRate(fixAction?: FixAction): Promise<number> {
    let totalAttempts = 0;
    let successfulFixes = 0;

    if (fixAction) {
      const attempts = await db.select().from(repairLogs)
        .where(and(eq(repairLogs.suggestedFix, fixAction), eq(repairLogs.attemptCount, 1))); // Count initial attempts
      totalAttempts = attempts.length;
      successfulFixes = attempts.filter(log => log.status === 'resolved').length;
    } else {
      const allLogs = await db.select().from(repairLogs);
      totalAttempts = allLogs.filter(log => log.attemptCount > 0).length;
      successfulFixes = allLogs.filter(log => log.status === 'resolved' && log.attemptCount > 0).length;
    }

    return totalAttempts > 0 ? (successfulFixes / totalAttempts) * 100 : 0;
  }

  /**
   * Performs an undo action for a previously applied fix.
   * This is a placeholder and would require a more robust state management/undo stack implementation.
   * @param repairLogId The ID of the repair log whose fix needs to be undone.
   * @returns True if undo was successful, false otherwise.
   */
  public async undoFix(repairLogId: string): Promise<{ success: boolean; message?: string; }> {
    const [log] = await db.select().from(repairLogs).where(eq(repairLogs.id, repairLogId));
    if (!log) {
      return { success: false, message: 'Repair log not found.' };
    }

    const patternDef = this.failurePatterns.get(log.issueType as FailurePattern);
    if (!patternDef || !patternDef.undo) {
      return { success: false, message: `No undo function available for issue type: ${log.issueType}` };
    }

    try {
      const undoSuccessful = await patternDef.undo(log);
      if (undoSuccessful) {
        // Potentially revert status or create a new log entry indicating undo
        // For simplicity, we'll just log success here.
        logger.info(`Undo successful for repair log ${repairLogId}`);
        return { success: true, message: 'Undo applied successfully.' };
      } else {
        logger.warn(`Undo failed for repair log ${repairLogId}`);
        return { success: false, message: 'Undo operation failed.' };
      }
    } catch (error) {
      logger.error(`Error during undo for repair log ${repairLogId}:`, error);
      return { success: false, message: `An error occurred during undo: ${(error as Error).message}` };
    }
  }
}

export const errorRecoveryService = new ErrorRecoveryService();

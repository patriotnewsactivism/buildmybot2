import { and, eq, isNull, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { botTemplates, bots, type Bot, type InsertBot, botVersions, type BotVersion, type InsertBotVersion } from '../../shared/schema';
import { db } from '../db';
import { AuditService } from './AuditService';
import { logger } from '../utils/logger';
import * as Sentry from '@sentry/node';
import { BotDeploymentStatus } from '../../shared/types';
import { notFoundError, databaseError, authorizationError, validationError } from '../utils/errorHandler';
import { z } from 'zod';

// Zod schema for validating bot configuration
const botConfigSchema = z.object({
  systemPrompt: z.string().min(100, 'System prompt must be at least 100 characters long.'),
  knowledgeSources: z.array(z.object({
    id: z.string(),
    type: z.enum(['website', 'pdf', 'text']),
    content: z.string().min(1, 'Knowledge source content cannot be empty.'),
  })).max(5, 'A bot can have a maximum of 5 knowledge sources.').optional(),
  voiceConfig: z.object({
    enabled: z.boolean(),
    apiKey: z.string().regex(/^sk-[a-zA-Z0-9]{32,}$/, 'Invalid API Key format. Must start with "sk-" followed by alphanumeric characters.').optional(), // Example for a generic API key format
    voiceId: z.string().min(1, 'Voice ID is required when voice is enabled.').optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(1).optional(),
    maxTokens: z.number().min(1).optional(),
  }).partial().refine(data => {
    if (data.enabled) {
      return data.apiKey && data.voiceId; // apiKey and voiceId are required if voice is enabled
    }
    return true;
  }, { message: 'API Key and Voice ID are required when voice is enabled.', path: ['voiceConfig'] }).optional(),
  // Add other bot configuration fields as needed
  model: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().min(1).optional(),
  // Add any other top-level config properties here
}).partial(); // Allow partial updates

export class BotService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  async createBot(
    botData: Partial<InsertBot>,
    userId: string,
    organizationId?: string,
  ): Promise<Bot> {
    try {
      // Validate bot configuration before creation
      if (botData.configJson) {
        await this.validateBotConfig(botData.configJson);
      }

      const newBot = await db
        .insert(bots)
        .values({
          id: uuidv4(),
          ...botData,
          userId,
          organizationId,
          createdAt: new Date(),
        } as InsertBot)
        .returning();

      await this.auditService.log({
        userId,
        organizationId,
        action: 'bot.create',
        metadata: { botId: newBot[0].id, botName: newBot[0].name },
      });

      // Create initial version for the new bot
      await this.createBotVersion(
        newBot[0].id,
        newBot[0].configJson || {},
        userId,
        organizationId,
        'Initial Version'
      );

      return newBot[0];
    } catch (error) {
      logger.error('Error creating bot:', error);
      Sentry.captureException(error);
      if (error instanceof z.ZodError) {
        throw validationError('Bot configuration validation failed: ' + error.errors.map(e => e.message).join(', '));
      }
      throw databaseError('Failed to create bot');
    }
  }

  async getBotById(botId: string, organizationId?: string): Promise<Bot | undefined> {
    try {
      const condition = organizationId
        ? and(eq(bots.id, botId), eq(bots.organizationId, organizationId), isNull(bots.deletedAt))
        : and(eq(bots.id, botId), isNull(bots.deletedAt));

      const bot = await db.query.bots.findFirst({
        where: condition,
      });
      return bot;
    } catch (error) {
      logger.error(`Error getting bot by ID ${botId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve bot');
    }
  }

  async getBotsByUserId(userId: string): Promise<Bot[]> {
    try {
      const userBots = await db.query.bots.findMany({
        where: and(eq(bots.userId, userId), isNull(bots.deletedAt)),
      });
      return userBots;
    } catch (error) {
      logger.error(`Error getting bots for user ${userId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve user bots');
    }
  }

  async getBotsByOrganizationId(organizationId: string): Promise<Bot[]> {
    try {
      const orgBots = await db.query.bots.findMany({
        where: and(eq(bots.organizationId, organizationId), isNull(bots.deletedAt)),
      });
      return orgBots;
    } catch (error) {
      logger.error(`Error getting bots for organization ${organizationId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve organization bots');
    }
  }

  async updateBot(
    botId: string,
    botData: Partial<InsertBot>,
    userId: string,
    organizationId?: string,
    versionMessage?: string
  ): Promise<Bot> {
    return db.transaction(async (tx) => {
      try {
        const condition = organizationId
          ? and(eq(bots.id, botId), eq(bots.organizationId, organizationId), isNull(bots.deletedAt))
          : and(eq(bots.id, botId), isNull(bots.deletedAt));

        const existingBot = await tx.query.bots.findFirst({
          where: condition,
        });

        if (!existingBot) {
          throw notFoundError('Bot not found or not authorized to update');
        }

        // Merge existing config with new data for validation
        const mergedConfig = { ...existingBot.configJson, ...botData.configJson };
        if (botData.configJson) {
          await this.validateBotConfig(mergedConfig);
        }

        // Create a new version before updating the bot
        await this.createBotVersion(
          existingBot.id,
          existingBot.configJson || {},
          userId,
          organizationId,
          versionMessage || `Update by ${userId}`,
          tx
        );

        const updatedBot = await tx
          .update(bots)
          .set({ ...botData, updatedAt: new Date() })
          .where(condition)
          .returning();

        if (!updatedBot.length) {
          throw databaseError('Failed to update bot after versioning');
        }

        await this.auditService.log({
          userId,
          organizationId,
          action: 'bot.update',
          metadata: { botId: updatedBot[0].id, botName: updatedBot[0].name, updatedFields: Object.keys(botData) },
        });

        return updatedBot[0];
      } catch (error) {
        logger.error(`Error updating bot ${botId}:`, error);
        Sentry.captureException(error);
        if (error instanceof z.ZodError) {
          throw validationError('Bot configuration validation failed: ' + error.errors.map(e => e.message).join(', '));
        }
        throw error; // Re-throw to ensure transaction rollback
      }
    });
  }

  async deleteBot(botId: string, userId: string, organizationId?: string): Promise<void> {
    return db.transaction(async (tx) => {
      try {
        const condition = organizationId
          ? and(eq(bots.id, botId), eq(bots.organizationId, organizationId), isNull(bots.deletedAt))
          : and(eq(bots.id, botId), isNull(bots.deletedAt));

        const existingBot = await tx.query.bots.findFirst({
          where: condition,
        });

        if (!existingBot) {
          throw notFoundError('Bot not found or not authorized to delete');
        }

        // Soft delete the bot
        const deletedBot = await tx
          .update(bots)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(condition)
          .returning();

        if (!deletedBot.length) {
          throw databaseError('Failed to soft delete bot');
        }

        await this.auditService.log({
          userId,
          organizationId,
          action: 'bot.delete',
          metadata: { botId: deletedBot[0].id, botName: deletedBot[0].name },
        });
      } catch (error) {
        logger.error(`Error deleting bot ${botId}:`, error);
        Sentry.captureException(error);
        throw error; // Re-throw to ensure transaction rollback
      }
    });
  }

  async getBotTemplates(): Promise<Bot[]> {
    try {
      const templates = await db.query.botTemplates.findMany();
      return templates as Bot[]; // Assuming botTemplates schema is compatible with Bot
    } catch (error) {
      logger.error('Error getting bot templates:', error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve bot templates');
    }
  }

  async deployBot(
    botId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Bot> {
    try {
      // Retrieve the bot to get its current configuration for validation
      const botToDeploy = await this.getBotById(botId, organizationId);
      if (!botToDeploy) {
        throw notFoundError('Bot not found for deployment');
      }

      // Perform final validation check on the bot's configuration before deployment
      await this.validateBotConfig(botToDeploy.configJson || {});

      logger.info(`Attempting to deploy bot ${botId} for user ${userId}`);

      // Perform environment validation (example: check for required API keys, integrations)
      const isValidEnvironment = await this.validateDeploymentEnvironment(organizationId);
      if (!isValidEnvironment) {
        throw new Error('Deployment environment validation failed. Please check your settings.');
      }

      // Update bot status to deploying
      let updatedBot = await this.updateBot(
        botId,
        { deploymentStatus: BotDeploymentStatus.DEPLOYING },
        userId,
        organizationId,
        'Deployment initiated'
      );

      // Simulate async deployment task
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds delay

      // Simulate success or failure
      const deploymentSuccessful = Math.random() > 0.1; // 90% success rate

      if (deploymentSuccessful) {
        updatedBot = await this.updateBot(
          botId,
          { deploymentStatus: BotDeploymentStatus.DEPLOYED, lastDeployedAt: new Date() },
          userId,
          organizationId,
          'Deployment successful'
        );
        logger.info(`Bot ${botId} deployed successfully.`);
        await this.auditService.log({
          userId,
          organizationId,
          action: 'bot.deploy.success',
          metadata: { botId: botId, status: BotDeploymentStatus.DEPLOYED },
        });
      } else {
        updatedBot = await this.updateBot(
          botId,
          { deploymentStatus: BotDeploymentStatus.FAILED, lastDeploymentError: 'Simulated deployment failure' },
          userId,
          organizationId,
          'Deployment failed'
        );
        logger.warn(`Bot ${botId} deployment failed.`);
        await this.auditService.log({
          userId,
          organizationId,
          action: 'bot.deploy.failure',
          metadata: { botId: botId, status: BotDeploymentStatus.FAILED, error: 'Simulated deployment failure' },
        });
        Sentry.captureMessage(`Bot deployment failed for botId: ${botId}`);
        throw new Error('Bot deployment failed. Please check logs for details.');
      }

      return updatedBot;
    } catch (error) {
      logger.error(`Error deploying bot ${botId}:`, error);
      Sentry.captureException(error);
      // Ensure status is updated even on unexpected errors
      await this.updateBot(
        botId,
        { deploymentStatus: BotDeploymentStatus.FAILED, lastDeploymentError: (error as Error).message || 'Unknown deployment error' },
        userId,
        organizationId,
        'Deployment failed due to error'
      ).catch(updateError => {
        logger.error(`Failed to update bot status to FAILED after deployment error for bot ${botId}:`, updateError);
        Sentry.captureException(updateError);
      });
      throw error; // Re-throw the original error after logging and status update
    }
  }

  async validateDeploymentEnvironment(organizationId?: string): Promise<boolean> {
    // This is a placeholder for actual environment validation logic.
    // In a real scenario, this would check for:
    // - Required API keys (e.g., OpenAI, Twilio, etc.)
    // - Necessary integrations configured
    // - Sufficient credits/plan level
    // - Valid bot configuration (e.g., knowledge base exists, tools are configured correctly)
    logger.info(`Validating deployment environment for organization ${organizationId}`);

    // Example: Check if a critical API key is set (e.g., for a specific integration)
    // const requiredApiKey = await this.integrationService.getApiKey(organizationId, 'OpenAI');
    // if (!requiredApiKey) {
    //   logger.warn(`OpenAI API key missing for organization ${organizationId}. Deployment environment invalid.`);
    //   return false;
    // }

    // For now, always return true for simulation purposes
    return true;
  }

  async getDeploymentStatus(botId: string, organizationId?: string): Promise<BotDeploymentStatus> {
    try {
      const bot = await this.getBotById(botId, organizationId);
      if (!bot) {
        throw notFoundError('Bot not found');
      }
      return bot.deploymentStatus || BotDeploymentStatus.NOT_DEPLOYED;
    } catch (error) {
      logger.error(`Error getting deployment status for bot ${botId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve deployment status');
    }
  }

  async getRealtimeDeploymentStatus(botId: string, organizationId?: string): Promise<{
    status: 'loading' | 'deployed' | 'error';
    lastChecked: string;
    errors: { code: string; message: string; fixAction?: string }[];
  }> {
    try {
      const bot = await this.getBotById(botId, organizationId);
      if (!bot) {
        throw notFoundError('Bot not found');
      }

      let status: 'loading' | 'deployed' | 'error' = 'loading';
      const errors: { code: string; message: string; fixAction?: string }[] = [];

      // Perform real-time validation here as well for deployment status checks
      try {
        botConfigSchema.parse(bot.configJson || {});
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          validationError.errors.forEach(err => {
            errors.push({
              code: `CONFIG_VALIDATION_ERROR_${err.path.join('_').toUpperCase()}`,
              message: err.message,
              fixAction: `Review and correct the '${err.path.join('.')}' setting in your bot configuration.`
            });
          });
        }
      }

      switch (bot.deploymentStatus) {
        case BotDeploymentStatus.DEPLOYING:
          status = 'loading';
          break;
        case BotDeploymentStatus.DEPLOYED:
          status = 'deployed';
          break;
        case BotDeploymentStatus.FAILED:
          status = 'error';
          // Add existing simulated errors, potentially filtered by validation errors
          if (bot.lastDeploymentError?.includes('knowledge base')) {
            errors.push({
              code: 'KB_PROCESSING_FAILED',
              message: 'Knowledge base processing failed. Ensure all documents are valid and accessible.',
              fixAction: 'Review Knowledge Base settings and re-upload problematic files.'
            });
          } else if (bot.lastDeploymentError?.includes('embed script')) {
            errors.push({
              code: 'EMBED_SCRIPT_CONFLICT',
              message: 'Embed script conflict detected. Check for multiple bot scripts or incompatible third-party scripts.',
              fixAction: 'Verify your website embed code and remove any conflicting scripts.'
            });
          } else if (errors.length === 0) { // Only add general error if no specific validation errors were found
            errors.push({
              code: 'DEPLOYMENT_GENERAL_ERROR',
              message: bot.lastDeploymentError || 'An unknown error occurred during deployment.',
              fixAction: 'Check bot configuration and try deploying again. Contact support if the issue persists.'
            });
          }
          break;
        case BotDeploymentStatus.NOT_DEPLOYED:
        default:
          status = 'loading'; // Or 'not_deployed' if we want a distinct initial state
          break;
      }

      // If there are validation errors, force status to 'error' if not already failed
      if (errors.length > 0 && status !== 'error') {
        status = 'error';
      }

      return {
        status,
        lastChecked: new Date().toISOString(),
        errors,
      };
    } catch (error) {
      logger.error(`Error getting real-time deployment status for bot ${botId}:`, error);
      Sentry.captureException(error);
      // Return an error status if the service call itself fails
      return {
        status: 'error',
        lastChecked: new Date().toISOString(),
        errors: [{
          code: 'SERVICE_ERROR',
          message: (error as Error).message || 'Failed to retrieve real-time status due to a server error.',
          fixAction: 'Please try again later or contact support.'
        }]
      };
    }
  }

  async recordDeploymentAttempt(
    botId: string,
    userId: string,
    organizationId: string,
    status: BotDeploymentStatus,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.auditService.log({
        userId,
        organizationId,
        action: `bot.deploy.${status.toLowerCase()}`,
        metadata: {
          botId,
          status,
          errorMessage,
        },
      });
    } catch (error) {
      logger.error(`Error recording deployment attempt for bot ${botId}:`, error);
      Sentry.captureException(error);
    }
  }

  async getDeploymentHistory(botId: string, organizationId?: string): Promise<any[]> {
    try {
      // This would typically involve querying an audit log or a dedicated deployment history table
      // For now, we'll simulate by fetching relevant audit logs
      const deploymentLogs = await this.auditService.getLogs({
        organizationId,
        actionPrefix: 'bot.deploy',
        metadata: { botId: botId },
      });

      return deploymentLogs.map(log => ({
        timestamp: log.createdAt,
        status: log.action.includes('success') ? BotDeploymentStatus.DEPLOYED : BotDeploymentStatus.FAILED,
        message: log.metadata?.error || 'Deployment event',
      }));
    } catch (error) {
      logger.error(`Error getting deployment history for bot ${botId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve deployment history');
    }
  }

  /**
   * Creates a new version of a bot's configuration.
   * @param botId The ID of the bot.
   * @param configJson The bot's configuration JSON.
   * @param createdBy The user ID who created this version.
   * @param organizationId The organization ID the bot belongs to.d
   * @param message A descriptive message for the version.
   * @param tx Drizzle transaction object (optional, for chaining operations).
   * @returns The created bot version.
   */
  async createBotVersion(
    botId: string,
    configJson: object,
    createdBy: string,
    organizationId?: string,
    message: string = 'Automatic save',
    tx: typeof db = db
  ): Promise<BotVersion> {
    try {
      const latestVersion = await tx.query.botVersions.findFirst({
        where: eq(botVersions.botId, botId),
        orderBy: [desc(botVersions.versionNumber)],
      });

      const newVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

      const newBotVersion = await tx
        .insert(botVersions)
        .values({
          id: uuidv4(),
          botId,
          versionNumber: newVersionNumber,
          configJson,
          createdAt: new Date(),
          createdBy,
          organizationId,
          message,
        } as InsertBotVersion)
        .returning();

      await this.auditService.log({
        userId: createdBy,
        organizationId,
        action: 'bot.version.create',
        metadata: { botId, versionId: newBotVersion[0].id, versionNumber: newVersionNumber, message },
      });

      return newBotVersion[0];
    } catch (error) {
      logger.error(`Error creating bot version for bot ${botId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to create bot version');
    }
  }

  /**
   * Retrieves all versions for a specific bot.
   * @param botId The ID of the bot.
   * @param organizationId The organization ID the bot belongs to.
   * @returns An array of bot versions, ordered by version number descending.
   */
  async getBotVersions(botId: string, organizationId?: string): Promise<BotVersion[]> {
    try {
      const condition = organizationId
        ? and(eq(botVersions.botId, botId), eq(botVersions.organizationId, organizationId))
        : eq(botVersions.botId, botId);

      const versions = await db.query.botVersions.findMany({
        where: condition,
        orderBy: [desc(botVersions.versionNumber)],
      });
      return versions;
    } catch (error) {
      logger.error(`Error getting bot versions for bot ${botId}:`, error);
      Sentry.captureException(error);
      throw databaseError('Failed to retrieve bot versions');
    }
  }

  /**
   * Rolls back a bot to a specific version.
   * @param botId The ID of the bot to rollback.f
   * @param versionId The ID of the version to rollback to.
   * @param userId The user ID performing the rollback.
   * @param organizationId The organization ID the bot belongs to.
   * @returns The updated bot after rollback.
   */
  async rollbackBotVersion(
    botId: string,
    versionId: string,
    userId: string,
    organizationId?: string,
  ): Promise<Bot> {
    return db.transaction(async (tx) => {
      try {
        const botCondition = organizationId
          ? and(eq(bots.id, botId), eq(bots.organizationId, organizationId), isNull(bots.deletedAt))
          : and(eq(bots.id, botId), isNull(bots.deletedAt));

        const botToRollback = await tx.query.bots.findFirst({
          where: botCondition,
        });

        if (!botToRollback) {
          throw notFoundError('Bot not found or not authorized to rollback');
        }

        const versionCondition = organizationId
          ? and(eq(botVersions.id, versionId), eq(botVersions.botId, botId), eq(botVersions.organizationId, organizationId))
          : and(eq(botVersions.id, versionId), eq(botVersions.botId, botId));

        const targetVersion = await tx.query.botVersions.findFirst({
          where: versionCondition,
        });

        if (!targetVersion) {
          throw notFoundError('Bot version not found or does not belong to this bot/organization');
        }

        // Validate the target version's config before rolling back
        await this.validateBotConfig(targetVersion.configJson || {});

        // Create a new version of the current bot state before rolling back
        // This allows rolling back the rollback if needed
        await this.createBotVersion(
          botToRollback.id,
          botToRollback.configJson || {},
          userId,
          organizationId,
          `Before rollback to version ${targetVersion.versionNumber}`,
          tx
        );

        // Update the bot with the config from the target version
        const updatedBot = await tx
          .update(bots)
          .set({
            configJson: targetVersion.configJson,
            updatedAt: new Date(),
            // Optionally, you might want to reset deployment status or other fields
            // deploymentStatus: BotDeploymentStatus.NOT_DEPLOYED, // Example
          })
          .where(botCondition)
          .returning();

        if (!updatedBot.length) {
          throw databaseError('Failed to rollback bot configuration');
        }

        // Create a new version representing the rollback itself
        await this.createBotVersion(
          updatedBot[0].id,
          updatedBot[0].configJson || {},
          userId,
          organizationId,
          `Rolled back to version ${targetVersion.versionNumber}`,
          tx
        );

        await this.auditService.log({
          userId,
          organizationId,
          action: 'bot.rollback',
          metadata: { botId, versionId, versionNumber: targetVersion.versionNumber },
        });

        return updatedBot[0];
      } catch (error) {
        logger.error(`Error rolling back bot ${botId} to version ${versionId}:`, error);
        Sentry.captureException(error);
        if (error instanceof z.ZodError) {
          throw validationError('Bot configuration validation failed during rollback: ' + error.errors.map(e => e.message).join(', '));
        }
        throw error; // Re-throw to ensure transaction rollback
      }
    });
  }

  /**
   * Validates a bot's configuration against the defined Zod schema.
   * @param config The bot's configuration object.
   * @throws {z.ZodError} if validation fails.
   */
  async validateBotConfig(config: object): Promise<void> {
    try {
      botConfigSchema.parse(config);
    } catch (error) {
      logger.warn('Bot configuration validation failed:', error);
      throw error; // Re-throw ZodError for upstream handling
    }
  }
}

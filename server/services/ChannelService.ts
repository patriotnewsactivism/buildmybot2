import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { bots } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { AuditService } from './AuditService';

export type ChannelType =
  | 'website'
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'sms'
  | 'slack'
  | 'discord';

export interface ChannelConfig {
  enabled: boolean;
  credentials?: Record<string, string>;
  webhookUrl?: string;
  settings?: Record<string, unknown>;
  embedCode?: string;
}

export interface WhatsAppConfig extends ChannelConfig {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
}

export interface MessengerConfig extends ChannelConfig {
  pageId: string;
  pageAccessToken: string;
}

export interface SMSConfig extends ChannelConfig {
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
}

export interface SlackConfig extends ChannelConfig {
  botToken: string;
  appId: string;
  signingSecret: string;
}

export interface DiscordConfig extends ChannelConfig {
  botToken: string;
  applicationId: string;
  publicKey: string;
}

export interface Deployment {
  id: string;
  botId: string;
  channel: ChannelType;
  status: 'pending' | 'active' | 'failed' | 'disabled';
  webhookUrl?: string;
  config: ChannelConfig;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

export interface ChannelStatus {
  channel: ChannelType;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  lastMessage?: Date;
  messageCount?: number;
}

export class ChannelService {
  private auditService: AuditService;

  constructor() {
    this.auditService = new AuditService();
  }

  private canAccessBot(
    bot: any,
    organizationId?: string,
    userId?: string,
  ): boolean {
    if (bot.organizationId) {
      if (!organizationId) {
        return false;
      }
      return bot.organizationId === organizationId;
    }
    if (bot.userId) {
      if (!userId) {
        return false;
      }
      return bot.userId === userId;
    }
    return false;
  }

  async getAvailableChannels(): Promise<
    {
      channel: ChannelType;
      name: string;
      description: string;
      requiresSetup: boolean;
    }[]
  > {
    return [
      {
        channel: 'website',
        name: 'Website Widget',
        description: 'Embed a chat widget on your website',
        requiresSetup: false,
      },
      {
        channel: 'whatsapp',
        name: 'WhatsApp Business',
        description: 'Connect to WhatsApp Business API for customer messaging',
        requiresSetup: true,
      },
      {
        channel: 'messenger',
        name: 'Facebook Messenger',
        description: 'Respond to messages on your Facebook Page',
        requiresSetup: true,
      },
      {
        channel: 'instagram',
        name: 'Instagram DM',
        description: 'Handle Instagram Direct Messages automatically',
        requiresSetup: true,
      },
      {
        channel: 'sms',
        name: 'SMS (Twilio)',
        description: 'Send and receive SMS messages via Twilio',
        requiresSetup: true,
      },
      {
        channel: 'slack',
        name: 'Slack',
        description: 'Add your bot to Slack workspaces',
        requiresSetup: true,
      },
      {
        channel: 'discord',
        name: 'Discord',
        description: 'Add your bot to Discord servers',
        requiresSetup: true,
      },
    ];
  }

  async deployToChannel(
    botId: string,
    channel: ChannelType,
    config: ChannelConfig,
    userId: string,
    organizationId: string,
  ): Promise<Deployment> {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot) {
      throw new Error('Bot not found');
    }

    if (!this.canAccessBot(bot, organizationId, userId)) {
      throw new Error('Access denied: Not authorized to deploy this bot');
    }

    let deployment: Deployment;

    switch (channel) {
      case 'website':
        deployment = await this.deployToWebsite(botId, config);
        break;
      case 'whatsapp':
        deployment = await this.deployToWhatsApp(
          botId,
          config as WhatsAppConfig,
        );
        break;
      case 'messenger':
        deployment = await this.deployToMessenger(
          botId,
          config as MessengerConfig,
        );
        break;
      case 'instagram':
        deployment = await this.deployToInstagram(
          botId,
          config as MessengerConfig,
        );
        break;
      case 'sms':
        deployment = await this.deployToSMS(botId, config as SMSConfig);
        break;
      case 'slack':
        deployment = await this.deployToSlack(botId, config as SlackConfig);
        break;
      case 'discord':
        deployment = await this.deployToDiscord(botId, config as DiscordConfig);
        break;
      default:
        throw new Error(`Unsupported channel: ${channel}`);
    }

    await this.auditService.log({
      userId,
      organizationId,
      action: 'channel.deployed',
      resourceType: 'bot',
      resourceId: botId,
      newValues: { channel, deploymentId: deployment.id },
    });

    return deployment;
  }

  private async deployToWebsite(
    botId: string,
    config: ChannelConfig,
  ): Promise<Deployment> {
    const embedCode = this.generateEmbedCode(botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'website',
      status: 'active',
      config: {
        ...config,
        embedCode,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async deployToWhatsApp(
    botId: string,
    config: WhatsAppConfig,
  ): Promise<Deployment> {
    const webhookUrl = this.generateWebhookUrl('whatsapp', botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'whatsapp',
      status: 'pending',
      webhookUrl,
      config: {
        ...config,
        webhookUrl,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async deployToMessenger(
    botId: string,
    config: MessengerConfig,
  ): Promise<Deployment> {
    const webhookUrl = this.generateWebhookUrl('messenger', botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'messenger',
      status: 'pending',
      webhookUrl,
      config: {
        ...config,
        webhookUrl,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async deployToInstagram(
    botId: string,
    config: MessengerConfig,
  ): Promise<Deployment> {
    const webhookUrl = this.generateWebhookUrl('instagram', botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'instagram',
      status: 'pending',
      webhookUrl,
      config: {
        ...config,
        webhookUrl,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async deployToSMS(
    botId: string,
    config: SMSConfig,
  ): Promise<Deployment> {
    const webhookUrl = this.generateWebhookUrl('sms', botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'sms',
      status: 'pending',
      webhookUrl,
      config: {
        ...config,
        webhookUrl,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async deployToSlack(
    botId: string,
    config: SlackConfig,
  ): Promise<Deployment> {
    const webhookUrl = this.generateWebhookUrl('slack', botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'slack',
      status: 'pending',
      webhookUrl,
      config: {
        ...config,
        webhookUrl,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async deployToDiscord(
    botId: string,
    config: DiscordConfig,
  ): Promise<Deployment> {
    const webhookUrl = this.generateWebhookUrl('discord', botId);

    return {
      id: uuidv4(),
      botId,
      channel: 'discord',
      status: 'pending',
      webhookUrl,
      config: {
        ...config,
        webhookUrl,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private generateWebhookUrl(channel: ChannelType, botId: string): string {
    const baseUrl = env.APP_BASE_URL || 'https://www.buildmybot.app';
    return `${baseUrl}/api/webhooks/${channel}/${botId}`;
  }

  private generateEmbedCode(botId: string): string {
    const baseUrl = env.APP_BASE_URL || 'https://www.buildmybot.app';
    return `<script src="${baseUrl}/widget.js" data-bot-id="${botId}"></script>`;
  }

  async getChannelStatus(
    botId: string,
    organizationId?: string,
    userId?: string,
  ): Promise<ChannelStatus[]> {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot) {
      throw new Error('Bot not found');
    }

    if (!this.canAccessBot(bot, organizationId, userId)) {
      throw new Error('Access denied: Not authorized to access this bot');
    }

    return [
      {
        channel: 'website',
        enabled: true,
        status: 'connected',
        messageCount: bot.conversationsCount || 0,
      },
      {
        channel: 'whatsapp',
        enabled: false,
        status: 'disconnected',
      },
      {
        channel: 'messenger',
        enabled: false,
        status: 'disconnected',
      },
      {
        channel: 'instagram',
        enabled: false,
        status: 'disconnected',
      },
      {
        channel: 'sms',
        enabled: false,
        status: 'disconnected',
      },
      {
        channel: 'slack',
        enabled: false,
        status: 'disconnected',
      },
      {
        channel: 'discord',
        enabled: false,
        status: 'disconnected',
      },
    ];
  }

  async disableChannel(
    botId: string,
    channel: ChannelType,
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot) {
      throw new Error('Bot not found');
    }

    if (!this.canAccessBot(bot, organizationId, userId)) {
      throw new Error(
        'Access denied: Not authorized to disable this bot channel',
      );
    }

    await this.auditService.log({
      userId,
      organizationId,
      action: 'channel.disabled',
      resourceType: 'bot',
      resourceId: botId,
      newValues: { channel },
    });
  }

  async testChannel(
    botId: string,
    channel: ChannelType,
    organizationId?: string,
    userId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const [bot] = await db.select().from(bots).where(eq(bots.id, botId));
    if (!bot) {
      return { success: false, message: 'Bot not found' };
    }

    if (!this.canAccessBot(bot, organizationId, userId)) {
      return {
        success: false,
        message: 'Access denied: Not authorized to test this bot',
      };
    }

    switch (channel) {
      case 'website':
        return { success: true, message: 'Website widget is ready' };
      case 'whatsapp':
      case 'messenger':
      case 'instagram':
      case 'sms':
      case 'slack':
      case 'discord':
        return {
          success: false,
          message: `${channel} integration requires configuration. Please set up your credentials first.`,
        };
      default:
        return { success: false, message: 'Unknown channel' };
    }
  }
}

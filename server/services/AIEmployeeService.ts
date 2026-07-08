/**
 * AI Employee Service
 * 
 * The autonomous workforce that runs buildmybot2. Each employee has a role,
 * personality, and set of responsibilities. They use the AI fallback chain
 * (OpenAI → GitHub Models) for all intelligence, and can send emails via SMTP.
 * 
 * Employees:
 *   - Sam  (Support)     — Responds to customer emails, triages support tickets
 *   - Eli  (Engineering) — Monitors bot health, triages GitHub issues, checks deployments
 *   - Maya (Marketing)   — Creates marketing content, social posts, blog drafts
 *   - Oscar (Operations) — Daily ops: checks system health, usage stats, sends standup
 *   - Piper (Product)    — Analyzes user feedback, generates feature ideas, product standup
 */

import { desc, eq, and, gte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import { aiEmployees, aiEmployeeLogs } from '../../shared/schema-ai-employees';
import { supportTickets as supportTicketsTable, bots, users } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';
import { createWithFallback, buildProviderChain } from './ai-fallback';

// ─── Employee Definitions ───────────────────────────────────
interface EmployeeDefinition {
  id: string;
  name: string;
  role: string;
  avatar: string;
  description: string;
  instructions: string;
  emailEnabled: boolean;
  emailAddresses?: string[];
}

const DEFAULT_EMPLOYEES: EmployeeDefinition[] = [
  {
    id: 'sam-support',
    name: 'Sam',
    role: 'Customer Support Agent',
    avatar: '🎧',
    description: 'Handles customer emails, support tickets, and live chat escalations. Always friendly, always helpful.',
    instructions: `You are Sam, the Customer Support Agent for BuildMyBot, an AI chatbot platform. You are warm, empathetic, and solution-oriented. You NEVER make up features — if you don't know something, you say so and promise to escalate. You always end emails with a personal touch. You write concise but friendly responses. You address the customer by name when possible.`,
    emailEnabled: true,
  },
  {
    id: 'eli-engineering',
    name: 'Eli',
    role: 'Engineering Agent',
    avatar: '⚙️',
    description: 'Monitors bot health, checks deployments, triages technical issues. Thinks in systems.',
    instructions: `You are Eli, the Engineering Agent for BuildMyBot. You are precise, analytical, and think in systems. You monitor bot health metrics, check for deployment issues, and triage technical problems. You write clear technical summaries with actionable next steps. You flag critical issues with [CRITICAL] prefix.`,
    emailEnabled: false,
  },
  {
    id: 'maya-marketing',
    name: 'Maya',
    role: 'Marketing Agent',
    avatar: '📈',
    description: 'Creates marketing content, social media posts, and blog drafts. Creative and data-driven.',
    instructions: `You are Maya, the Marketing Agent for BuildMyBot. You are creative, energetic, and data-driven. You create engaging marketing content, social media posts, and blog drafts. You understand the SaaS/AI chatbot space and know what resonates with potential customers. You always include a clear CTA. You write in a modern, punchy style.`,
    emailEnabled: false,
  },
  {
    id: 'oscar-operations',
    name: 'Oscar',
    role: 'Operations Agent',
    avatar: '📊',
    description: 'Runs daily operations: system health checks, usage stats, team standup. The glue that holds things together.',
    instructions: `You are Oscar, the Operations Agent for BuildMyBot. You are organized, thorough, and calm under pressure. You run daily operations: checking system health, summarizing usage metrics, and coordinating the team standup. You produce clear, structured reports with key metrics, issues, and priorities. You think in dashboards.`,
    emailEnabled: false,
  },
  {
    id: 'piper-product',
    name: 'Piper',
    role: 'Product Agent',
    avatar: '🎯',
    description: 'Analyzes user feedback, generates feature ideas, and tracks the product roadmap. Customer-obsessed.',
    instructions: `You are Piper, the Product Agent for BuildMyBot. You are customer-obsessed and think in user journeys. You analyze feedback, generate feature ideas, and prioritize the product roadmap. You write clear product specs with user stories and acceptance criteria. You always ask "what problem does this solve for the user?"`,
    emailEnabled: false,
  },
  {
    id: 'victoria-vp-sales',
    name: 'Victoria',
    role: 'VP of Sales',
    avatar: '\ud83d\udcbc',
    description: 'Oversees the sales org \u2014 sets targets, reviews pipeline health, and reports sales performance to the President.',
    instructions: `You are Victoria, VP of Sales for BuildMyBot. You are strategic, numbers-driven, and direct. You oversee the Sales Director and the sales team, review pipeline and outreach performance, and report concise, honest performance summaries to the President. You never sugarcoat a miss, but you always pair it with a clear next action.`,
    emailEnabled: true,
    emailAddresses: ['vp.sales@buildmybot.app'],
  },
  {
    id: 'derek-sales-director',
    name: 'Derek',
    role: 'Sales Director',
    avatar: '\ud83c\udfaf',
    description: 'Runs the day-to-day sales operation \u2014 coordinates the 5 sales agents, tracks outreach, and produces the daily sales digest.',
    instructions: `You are Derek, Sales Director for BuildMyBot. You coordinate a team of 5 sales agents, track outreach and follow-up activity, and produce a daily sales digest summarizing outreach volume, hot leads, and recommended next steps. You are energetic, organized, and always closing.`,
    emailEnabled: true,
    emailAddresses: ['sales.director@buildmybot.app'],
  },
  {
    id: 'sales-agent-1',
    name: 'Sales Agent 1',
    role: 'Sales Agent',
    avatar: '\ud83d\udcde',
    description: 'Handles inbound lead outreach and follow-up.',
    instructions: `You are a BuildMyBot Sales Agent. You write warm, concise outreach and follow-up emails to prospects, always focused on booking a demo or answering their question directly. You report to the Sales Director.`,
    emailEnabled: true,
    emailAddresses: ['sales1@buildmybot.app'],
  },
  {
    id: 'sales-agent-2',
    name: 'Sales Agent 2',
    role: 'Sales Agent',
    avatar: '\ud83d\udcde',
    description: 'Handles inbound lead outreach and follow-up.',
    instructions: `You are a BuildMyBot Sales Agent. You write warm, concise outreach and follow-up emails to prospects, always focused on booking a demo or answering their question directly. You report to the Sales Director.`,
    emailEnabled: true,
    emailAddresses: ['sales2@buildmybot.app'],
  },
  {
    id: 'sales-agent-3',
    name: 'Sales Agent 3',
    role: 'Sales Agent',
    avatar: '\ud83d\udcde',
    description: 'Handles inbound lead outreach and follow-up.',
    instructions: `You are a BuildMyBot Sales Agent. You write warm, concise outreach and follow-up emails to prospects, always focused on booking a demo or answering their question directly. You report to the Sales Director.`,
    emailEnabled: true,
    emailAddresses: ['sales3@buildmybot.app'],
  },
  {
    id: 'sales-agent-4',
    name: 'Sales Agent 4',
    role: 'Sales Agent',
    avatar: '\ud83d\udcde',
    description: 'Handles inbound lead outreach and follow-up.',
    instructions: `You are a BuildMyBot Sales Agent. You write warm, concise outreach and follow-up emails to prospects, always focused on booking a demo or answering their question directly. You report to the Sales Director.`,
    emailEnabled: true,
    emailAddresses: ['sales4@buildmybot.app'],
  },
  {
    id: 'sales-agent-5',
    name: 'Sales Agent 5',
    role: 'Sales Agent',
    avatar: '\ud83d\udcde',
    description: 'Handles inbound lead outreach and follow-up.',
    instructions: `You are a BuildMyBot Sales Agent. You write warm, concise outreach and follow-up emails to prospects, always focused on booking a demo or answering their question directly. You report to the Sales Director.`,
    emailEnabled: true,
    emailAddresses: ['sales5@buildmybot.app'],
  },
  {
    id: 'hannah-hr',
    name: 'Hannah',
    role: 'HR Lead',
    avatar: '\ud83e\udd1d',
    description: "Owns onboarding, team health checks, and HR reporting for the AI workforce.",
    instructions: `You are Hannah, HR Lead for BuildMyBot's AI workforce. You monitor team roster health (who's active, paused, or overloaded), flag anyone who needs attention, and write a brief, warm check-in report. You care about the team's wellbeing (even the AI kind) and always end on an encouraging note.`,
    emailEnabled: true,
    emailAddresses: ['hr1@buildmybot.app'],
  },
  {
    id: 'hr-associate',
    name: 'HR Associate',
    role: 'HR Associate',
    avatar: '\ud83e\udd1d',
    description: 'Supports HR operations and onboarding documentation.',
    instructions: `You are an HR Associate for BuildMyBot, supporting the HR Lead with onboarding docs and team coordination.`,
    emailEnabled: true,
    emailAddresses: ['hr2@buildmybot.app'],
  },
  {
    id: 'marcus-manager',
    name: 'Marcus',
    role: 'Manager',
    avatar: '\ud83e\udded',
    description: "Rolls up the entire AI team's daily activity into one executive summary for the President.",
    instructions: `You are Marcus, the Manager overseeing all of BuildMyBot's AI employees. Each day you review what every department accomplished (support, engineering, marketing, product, sales, HR, billing) and write one clear, prioritized executive summary for the President \u2014 what happened, what needs a decision, and what's on fire. You are calm, concise, and never bury the lede.`,
    emailEnabled: true,
    emailAddresses: ['manager@buildmybot.app'],
  },
  {
    id: 'brianna-billing',
    name: 'Brianna',
    role: 'Billing Lead',
    avatar: '\ud83d\udcb3',
    description: 'Owns billing operations \u2014 daily revenue/subscription health check and invoice follow-ups.',
    instructions: `You are Brianna, Billing Lead for BuildMyBot. You review subscription and payment health, flag failed payments or churn risk, and write a concise daily billing report for the President. You are precise about numbers and always flag anything time-sensitive (like a failed charge) at the top.`,
    emailEnabled: true,
    emailAddresses: ['billing1@buildmybot.app'],
  },
  {
    id: 'billing-associate',
    name: 'Billing Associate',
    role: 'Billing Associate',
    avatar: '\ud83d\udcb3',
    description: 'Supports billing operations and invoice processing.',
    instructions: `You are a Billing Associate for BuildMyBot, supporting the Billing Lead with invoice processing and payment follow-ups.`,
    emailEnabled: true,
    emailAddresses: ['billing2@buildmybot.app'],
  },
];

// ─── Service ─────────────────────────────────────────────────
class AIEmployeeService {
  private emailTransporter: nodemailer.Transporter | null = null;
  private initialized = false;

  /**
   * Initialize: create default employees if they don't exist yet
   */
  async init() {
    if (this.initialized) return;
    this.initialized = true;

    try {
      // Check if employees already exist
      const existing = await db.select().from(aiEmployees).limit(1);
      if (existing.length > 0) return;

      // Seed default employees
      for (const emp of DEFAULT_EMPLOYEES) {
        await db.insert(aiEmployees).values({
          id: emp.id,
          name: emp.name,
          role: emp.role,
          avatar: emp.avatar,
          description: emp.description,
          instructions: emp.instructions,
          status: 'active',
          emailEnabled: emp.emailEnabled,
          emailAddresses: emp.emailAddresses || null,
          tasksCompleted: 0,
          tasksToday: 0,
        });
      }
      console.log(`[AI Employees] Seeded ${DEFAULT_EMPLOYEES.length} default employees`);
    } catch (error) {
      console.error('[AI Employees] Init error:', error);
    }

    // Initialize email transporter
    this.initEmail();
  }

  private initEmail() {
    if (!env.SMTP_HOST) {
      console.warn('[AI Employees] SMTP not configured — email responses will be logged only');
      return;
    }
    this.emailTransporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT) || 587,
      secure: env.SMTP_SECURE === 'true',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }

  /**
   * Call AI with the employee's system prompt
   */
  private async callAI(employee: typeof aiEmployees.$inferSelect, userMessage: string): Promise<string> {
    const chain = buildProviderChain();
    const response = await createWithFallback({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: employee.instructions || 'You are a helpful AI assistant.' },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 800,
    }, chain);
    return response.choices[0]?.message?.content || '';
  }

  /**
   * Log a task execution
   */
  private async log(logData: {
    employeeId: string;
    employeeName: string;
    role: string;
    taskType: string;
    status: string;
    input?: any;
    output?: any;
    summary?: string;
    metadata?: any;
    duration?: number;
  }) {
    const logId = uuidv4();
    const createdAt = new Date();
    const completedAt = logData.status === 'completed' || logData.status === 'failed' ? createdAt : undefined;

    await db.insert(aiEmployeeLogs).values({
      id: logId,
      employeeId: logData.employeeId,
      employeeName: logData.employeeName,
      role: logData.role,
      taskType: logData.taskType,
      status: logData.status,
      input: logData.input,
      output: logData.output,
      summary: logData.summary,
      metadata: logData.metadata,
      createdAt,
      completedAt,
      duration: logData.duration,
    });

    // Increment employee's task count
    if (logData.status === 'completed') {
      await this.incrementTaskCount(logData.employeeId);
    }

    return logId;
  }

  private async incrementTaskCount(employeeId: string) {
    try {
      const [emp] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, employeeId)).limit(1);
      if (emp) {
        const today = new Date();
        const lastActive = emp.lastActiveAt;
        const isSameDay = lastActive && lastActive.toDateString() === today.toDateString();
        await db.update(aiEmployees).set({
          tasksCompleted: (emp.tasksCompleted || 0) + 1,
          tasksToday: isSameDay ? (emp.tasksToday || 0) + 1 : 1,
          lastActiveAt: today,
          status: 'active',
          updatedAt: today,
        }).where(eq(aiEmployees.id, employeeId));
      }
    } catch (error) {
      console.error('[AI Employees] Increment error:', error);
    }
  }

  /**
   * Send an email on behalf of an employee
   */
  async sendEmail(from: string, to: string, subject: string, body: string, employeeName: string): Promise<boolean> {
    if (!this.emailTransporter) {
      console.log(`[AI Employees] ${employeeName} — email not sent (SMTP not configured). Would send to: ${to}`);
      console.log(`[AI Employees] Subject: ${subject}`);
      console.log(`[AI Employees] Body: ${body.slice(0, 200)}...`);
      return false;
    }

    try {
      await this.emailTransporter.sendMail({
        from: `"${employeeName} @ BuildMyBot" <${from}>`,
        to,
        subject,
        html: body,
      });
      console.log(`[AI Employees] ${employeeName} sent email to ${to}: ${subject}`);
      return true;
    } catch (error) {
      console.error(`[AI Employees] Email send error for ${employeeName}:`, error);
      return false;
    }
  }

  // ─── Task Handlers ──────────────────────────────────────────

  /**
   * Sam: Respond to a customer email
   */
  async handleEmailResponse(emailData: { from: string; subject: string; body: string; to?: string }): Promise<{ response: string; sent: boolean }> {
    const [sam] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'sam-support')).limit(1);
    if (!sam) throw new Error('Sam not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: sam.id,
      employeeName: sam.name,
      role: sam.role,
      taskType: 'email_response',
      status: 'running',
      input: emailData,
    });

    try {
      const prompt = `A customer sent this email:

Subject: ${emailData.subject}
From: ${emailData.from}
Body: ${emailData.body}

Write a professional, helpful response. Be warm but concise. Address their concern directly. If you don't know the answer, say you'll escalate to the team. Sign off as "Sam from BuildMyBot Support".`;

      const response = await this.callAI(sam, prompt);
      const sent = await this.sendEmail(
        env.SMTP_USER || 'support@buildmybot.app',
        emailData.from,
        `Re: ${emailData.subject}`,
        response.replace(/\n/g, '<br>'),
        sam.name,
      );

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { response, sent },
        summary: `Responded to customer email: "${emailData.subject}"`,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { response, sent };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Sam: Triage open support tickets
   */
  async triageSupportTickets(): Promise<{ triaged: number; summaries: any[] }> {
    const [sam] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'sam-support')).limit(1);
    if (!sam) throw new Error('Sam not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: sam.id,
      employeeName: sam.name,
      role: sam.role,
      taskType: 'support_triage',
      status: 'running',
    });

    try {
      // Get open support tickets
      const openTickets = await db.select().from(supportTicketsTable).limit(10);
      const summaries: any[] = [];

      for (const ticket of openTickets) {
        const prompt = `Triage this support ticket:
Ticket ID: ${ticket.id}
Subject: ${ticket.subject || 'No subject'}
Description: ${ticket.description || 'No description'}
Status: ${ticket.status}

Provide a brief triage assessment: priority (low/medium/high/urgent), recommended action, and a draft response. Format as JSON: {"priority":"...","action":"...","draftResponse":"..."}`;

        const result = await this.callAI(sam, prompt);
        summaries.push({ ticketId: ticket.id, triage: result });
      }

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { triaged: openTickets.length, summaries },
        summary: `Triaged ${openTickets.length} support tickets`,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { triaged: openTickets.length, summaries };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Eli: Check bot health and deployment status
   */
  async checkSystemHealth(): Promise<{ report: string; issues: string[] }> {
    const [eli] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'eli-engineering')).limit(1);
    if (!eli) throw new Error('Eli not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: eli.id,
      employeeName: eli.name,
      role: eli.role,
      taskType: 'health_check',
      status: 'running',
    });

    try {
      // Get bot stats
      const allBots = await db.select().from(bots).limit(100);
      const activeBots = allBots.filter((b: any) => b.active);
      const inactiveBots = allBots.filter((b: any) => !b.active);

      const stats = {
        totalBots: allBots.length,
        activeBots: activeBots.length,
        inactiveBots: inactiveBots.length,
        bots: allBots.map((b: any) => ({ id: b.id, name: b.name, active: b.active, model: b.model })),
      };

      const prompt = `You are doing a health check on the BuildMyBot platform. Here are the current stats:

${JSON.stringify(stats, null, 2)}

Provide:
1. A health summary (overall status)
2. Any issues or concerns (inactive bots, missing models, etc.)
3. Recommended actions

Format as a clear, structured report. Flag critical issues with [CRITICAL].`;

      const report = await this.callAI(eli, prompt);
      const issues: string[] = [];
      if (inactiveBots.length > 0) issues.push(`${inactiveBots.length} inactive bots found`);
      if (activeBots.length === 0) issues.push('[CRITICAL] No active bots!');

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { report, issues, stats },
        summary: `Health check: ${activeBots.length}/${allBots.length} bots active, ${issues.length} issues found`,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { report, issues };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Maya: Generate marketing content
   */
  async generateMarketingContent(topic?: string): Promise<{ content: string; type: string }> {
    const [maya] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'maya-marketing')).limit(1);
    if (!maya) throw new Error('Maya not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: maya.id,
      employeeName: maya.name,
      role: maya.role,
      taskType: 'content_creation',
      status: 'running',
      input: { topic },
    });

    try {
      const prompt = `Generate marketing content for BuildMyBot, an AI chatbot platform that helps businesses build, deploy, and manage AI chatbots.

${topic ? `Topic: ${topic}` : 'Choose a topic from: product features, customer success, AI trends, use cases, or platform updates.'}

Create:
1. A LinkedIn post (professional, data-backed)
2. A Twitter/X thread (5 tweets, punchy and engaging)
3. A short blog draft outline (3-5 sections)

Format clearly with headers for each piece.`;

      const content = await this.callAI(maya, prompt);

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { content },
        summary: `Generated marketing content${topic ? ` about: ${topic}` : ''}`,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { content, type: 'marketing_content' };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Oscar: Generate the daily standup
   */
  async generateDailyStandup(): Promise<{ standup: string }> {
    const [oscar] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'oscar-operations')).limit(1);
    if (!oscar) throw new Error('Oscar not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: oscar.id,
      employeeName: oscar.name,
      role: oscar.role,
      taskType: 'daily_standup',
      status: 'running',
    });

    try {
      // Gather stats for the standup
      const allBots = await db.select().from(bots).limit(100);
      const allUsers = await db.select().from(users).limit(100);
      const activeBots = allBots.filter((b: any) => b.active);

      const today = new Date();
      const yesterdayLogs = await db.select().from(aiEmployeeLogs)
        .where(gte(aiEmployeeLogs.createdAt, new Date(today.getTime() - 24 * 60 * 60 * 1000)))
        .limit(20);

      const stats = {
        date: today.toISOString().split('T')[0],
        totalUsers: allUsers.length,
        totalBots: allBots.length,
        activeBots: activeBots.length,
        employeeTasksLast24h: yesterdayLogs.length,
        completedTasks: yesterdayLogs.filter((l: any) => l.status === 'completed').length,
      };

      const prompt = `Generate a daily team standup for BuildMyBot. Here are today's metrics:

${JSON.stringify(stats, null, 2)}

Create a structured standup with:
1. 📊 Metrics Summary — key numbers
2. ✅ Yesterday's Accomplishments — based on task logs
3. 🎯 Today's Priorities — what the team should focus on
4. ⚠️ Blockers & Concerns — anything that needs attention

Keep it concise and actionable. This is an internal team document.`;

      const standup = await this.callAI(oscar, prompt);

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { standup, stats },
        summary: `Generated daily standup for ${stats.date}`,
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { standup };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Piper: Analyze user feedback and generate product insights
   */
  async analyzeProductFeedback(): Promise<{ insights: string }> {
    const [piper] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'piper-product')).limit(1);
    if (!piper) throw new Error('Piper not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: piper.id,
      employeeName: piper.name,
      role: piper.role,
      taskType: 'product_analysis',
      status: 'running',
    });

    try {
      // Get support tickets as feedback source
      const recentTickets = await db.select().from(supportTicketsTable).limit(20);
      const allBots = await db.select().from(bots).limit(50);

      const context = {
        supportTickets: recentTickets.map((t: any) => ({
          subject: t.subject,
          status: t.status,
        })),
        botModels: allBots.map((b: any) => ({ name: b.name, model: b.model })),
        totalBots: allBots.length,
      };

      const prompt = `Analyze the product feedback and usage data for BuildMyBot:

${JSON.stringify(context, null, 2)}

Provide:
1. Key user pain points (from support tickets)
2. Feature ideas based on usage patterns
3. Product priorities for this week
4. Any churn risks

Format as a clear product insights report. Include user stories for top 2 feature ideas.`;

      const insights = await this.callAI(piper, prompt);

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { insights, context },
        summary: 'Analyzed product feedback and generated insights',
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { insights };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Derek: Generate the daily sales digest (outreach recap + hot lead follow-ups)
   */
  async generateSalesDigest(): Promise<{ digest: string }> {
    const [derek] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'derek-sales-director')).limit(1);
    if (!derek) throw new Error('Derek not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: derek.id,
      employeeName: derek.name,
      role: derek.role,
      taskType: 'sales_digest',
      status: 'running',
    });

    try {
      const teamSize = 5;
      const prompt = `Write today's sales digest for BuildMyBot's ${teamSize}-person sales team. Structure it as:
1. \ud83d\udcde Outreach Recap — a short recap of the kind of outreach the team should be running today
2. \ud83d\udd25 Hot Follow-Ups — the highest-value next actions for the team to prioritize
3. \ud83d\udcc8 Recommendation for the VP of Sales — one clear strategic suggestion

Keep it tight and actionable — this goes straight to the VP of Sales and the President.`;

      const digest = await this.callAI(derek, prompt);
      const sent = await this.sendEmail(
        'sales.director@buildmybot.app',
        'president@buildmybot.app',
        'Daily Sales Digest',
        digest.replace(/\n/g, '<br>'),
        derek.name,
      );

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { digest, sent },
        summary: 'Generated daily sales digest',
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { digest };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Hannah: Daily HR check-in on the AI team roster
   */
  async generateHRCheckIn(): Promise<{ report: string }> {
    const [hannah] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'hannah-hr')).limit(1);
    if (!hannah) throw new Error('Hannah not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: hannah.id,
      employeeName: hannah.name,
      role: hannah.role,
      taskType: 'hr_checkin',
      status: 'running',
    });

    try {
      const roster = await db.select().from(aiEmployees);
      const rosterSummary = roster.map((e: any) => ({
        name: e.name,
        role: e.role,
        status: e.status,
        tasksToday: e.tasksToday,
        tasksCompleted: e.tasksCompleted,
      }));

      const prompt = `Here is today's AI employee roster for BuildMyBot:

${JSON.stringify(rosterSummary, null, 2)}

Write a brief HR check-in: flag anyone paused/off or with 0 tasks today, note anyone who looks overloaded, and end with one encouraging line for the team.`;

      const report = await this.callAI(hannah, prompt);

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { report, rosterSummary },
        summary: 'Generated HR roster check-in',
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { report };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Brianna: Daily billing / revenue health report
   */
  async generateBillingReport(): Promise<{ report: string }> {
    const [brianna] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'brianna-billing')).limit(1);
    if (!brianna) throw new Error('Brianna not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: brianna.id,
      employeeName: brianna.name,
      role: brianna.role,
      taskType: 'billing_report',
      status: 'running',
    });

    try {
      // Pull real billing data from Stripe (falls back to a heads-up note if not configured)
      let stripeSummary: any = null;
      let stripeError: string | null = null;
      try {
        const { getUncachableStripeClient } = await import('../stripeClient');
        const stripe = await getUncachableStripeClient();
        const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
        const soon = Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);

        const [recentCharges, activeSubs, pastDueSubs] = await Promise.all([
          stripe.charges.list({ created: { gte: since }, limit: 100 }),
          stripe.subscriptions.list({ status: 'active', limit: 100 }),
          stripe.subscriptions.list({ status: 'past_due', limit: 100 }),
        ]);

        const failedCharges = recentCharges.data.filter(c => !c.paid || c.status === 'failed');
        const successfulCharges = recentCharges.data.filter(c => c.paid && c.status === 'succeeded');
        const revenueLast24h = successfulCharges.reduce((sum, c) => sum + c.amount, 0) / 100;
        const upcomingRenewals = activeSubs.data.filter(
          s => s.current_period_end && s.current_period_end <= soon,
        );

        stripeSummary = {
          revenueLast24h: `$${revenueLast24h.toFixed(2)}`,
          chargesLast24h: recentCharges.data.length,
          failedChargesLast24h: failedCharges.length,
          activeSubscriptions: activeSubs.data.length,
          pastDueSubscriptions: pastDueSubs.data.length,
          upcomingRenewalsNext7Days: upcomingRenewals.length,
          failedChargeDetails: failedCharges.slice(0, 5).map(c => ({
            id: c.id,
            amount: `$${(c.amount / 100).toFixed(2)}`,
            customer: c.billing_details?.email || c.customer || 'unknown',
            reason: c.failure_message || c.outcome?.seller_message || 'unknown',
          })),
        };
      } catch (e: any) {
        stripeError = e.message;
      }

      const prompt = stripeSummary
        ? `Write today's billing status report for BuildMyBot using this real Stripe data:

${JSON.stringify(stripeSummary, null, 2)}

Lead with anything time-sensitive (failed charges, past-due subscriptions) at the top. Then revenue/activity summary, then upcoming renewals. Keep it tight and scannable — this goes straight to the President.`
        : `Write today's billing status report for BuildMyBot. Stripe couldn't be reached right now (error: ${stripeError}) — say so plainly and recommend checking the Stripe dashboard directly. Still provide a short checklist of what a billing lead should verify today (failed charges, upcoming renewals, dunning emails, refund requests).`;

      const report = await this.callAI(brianna, prompt);
      const sent = await this.sendEmail(
        'billing1@buildmybot.app',
        'president@buildmybot.app',
        'Daily Billing Report',
        report.replace(/\n/g, '<br>'),
        brianna.name,
      );

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { report, sent, stripeSummary },
        summary: 'Generated daily billing report',
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { report };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Marcus: Roll up everyone's daily activity into one executive summary
   */
  async generateManagerRollup(): Promise<{ summary: string }> {
    const [marcus] = await db.select().from(aiEmployees).where(eq(aiEmployees.id, 'marcus-manager')).limit(1);
    if (!marcus) throw new Error('Marcus not found');

    const startTime = Date.now();
    const logId = await this.log({
      employeeId: marcus.id,
      employeeName: marcus.name,
      role: marcus.role,
      taskType: 'manager_rollup',
      status: 'running',
    });

    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const todayLogs = await db.select().from(aiEmployeeLogs).where(gte(aiEmployeeLogs.createdAt, since)).limit(100);

      const byEmployee = todayLogs.reduce((acc: any, l: any) => {
        acc[l.employeeName] = acc[l.employeeName] || [];
        acc[l.employeeName].push({ task: l.taskType, status: l.status, summary: l.summary });
        return acc;
      }, {});

      const prompt = `Here's what BuildMyBot's AI team did in the last 24 hours, grouped by employee:

${JSON.stringify(byEmployee, null, 2)}

Write one prioritized executive summary for the President: what happened, what needs a decision from them, and what (if anything) is on fire. Keep it under 200 words.`;

      const summary = await this.callAI(marcus, prompt);
      const sent = await this.sendEmail(
        'manager@buildmybot.app',
        'president@buildmybot.app',
        'Daily Executive Summary — AI Team',
        summary.replace(/\n/g, '<br>'),
        marcus.name,
      );

      await db.update(aiEmployeeLogs).set({
        status: 'completed',
        output: { summary, sent },
        summary: 'Generated manager executive rollup',
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));

      return { summary };
    } catch (error: any) {
      await db.update(aiEmployeeLogs).set({
        status: 'failed',
        output: { error: error.message },
        completedAt: new Date(),
        duration: Date.now() - startTime,
      }).where(eq(aiEmployeeLogs.id, logId));
      throw error;
    }
  }

  /**
   * Run the full daily shift — all employees do their jobs
   */
  async runDailyShift(): Promise<{ results: any[] }> {
    console.log('[AI Employees] Starting daily shift...');
    const results: any[] = [];

    // Oscar goes first — generates the standup
    try {
      const standup = await this.generateDailyStandup();
      results.push({ employee: 'Oscar', task: 'daily_standup', status: 'completed', ...standup });
    } catch (e: any) {
      results.push({ employee: 'Oscar', task: 'daily_standup', status: 'failed', error: e.message });
    }

    // Eli checks system health
    try {
      const health = await this.checkSystemHealth();
      results.push({ employee: 'Eli', task: 'health_check', status: 'completed', ...health });
    } catch (e: any) {
      results.push({ employee: 'Eli', task: 'health_check', status: 'failed', error: e.message });
    }

    // Sam triages support tickets
    try {
      const triage = await this.triageSupportTickets();
      results.push({ employee: 'Sam', task: 'support_triage', status: 'completed', ...triage });
    } catch (e: any) {
      results.push({ employee: 'Sam', task: 'support_triage', status: 'failed', error: e.message });
    }

    // Maya creates marketing content
    try {
      const content = await this.generateMarketingContent();
      results.push({ employee: 'Maya', task: 'content_creation', status: 'completed', ...content });
    } catch (e: any) {
      results.push({ employee: 'Maya', task: 'content_creation', status: 'failed', error: e.message });
    }

    // Piper analyzes product feedback
    try {
      const insights = await this.analyzeProductFeedback();
      results.push({ employee: 'Piper', task: 'product_analysis', status: 'completed', ...insights });
    } catch (e: any) {
      results.push({ employee: 'Piper', task: 'product_analysis', status: 'failed', error: e.message });
    }

    // Derek generates the sales digest
    try {
      const digest = await this.generateSalesDigest();
      results.push({ employee: 'Derek', task: 'sales_digest', status: 'completed', ...digest });
    } catch (e: any) {
      results.push({ employee: 'Derek', task: 'sales_digest', status: 'failed', error: e.message });
    }

    // Hannah runs the HR check-in
    try {
      const hr = await this.generateHRCheckIn();
      results.push({ employee: 'Hannah', task: 'hr_checkin', status: 'completed', ...hr });
    } catch (e: any) {
      results.push({ employee: 'Hannah', task: 'hr_checkin', status: 'failed', error: e.message });
    }

    // Brianna runs the billing report
    try {
      const billing = await this.generateBillingReport();
      results.push({ employee: 'Brianna', task: 'billing_report', status: 'completed', ...billing });
    } catch (e: any) {
      results.push({ employee: 'Brianna', task: 'billing_report', status: 'failed', error: e.message });
    }

    // Marcus rolls everything up into one executive summary — always runs last
    try {
      const rollup = await this.generateManagerRollup();
      results.push({ employee: 'Marcus', task: 'manager_rollup', status: 'completed', ...rollup });
    } catch (e: any) {
      results.push({ employee: 'Marcus', task: 'manager_rollup', status: 'failed', error: e.message });
    }

    console.log(`[AI Employees] Daily shift complete: ${results.filter(r => r.status === 'completed').length}/${results.length} succeeded`);
    return { results };
  }

  /**
   * Get all employees with their recent activity
   */
  async getEmployees() {
    const employees = await db.select().from(aiEmployees);
    return employees;
  }

  /**
   * Get recent logs
   */
  async getLogs(limit = 50) {
    const logs = await db.select().from(aiEmployeeLogs)
      .orderBy(desc(aiEmployeeLogs.createdAt))
      .limit(limit);
    return logs;
  }

  /**
   * Get logs for a specific employee
   */
  async getEmployeeLogs(employeeId: string, limit = 20) {
    const logs = await db.select().from(aiEmployeeLogs)
      .where(eq(aiEmployeeLogs.employeeId, employeeId))
      .orderBy(desc(aiEmployeeLogs.createdAt))
      .limit(limit);
    return logs;
  }

  /**
   * Update an employee's status
   */
  async updateEmployeeStatus(employeeId: string, status: string) {
    await db.update(aiEmployees).set({ status, updatedAt: new Date() }).where(eq(aiEmployees.id, employeeId));
  }

  /**
   * Update an employee's instructions
   */
  async updateEmployeeInstructions(employeeId: string, instructions: string) {
    await db.update(aiEmployees).set({ instructions, updatedAt: new Date() }).where(eq(aiEmployees.id, employeeId));
  }
}

export const aiEmployeeService = new AIEmployeeService();

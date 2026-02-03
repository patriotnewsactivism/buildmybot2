import { and, eq, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  leads,
  nurtureEnrollments,
  nurtureSequences,
  nurtureSteps,
  users,
} from '../../shared/schema';
import { db } from '../db';
import logger from '../utils/logger';
import { whitelabelService } from './WhitelabelService';

export class NurtureService {
  async createSequence(
    organizationId: string,
    name: string,
    description: string,
    triggerType: string,
  ) {
    const [sequence] = await db
      .insert(nurtureSequences)
      .values({
        id: uuidv4(),
        organizationId,
        name,
        description,
        triggerType,
        isActive: true,
      })
      .returning();
    return sequence;
  }

  async addStep(
    sequenceId: string,
    stepOrder: number,
    delayHours: number,
    actionType: string,
    actionConfig: any,
  ) {
    const [step] = await db
      .insert(nurtureSteps)
      .values({
        id: uuidv4(),
        sequenceId,
        stepOrder,
        delayHours,
        actionType,
        actionConfig,
      })
      .returning();
    return step;
  }

  async enrollLead(leadId: string, sequenceId: string) {
    // Check if already enrolled
    const existing = await db
      .select()
      .from(nurtureEnrollments)
      .where(
        and(
          eq(nurtureEnrollments.leadId, leadId),
          eq(nurtureEnrollments.sequenceId, sequenceId),
          eq(nurtureEnrollments.status, 'active'),
        ),
      );

    if (existing.length > 0) return;

    // Get first step to calculate due date
    const steps = await db
      .select()
      .from(nurtureSteps)
      .where(eq(nurtureSteps.sequenceId, sequenceId))
      .orderBy(nurtureSteps.stepOrder)
      .limit(1);

    const nextDue = new Date();
    if (steps.length > 0) {
      nextDue.setHours(nextDue.getHours() + (steps[0].delayHours || 0));
    }

    await db.insert(nurtureEnrollments).values({
      id: uuidv4(),
      leadId,
      sequenceId,
      currentStepOrder: steps.length > 0 ? steps[0].stepOrder : 0,
      nextStepDueAt: nextDue,
      status: 'active',
    });
  }

  async processEnrollments() {
    const now = new Date();

    // Find active enrollments due for processing
    const dueEnrollments = await db
      .select()
      .from(nurtureEnrollments)
      .where(
        and(
          eq(nurtureEnrollments.status, 'active'),
          lte(nurtureEnrollments.nextStepDueAt, now),
        ),
      );

    for (const enrollment of dueEnrollments) {
      try {
        await this.processEnrollmentStep(enrollment);
      } catch (error) {
        logger.error(`Error processing enrollment ${enrollment.id}:`, {
          error,
        });
      }
    }
  }

  private async processEnrollmentStep(enrollment: any) {
    // Get the step definition
    const [step] = await db
      .select()
      .from(nurtureSteps)
      .where(
        and(
          eq(nurtureSteps.sequenceId, enrollment.sequenceId),
          eq(nurtureSteps.stepOrder, enrollment.currentStepOrder),
        ),
      );

    if (!step) {
      // No step found? Maybe sequence ended or modified. Complete it.
      await db
        .update(nurtureEnrollments)
        .set({ status: 'completed' })
        .where(eq(nurtureEnrollments.id, enrollment.id));
      return;
    }

    // Execute Action
    if (step.actionType === 'send_email') {
      await this.sendEmailAction(enrollment.leadId, step.actionConfig);
    }

    // Move to next step
    const [nextStep] = await db
      .select()
      .from(nurtureSteps)
      .where(
        and(
          eq(nurtureSteps.sequenceId, enrollment.sequenceId),
          eq(nurtureSteps.stepOrder, enrollment.currentStepOrder + 1), // Assumes strictly sequential integers
        ),
      );

    if (nextStep) {
      const nextDue = new Date();
      nextDue.setHours(nextDue.getHours() + (nextStep.delayHours || 0));

      await db
        .update(nurtureEnrollments)
        .set({
          currentStepOrder: nextStep.stepOrder,
          nextStepDueAt: nextDue,
        })
        .where(eq(nurtureEnrollments.id, enrollment.id));
    } else {
      await db
        .update(nurtureEnrollments)
        .set({ status: 'completed' })
        .where(eq(nurtureEnrollments.id, enrollment.id));
    }
  }

  private async sendEmailAction(leadId: string, config: any) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (!lead || !lead.email) return;

    // We need organizationId to get whitelabel config. Lead has it.
    if (!lead.organizationId) return;

    await whitelabelService.sendWhitelabeledEmail(
      lead.organizationId,
      lead.email,
      config.subject || 'Follow up',
      config.body || 'Hello!',
    );
  }
}

export const nurtureService = new NurtureService();

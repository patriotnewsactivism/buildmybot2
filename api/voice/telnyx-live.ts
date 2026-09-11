import {
  RETENTION_OBJECTIONS,
  type RetentionObjection,
  type RetentionState,
  authorizeNextRetentionOffer,
  createRetentionState,
  markLatestRetentionOfferOutcome,
  retentionAuditSnapshot,
} from '../../shared/voice-commercial-policy.js';
import {
  GEMINI_LIVE_MODEL,
  type SharedCallContext,
  VOICE_TEAM_ROUTING,
  type VoiceDepartment,
  type VoiceTeam,
  agentIdentity,
  createDefaultVoiceTeam,
  destinationDepartment,
  handoffContextText,
} from '../../shared/voice-team.js';
import { departmentInstructions } from '../phone/corporate-routing.js';
import { loadVoiceTeam } from './team-store.js';
import {
  GRANT_INCENTIVE_TOOL,
  executeGrantIncentive,
} from './grant-incentive.js';

// NOTE: Full telnyx-live body is restored from main + grant_incentive wiring.
// This intermediate commit is replaced immediately by the complete file push.
export { GRANT_INCENTIVE_TOOL, executeGrantIncentive };
export const TELNYX_LIVE_RESTORE_REQUIRED = true;

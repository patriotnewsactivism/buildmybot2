// Shared cross-cutting types used by both server and client code.

export enum BotDeploymentStatus {
  NOT_DEPLOYED = 'not_deployed',
  DEPLOYING = 'deploying',
  DEPLOYED = 'deployed',
  FAILED = 'failed',
}

// BuildMyBot's own line; never a default for customer workspaces.
export const CORPORATE = {
  number: '+13466460065',
  displayNumber: '(346) 646-0065',
  botId: '290f5172-363c-404c-aaf8-80fa20a1d7c7',
  agentId: '59e5fee3-239c-4c0c-92a1-b2d7b7e373fb',
  ownerId: '732fd8a6-daf4-4591-9b83-3bc83ea325f7',
  tenant: 'user:732fd8a6-daf4-4591-9b83-3bc83ea325f7',
};
export const corporateOrigin = () =>
  process.env.CORPORATE_PHONE_API_ORIGIN ||
  'https://buildmybot2-web-production.up.railway.app';
export const corporateMediaUrl = () =>
  `${corporateOrigin().replace(/^https:/, 'wss:')}/api/voice/telnyx-media`;

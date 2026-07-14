export type ClerkWebhookPayload = Record<string, unknown> & {
  id?: string;
};

type ClerkEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'session.created'
  | 'session.ended'
  | 'session.removed'
  | 'session.revoked'
  | 'organization.created'
  | 'organization.updated'
  | 'organization.deleted'
  | 'organizationMembership.created'
  | 'organizationMembership.updated'
  | 'organizationMembership.deleted'
  | 'organizationInvitation.created'
  | 'organizationInvitation.accepted'
  | 'organizationInvitation.revoked';

export type ClerkEventMap = {
  [K in ClerkEventType as `clerk.${K}`]: ClerkWebhookPayload;
};

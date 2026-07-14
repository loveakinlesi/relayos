export type ResendWebhookPayload = Record<string, unknown> & {
  email_id?: string;
};

type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked';

export type ResendEventMap = {
  [K in ResendEventType as `resend.${K}`]: ResendWebhookPayload;
};

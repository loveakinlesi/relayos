export type ShopifyWebhookPayload = Record<string, unknown> & {
  id?: string | number;
};

type ShopifyTopic =
  | 'app/uninstalled'
  | 'customers/create'
  | 'customers/update'
  | 'customers/delete'
  | 'orders/create'
  | 'orders/updated'
  | 'orders/delete'
  | 'orders/paid'
  | 'orders/cancelled'
  | 'orders/fulfilled'
  | 'orders/partially_fulfilled'
  | 'products/create'
  | 'products/update'
  | 'products/delete'
  | 'refunds/create'
  | 'checkouts/create'
  | 'checkouts/update'
  | 'carts/create'
  | 'carts/update';

type NormalizeTopic<T extends string> = T extends `${infer Head}/${infer Tail}`
  ? `${Head}.${NormalizeTopic<Tail>}`
  : T;

export type ShopifyEventMap = {
  [K in ShopifyTopic as `shopify.${NormalizeTopic<K>}`]: ShopifyWebhookPayload;
};

import delivery from './delivery-2026.json';

/**
 * Tracks whether the policies the real 2026 government agreed to actually happen.
 * Empty until the coalition agreements are published; filled in by hand with a source per item.
 */
export const DELIVERY_STATUSES = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  done: 'Done',
  changed: 'Done, but changed',
  dropped: 'Dropped',
} as const;

export type DeliveryStatus = keyof typeof DELIVERY_STATUSES;

export interface DeliveryItem {
  /** The policy as worded in the agreement. */
  title: string;
  /** Party id that asked for it. */
  party: string;
  /** Game policy id, when the game has the same policy. */
  policyId?: string;
  status: DeliveryStatus;
  /** One plain sentence on what happened. */
  note: string;
  sourceUrl: string;
  /** When the status was last checked, YYYY-MM-DD. */
  checked: string;
}

export interface Delivery {
  available: boolean;
  asOf: string;
  agreementUrl: string;
  items: DeliveryItem[];
}

export const DELIVERY_2026 = delivery as Delivery;

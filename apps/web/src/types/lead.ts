import type { Nullable } from './common';
import type { LeadStatus } from './enums';
import type { Property } from './property';

/** CONTRACT §6 — `POST /leads`, `GET /leads`, `PATCH /leads/:id`. */

export type LeadSource =
  | 'property_page'
  | 'compound_page'
  | 'developer_page'
  | 'search_results'
  | 'chatbot'
  | 'newsletter'
  | 'call_button'
  | 'whatsapp'
  | 'contact_page'
  | 'sell_page';

export interface Lead {
  id: string;
  propertyId: Nullable<string>;
  /** Sell enquiries name a catalogue location instead of a listing. */
  areaId?: Nullable<string>;
  compoundId?: Nullable<string>;
  propertyType?: Nullable<string>;
  name: string;
  phone: string;
  email: string;
  message: Nullable<string>;
  source: LeadSource | string;
  status: LeadStatus;
  assignedAgentId?: Nullable<string>;
  notes?: Nullable<string>;
  createdAt: string;
  updatedAt: string;
  property?: Property;
}

export interface CreateLeadPayload {
  propertyId?: string;
  areaId?: string;
  compoundId?: string;
  propertyType?: string;
  name: string;
  phone: string;
  email?: string;
  message?: string;
  source: LeadSource | string;
}

export interface UpdateLeadPayload {
  status?: LeadStatus;
  assignedAgentId?: string | null;
  notes?: string;
}

export interface LeadListParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: LeadStatus;
  propertyId?: string;
  compoundId?: string;
  source?: string;
  q?: string;
}

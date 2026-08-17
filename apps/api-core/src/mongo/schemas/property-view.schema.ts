import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * CONTRACT §2 — MongoDB `topchoice.property_views`.
 *
 * Written fire-and-forget by `POST /properties/:id/view`; `reports-svc` rolls
 * these up into the analytics endpoints.
 */
@Schema({
  collection: 'property_views',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class PropertyView {
  /** Shared listing UUID (= `property_index.id`). */
  @Prop({ type: String, required: true })
  propertyId: string;

  /** `_id` of the viewed document in `properties`, as a 24-hex string. */
  @Prop({ type: String, default: null })
  mongoId: string | null;

  @Prop({ type: String, default: null })
  userId: string | null;

  /** Anonymous visitor id (cookie) so guest views can be de-duplicated. */
  @Prop({ type: String, default: null })
  sessionId: string | null;

  /** Truncated / hashed client address — never a full raw IP. */
  @Prop({ type: String, default: null })
  ipHash: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;

  @Prop({ type: String, default: null })
  referrer: string | null;

  @Prop({ type: String, default: 'web' })
  source: string;

  @Prop({ type: String, default: null })
  requestId: string | null;

  @Prop({ type: Date, default: () => new Date() })
  viewedAt: Date;

  createdAt: Date;
}

export type PropertyViewDocument = HydratedDocument<PropertyView>;

export const PropertyViewSchema = SchemaFactory.createForClass(PropertyView);

PropertyViewSchema.index({ propertyId: 1, viewedAt: -1 });
PropertyViewSchema.index({ userId: 1, viewedAt: -1 });
PropertyViewSchema.index({ sessionId: 1, propertyId: 1, viewedAt: -1 });
PropertyViewSchema.index({ viewedAt: -1 });

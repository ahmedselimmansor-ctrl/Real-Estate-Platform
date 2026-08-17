import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

import { UserRoleValue } from '../../common/enums';

/**
 * CONTRACT §2 — MongoDB `topchoice.activity_events`.
 *
 * Append-only stream backing `GET /api/v1/admin/activity`. Carries the
 * `X-Request-Id` correlation id so an event can be traced back to its request.
 */
@Schema({
  collection: 'activity_events',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class ActivityEvent {
  /** Dot-namespaced verb, e.g. `property.created`, `auth.login`. */
  @Prop({ type: String, required: true, trim: true })
  type: string;

  @Prop({ type: String, default: null })
  actorId: string | null;

  @Prop({ type: String, default: null })
  actorRole: UserRoleValue | null;

  /** `property` | `compound` | `lead` | `user` | … */
  @Prop({ type: String, required: true, trim: true })
  entityType: string;

  @Prop({ type: String, default: null })
  entityId: string | null;

  @Prop({ type: SchemaTypes.Mixed, default: () => ({}) })
  payload: Record<string, unknown>;

  @Prop({ type: String, default: null })
  requestId: string | null;

  @Prop({ type: String, default: null })
  ipHash: string | null;

  @Prop({ type: String, default: null })
  userAgent: string | null;

  createdAt: Date;
}

export type ActivityEventDocument = HydratedDocument<ActivityEvent>;

export const ActivityEventSchema = SchemaFactory.createForClass(ActivityEvent);

ActivityEventSchema.index({ createdAt: -1 });
ActivityEventSchema.index({ type: 1, createdAt: -1 });
ActivityEventSchema.index({ actorId: 1, createdAt: -1 });
ActivityEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

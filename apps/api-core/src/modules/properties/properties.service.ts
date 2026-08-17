import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { FilterQuery, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PaginatedResult } from '../../common/types/api-response';
import { paginate, parseSort } from '../../common/utils/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../redis/cache.service';
import { CACHE_TTL, cacheKeys } from '../../redis/cache-keys';
import { Property, PropertyDocument } from '../../mongo/schemas/property.schema';
import { PropertyView, PropertyViewDocument } from '../../mongo/schemas/property-view.schema';
import { AreasService } from '../areas/areas.service';
import { hashIp } from '../shared/hash.util';
import { isObjectIdHex, isUuid } from '../shared/identifier.util';
import { buildUniqueSlug } from '../shared/slug.util';
import type {
  CreatePropertyDto,
  ListPropertiesDto,
  UpdatePropertyDto,
} from './dto/property.dto';
import { PropertyMirrorService } from './property-mirror.service';
import { SearchIndexClient } from './search-index.client';

/** Mongo sort fields exposed to clients, mapped to their document paths. */
const SORT_PATHS: Readonly<Record<string, string>> = {
  price: 'price.amount',
  area: 'specs.areaSqm',
  bedrooms: 'specs.bedrooms',
  publishedAt: 'publishedAt',
  createdAt: 'createdAt',
};
const SORTABLE = Object.keys(SORT_PATHS);

/** Views from the same viewer inside this window are not counted twice. */
const VIEW_DEDUPE_TTL_SECONDS = 1800;

@Injectable()
export class PropertiesService {
  private readonly logger = new Logger(PropertiesService.name);

  constructor(
    @InjectModel(Property.name) private readonly propertyModel: Model<PropertyDocument>,
    @InjectModel(PropertyView.name)
    private readonly viewModel: Model<PropertyViewDocument>,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly mirror: PropertyMirrorService,
    private readonly searchIndex: SearchIndexClient,
    private readonly areas: AreasService,
  ) {}

  // ------------------------------------------------------------------- reads

  async list(query: ListPropertiesDto): Promise<PaginatedResult<Property>> {
    const key = cacheKeys.list({ entity: 'properties', ...query });

    return this.cache.wrap(key, CACHE_TTL.list, async () => {
      const filter: FilterQuery<PropertyDocument> = { deletedAt: null };

      if (query.propertyType?.length) filter.propertyType = { $in: query.propertyType };
      if (query.finishing?.length) filter.finishing = { $in: query.finishing };
      if (query.bedrooms?.length) filter['specs.bedrooms'] = { $in: query.bedrooms };
      if (query.saleType) filter.saleType = query.saleType;
      if (query.status) filter.status = query.status;
      if (query.areaId) filter['location.areaId'] = query.areaId;
      if (query.compoundId) filter['compound.id'] = query.compoundId;
      if (query.developerId) filter['developer.id'] = query.developerId;
      if (query.isFeatured !== undefined) filter.isFeatured = query.isFeatured;

      if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        filter['price.amount'] = {
          ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
          ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
        };
      }

      const sort = parseSort(query.sort, SORTABLE, { field: 'publishedAt', direction: 'desc' });
      const sortPath = SORT_PATHS[sort.field];

      const [data, total] = await Promise.all([
        this.propertyModel
          .find(filter)
          // `_id` breaks ties so pagination is stable across equal sort values.
          .sort({ [sortPath]: sort.direction === 'desc' ? -1 : 1, _id: 1 })
          .skip(query.skip)
          .limit(query.take)
          .lean<Property[]>()
          .exec(),
        this.propertyModel.countDocuments(filter).exec(),
      ]);

      return paginate(data, total, query);
    });
  }

  /** Accepts the shared UUID, the Mongo ObjectId hex, or the slug. */
  async findOne(idOrSlug: string): Promise<Property> {
    const cacheKey = cacheKeys.property(idOrSlug);

    const cached = await this.cache.get<Property>(cacheKey);
    if (cached) {
      return cached;
    }

    const property = await this.propertyModel
      .findOne({ ...this.identifierFilter(idOrSlug), deletedAt: null })
      .lean<Property>()
      .exec();

    if (!property) {
      throw AppException.notFound(
        `Property "${idOrSlug}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    await this.cache.set(cacheKey, property, CACHE_TTL.property);
    return property;
  }

  /**
   * Same compound or area, within ±25% of the price and ±1 bedroom.
   * Ordered by how close the price is to the source listing.
   */
  async similar(idOrSlug: string, limit = 8): Promise<Property[]> {
    const source = await this.findOne(idOrSlug);

    const filter: FilterQuery<PropertyDocument> = {
      deletedAt: null,
      propertyId: { $ne: source.propertyId },
      status: { $in: ['available', 'off_plan', 'reserved'] },
      $or: [{ 'compound.id': source.compound.id }, { 'location.areaId': source.location.areaId }],
      'price.amount': {
        $gte: Math.floor(source.price.amount * 0.75),
        $lte: Math.ceil(source.price.amount * 1.25),
      },
      'specs.bedrooms': {
        $gte: Math.max(0, source.specs.bedrooms - 1),
        $lte: source.specs.bedrooms + 1,
      },
    };

    const candidates = await this.propertyModel
      .find(filter)
      .limit(limit * 3)
      .lean<Property[]>()
      .exec();

    return candidates
      .sort(
        (a, b) =>
          Math.abs(a.price.amount - source.price.amount) -
          Math.abs(b.price.amount - source.price.amount),
      )
      .slice(0, limit);
  }

  // ------------------------------------------------------------------ writes

  async create(dto: CreatePropertyDto): Promise<Property> {
    const compound = await this.prisma.compound.findUnique({
      where: { id: dto.compoundId },
      include: {
        developer: { select: { id: true, name: true, slug: true, logoUrl: true } },
        area: { select: { id: true, nameEn: true, city: true, governorate: true } },
      },
    });

    if (!compound) {
      throw AppException.badRequest(
        `Compound "${dto.compoundId}" does not exist`,
        ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
        [{ field: 'compoundId', message: 'unknown compound', rule: 'exists' }],
      );
    }

    const area = await this.prisma.area.findUnique({ where: { id: dto.location.areaId } });
    if (!area) {
      throw AppException.badRequest(
        `Area "${dto.location.areaId}" does not exist`,
        ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
        [{ field: 'location.areaId', message: 'unknown area', rule: 'exists' }],
      );
    }

    const slug = await buildUniqueSlug(
      dto.slug ?? dto.title.en,
      async (candidate) =>
        (await this.propertyModel.countDocuments({ slug: candidate }).exec()) > 0,
      'property',
    );

    const doc = await this.mirror.createWithMirror({
      propertyId: uuidv4(),
      slug,
      referenceNo: dto.referenceNo ?? (await this.nextReferenceNo()),
      title: { en: dto.title.en, ar: dto.title.ar },
      description: { en: dto.description.en, ar: dto.description.ar },
      propertyType: dto.propertyType as Property['propertyType'],
      saleType: dto.saleType as Property['saleType'],
      status: (dto.status ?? 'available') as Property['status'],
      finishing: dto.finishing as Property['finishing'],
      price: {
        amount: dto.price.amount,
        currency: 'EGP',
        pricePerMeter:
          dto.price.pricePerMeter ?? Math.round(dto.price.amount / dto.specs.areaSqm),
      },
      paymentPlan: {
        downPaymentPercent: dto.paymentPlan.downPaymentPercent,
        installmentYears: dto.paymentPlan.installmentYears,
        monthlyInstallment:
          dto.paymentPlan.monthlyInstallment ??
          this.monthlyInstallment(
            dto.price.amount,
            dto.paymentPlan.downPaymentPercent,
            dto.paymentPlan.installmentYears,
          ),
        deliveryDate: dto.paymentPlan.deliveryDate,
      },
      specs: {
        bedrooms: dto.specs.bedrooms,
        bathrooms: dto.specs.bathrooms,
        areaSqm: dto.specs.areaSqm,
        gardenSqm: dto.specs.gardenSqm ?? 0,
        floor: dto.specs.floor ?? 0,
        parkingSpots: dto.specs.parkingSpots ?? 0,
      },
      location: {
        areaId: area.id,
        areaName: area.nameEn,
        city: area.city,
        governorate: area.governorate,
        address: dto.location.address ?? '',
        geo: { type: 'Point', coordinates: [dto.location.geo.lng, dto.location.geo.lat] },
      },
      compound: { id: compound.id, name: compound.name, slug: compound.slug },
      developer: {
        id: compound.developer.id,
        name: compound.developer.name,
        slug: compound.developer.slug,
        logoUrl: compound.developer.logoUrl,
      },
      amenities: dto.amenities ?? [],
      media: this.normalizeMedia(dto),
      stats: { views: 0, favorites: 0, leads: 0 },
      isFeatured: dto.isFeatured ?? false,
      publishedAt: dto.publishedAt ? new Date(dto.publishedAt) : new Date(),
      deletedAt: null,
    });

    await this.afterWrite(doc.propertyId, area.id);
    return doc.toObject() as Property;
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<Property> {
    const existing = await this.propertyModel
      .findOne({ propertyId: id, deletedAt: null })
      .lean<Property>()
      .exec();

    if (!existing) {
      throw AppException.notFound(
        `Property "${id}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    const update: Record<string, unknown> = {};

    if (dto.slug !== undefined || dto.title !== undefined) {
      update.slug = await buildUniqueSlug(
        dto.slug ?? dto.title!.en,
        async (candidate) =>
          (await this.propertyModel
            .countDocuments({ slug: candidate, propertyId: { $ne: id } })
            .exec()) > 0,
        'property',
      );
    }

    if (dto.title) update.title = { en: dto.title.en, ar: dto.title.ar };
    if (dto.description) update.description = { en: dto.description.en, ar: dto.description.ar };
    if (dto.propertyType) update.propertyType = dto.propertyType;
    if (dto.saleType) update.saleType = dto.saleType;
    if (dto.status) update.status = dto.status;
    if (dto.finishing) update.finishing = dto.finishing;
    if (dto.isFeatured !== undefined) update.isFeatured = dto.isFeatured;
    if (dto.amenities !== undefined) update.amenities = dto.amenities;
    if (dto.publishedAt !== undefined) update.publishedAt = new Date(dto.publishedAt);
    if (dto.media !== undefined) update.media = this.normalizeMedia(dto);

    const areaSqm = dto.specs?.areaSqm ?? existing.specs.areaSqm;

    if (dto.specs) {
      update.specs = {
        bedrooms: dto.specs.bedrooms ?? existing.specs.bedrooms,
        bathrooms: dto.specs.bathrooms ?? existing.specs.bathrooms,
        areaSqm,
        gardenSqm: dto.specs.gardenSqm ?? existing.specs.gardenSqm,
        floor: dto.specs.floor ?? existing.specs.floor,
        parkingSpots: dto.specs.parkingSpots ?? existing.specs.parkingSpots,
      };
    }

    if (dto.price) {
      const amount = dto.price.amount ?? existing.price.amount;
      update.price = {
        amount,
        currency: 'EGP',
        pricePerMeter: dto.price.pricePerMeter ?? Math.round(amount / areaSqm),
      };
    }

    if (dto.paymentPlan) {
      const amount = dto.price?.amount ?? existing.price.amount;
      const downPaymentPercent =
        dto.paymentPlan.downPaymentPercent ?? existing.paymentPlan.downPaymentPercent;
      const installmentYears =
        dto.paymentPlan.installmentYears ?? existing.paymentPlan.installmentYears;

      update.paymentPlan = {
        downPaymentPercent,
        installmentYears,
        monthlyInstallment:
          dto.paymentPlan.monthlyInstallment ??
          this.monthlyInstallment(amount, downPaymentPercent, installmentYears),
        deliveryDate: dto.paymentPlan.deliveryDate ?? existing.paymentPlan.deliveryDate,
      };
    }

    if (dto.location) {
      const area = await this.prisma.area.findUnique({ where: { id: dto.location.areaId } });
      if (!area) {
        throw AppException.badRequest(
          `Area "${dto.location.areaId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'location.areaId', message: 'unknown area', rule: 'exists' }],
        );
      }
      update.location = {
        areaId: area.id,
        areaName: area.nameEn,
        city: area.city,
        governorate: area.governorate,
        address: dto.location.address ?? existing.location.address,
        geo: { type: 'Point', coordinates: [dto.location.geo.lng, dto.location.geo.lat] },
      };
    }

    if (dto.compoundId) {
      const compound = await this.prisma.compound.findUnique({
        where: { id: dto.compoundId },
        include: {
          developer: { select: { id: true, name: true, slug: true, logoUrl: true } },
        },
      });

      if (!compound) {
        throw AppException.badRequest(
          `Compound "${dto.compoundId}" does not exist`,
          ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
          [{ field: 'compoundId', message: 'unknown compound', rule: 'exists' }],
        );
      }

      update.compound = { id: compound.id, name: compound.name, slug: compound.slug };
      update.developer = {
        id: compound.developer.id,
        name: compound.developer.name,
        slug: compound.developer.slug,
        logoUrl: compound.developer.logoUrl,
      };
    }

    const doc = await this.mirror.updateWithMirror(id, update);

    await this.afterWrite(id, existing.location.areaId, existing.slug);
    return doc.toObject() as Property;
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const existing = await this.propertyModel
      .findOne({ propertyId: id })
      .lean<Property>()
      .exec();

    if (!existing) {
      throw AppException.notFound(
        `Property "${id}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    await this.mirror.softDeleteWithMirror(id);
    await this.invalidate(id, existing.slug);
    await this.searchIndex.removeProperty(id);
    await this.areas.syncPropertyCount(existing.location.areaId).catch(() => undefined);

    return { id, deleted: true };
  }

  // ------------------------------------------------------------------- views

  /**
   * Fire-and-forget view counter. De-duplicated per viewer for 30 minutes so a
   * refresh loop cannot inflate the number.
   */
  async recordView(
    idOrSlug: string,
    viewer: { userId?: string; ip?: string; userAgent?: string; referrer?: string },
  ): Promise<{ counted: boolean }> {
    const property = await this.propertyModel
      .findOne({ ...this.identifierFilter(idOrSlug), deletedAt: null })
      .select({ propertyId: 1 })
      .lean<{ propertyId: string }>()
      .exec();

    if (!property) {
      throw AppException.notFound(
        `Property "${idOrSlug}" was not found`,
        ERROR_CODES.PROPERTY_NOT_FOUND,
      );
    }

    const fingerprint = viewer.userId ?? hashIp(viewer.ip) ?? 'anonymous';
    const dedupeKey = cacheKeys.rateLimit(`view:${property.propertyId}`, fingerprint);

    const hits = await this.cache.increment(dedupeKey, VIEW_DEDUPE_TTL_SECONDS);
    if (hits > 1) {
      return { counted: false };
    }

    await Promise.all([
      this.propertyModel
        .updateOne({ propertyId: property.propertyId }, { $inc: { 'stats.views': 1 } })
        .exec(),
      this.viewModel.create({
        propertyId: property.propertyId,
        userId: viewer.userId ?? null,
        ipHash: hashIp(viewer.ip),
        userAgent: viewer.userAgent ?? null,
        referrer: viewer.referrer ?? null,
      }),
    ]).catch((error: unknown) => {
      this.logger.warn(`could not record view for ${property.propertyId}: ${String(error)}`);
    });

    await this.cache.del(cacheKeys.property(property.propertyId));
    return { counted: true };
  }

  /** Keeps `stats.favorites` in step with the Postgres favourites table. */
  async adjustFavoriteCount(propertyId: string, delta: 1 | -1): Promise<void> {
    await this.propertyModel
      .updateOne({ propertyId }, { $inc: { 'stats.favorites': delta } })
      .exec()
      .catch(() => undefined);
    await this.cache.del(cacheKeys.property(propertyId));
  }

  /** Keeps `stats.leads` in step with the Postgres leads table. */
  async incrementLeadCount(propertyId: string): Promise<void> {
    await this.propertyModel
      .updateOne({ propertyId }, { $inc: { 'stats.leads': 1 } })
      .exec()
      .catch(() => undefined);
    await this.cache.del(cacheKeys.property(propertyId));
  }

  // ----------------------------------------------------------------- helpers

  private identifierFilter(idOrSlug: string): FilterQuery<PropertyDocument> {
    // `isUuid`/`isObjectIdHex` are `value is string` predicates. Applied to an
    // already-`string` argument they narrow the *negative* branch to `never`,
    // so the slug is derived up front, before any narrowing happens.
    const slug = idOrSlug.toLowerCase();

    if (isUuid(idOrSlug)) return { propertyId: idOrSlug };
    if (isObjectIdHex(idOrSlug)) return { _id: idOrSlug };
    return { slug };
  }

  /** Equal instalments over the financed remainder — no interest, as sold. */
  private monthlyInstallment(
    price: number,
    downPaymentPercent: number,
    installmentYears: number,
  ): number {
    const months = installmentYears * 12;
    if (months <= 0) return 0;
    const financed = price * (1 - downPaymentPercent / 100);
    return Math.round(financed / months);
  }

  private normalizeMedia(dto: CreatePropertyDto | UpdatePropertyDto): Property['media'] {
    const images = (dto.media?.images ?? []).map((image, index) => ({
      url: image.url,
      // Images uploaded through `/uploads/presign` carry their object key.
      // Externally hosted ones (stock photography, seed data) have none, so a
      // stable key is derived from the URL — `key` is required by the schema
      // and is what the media manager uses to delete an object later.
      key: image.key ?? this.deriveMediaKey(image.url),
      width: image.width ?? 1600,
      height: image.height ?? 900,
      isPrimary: image.isPrimary ?? false,
      order: image.order ?? index,
    }));

    // Exactly one primary image, always — the card renderer depends on it.
    if (images.length > 0 && !images.some((image) => image.isPrimary)) {
      images[0].isPrimary = true;
    }

    return {
      images,
      floorPlans: (dto.media?.floorPlans ?? []).map((plan) => ({
        url: plan.url,
        label: plan.label ?? '',
      })),
      videoUrl: dto.media?.videoUrl ?? null,
      tourUrl: dto.media?.tourUrl ?? null,
    };
  }

  /**
   * `https://images.example.com/a/b.jpg` → `external/images.example.com/a/b.jpg`.
   * Prefixed with `external/` so it can never collide with a real bucket key
   * and is obviously not something to hand to `DELETE /uploads`.
   */
  private deriveMediaKey(url: string): string {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/+/, '') || 'image';
      return `external/${parsed.host}/${path}`.slice(0, 400);
    } catch {
      return `external/${createHash('sha1').update(url).digest('hex')}`;
    }
  }

  private async nextReferenceNo(): Promise<string> {
    const latest = await this.propertyModel
      .findOne({ referenceNo: /^TC-\d+$/ })
      .sort({ referenceNo: -1 })
      .select({ referenceNo: 1 })
      .lean<{ referenceNo: string }>()
      .exec();

    const current = latest ? Number.parseInt(latest.referenceNo.replace('TC-', ''), 10) : 1000;
    return `TC-${Number.isFinite(current) ? current + 1 : 1001}`;
  }

  /** Cache invalidation + downstream index refresh after any write. */
  private async afterWrite(
    propertyId: string,
    areaId: string,
    previousSlug?: string,
  ): Promise<void> {
    await this.invalidate(propertyId, previousSlug);
    await this.searchIndex.indexProperty(propertyId);
    await this.areas.syncPropertyCount(areaId).catch(() => undefined);
  }

  private async invalidate(propertyId: string, slug?: string): Promise<void> {
    await this.cache.del(
      cacheKeys.property(propertyId),
      ...(slug ? [cacheKeys.property(slug)] : []),
    );
    await this.cache.delByPattern(cacheKeys.listPattern());
  }
}

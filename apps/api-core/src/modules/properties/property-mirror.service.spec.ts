import { AppException } from '../../common/errors/app.exception';
import { ERROR_CODES } from '../../common/errors/error-codes';
import type { PropertyDocument } from '../../mongo/schemas/property.schema';
import { PropertyMirrorService } from './property-mirror.service';

/**
 * The dual-write compensation path is the one place where MongoDB and Postgres
 * can drift, so it is tested directly rather than through HTTP.
 */
describe('PropertyMirrorService', () => {
  const buildDocument = (overrides: Partial<PropertyDocument> = {}): PropertyDocument =>
    ({
      _id: '65f0000000000000000000aa',
      propertyId: '3ac139d9-4443-5ffe-8d8e-92f400f570f7',
      slug: 'palm-hills-3br',
      price: { amount: 8_500_000, currency: 'EGP', pricePerMeter: 47_222 },
      status: 'available',
      isFeatured: false,
      publishedAt: new Date('2026-01-10T00:00:00.000Z'),
      deletedAt: null,
      compound: { id: 'c-1', name: 'Palm Hills', slug: 'palm-hills' },
      developer: { id: 'd-1', name: 'Palm Hills Developments', slug: 'ph', logoUrl: null },
      location: { areaId: 'a-1' },
      toObject() {
        return this;
      },
      ...overrides,
    }) as unknown as PropertyDocument;

  const buildService = (
    model: Record<string, unknown>,
    prisma: Record<string, unknown>,
  ): PropertyMirrorService =>
    new PropertyMirrorService(
      model as never,
      prisma as never,
    );

  describe('mirrorOf', () => {
    it('projects only the columns the relational mirror owns', () => {
      const service = buildService({}, {});
      const mirror = service.mirrorOf(buildDocument());

      expect(mirror).toEqual({
        id: '3ac139d9-4443-5ffe-8d8e-92f400f570f7',
        mongoId: '65f0000000000000000000aa',
        slug: 'palm-hills-3br',
        compoundId: 'c-1',
        developerId: 'd-1',
        areaId: 'a-1',
        priceMin: 8_500_000,
        status: 'available',
        isFeatured: false,
        publishedAt: new Date('2026-01-10T00:00:00.000Z'),
        deletedAt: null,
      });
    });

    it('tolerates a listing with no compound or developer reference', () => {
      const service = buildService({}, {});
      const mirror = service.mirrorOf(
        buildDocument({ compound: undefined, developer: undefined } as never),
      );

      expect(mirror.compoundId).toBeNull();
      expect(mirror.developerId).toBeNull();
    });
  });

  describe('createWithMirror', () => {
    it('keeps the Mongo document when the Postgres write succeeds', async () => {
      const doc = buildDocument();
      const deleteOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) });
      const create = jest.fn().mockResolvedValue(doc);

      const service = buildService(
        { create, deleteOne },
        { propertyIndex: { create: jest.fn().mockResolvedValue({}) } },
      );

      await expect(service.createWithMirror({})).resolves.toBe(doc);
      expect(deleteOne).not.toHaveBeenCalled();
    });

    it('rolls the Mongo write back when the Postgres mirror fails', async () => {
      const doc = buildDocument();
      const execDelete = jest.fn().mockResolvedValue({});
      const deleteOne = jest.fn().mockReturnValue({ exec: execDelete });

      const service = buildService(
        { create: jest.fn().mockResolvedValue(doc), deleteOne },
        {
          propertyIndex: {
            create: jest.fn().mockRejectedValue(new Error('connection refused')),
          },
        },
      );

      await expect(service.createWithMirror({})).rejects.toBeInstanceOf(AppException);

      // The orphan must be gone — that is the whole point of the compensation.
      expect(deleteOne).toHaveBeenCalledWith({ _id: doc._id });
      expect(execDelete).toHaveBeenCalled();
    });

    it('maps a unique-constraint violation to DUPLICATE_RESOURCE', async () => {
      const service = buildService(
        {
          create: jest.fn().mockResolvedValue(buildDocument()),
          deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
        },
        {
          propertyIndex: {
            create: jest
              .fn()
              .mockRejectedValue(new Error('Unique constraint failed on the fields: (`slug`)')),
          },
        },
      );

      await expect(service.createWithMirror({})).rejects.toMatchObject({
        code: ERROR_CODES.DUPLICATE_RESOURCE,
      });
    });

    it('maps a foreign-key violation to RELATED_RESOURCE_NOT_FOUND', async () => {
      const service = buildService(
        {
          create: jest.fn().mockResolvedValue(buildDocument()),
          deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
        },
        {
          propertyIndex: {
            create: jest.fn().mockRejectedValue(new Error('Foreign key constraint failed')),
          },
        },
      );

      await expect(service.createWithMirror({})).rejects.toMatchObject({
        code: ERROR_CODES.RELATED_RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('softDeleteWithMirror', () => {
    it('restores the Mongo document when the Postgres update fails', async () => {
      const updateOne = jest
        .fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue({ matchedCount: 1 }) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue({ matchedCount: 1 }) });

      const service = buildService(
        { updateOne },
        { propertyIndex: { update: jest.fn().mockRejectedValue(new Error('deadlock')) } },
      );

      await expect(service.softDeleteWithMirror('prop-1')).rejects.toBeInstanceOf(AppException);

      // Second call is the undo: deletedAt back to null.
      expect(updateOne).toHaveBeenNthCalledWith(
        2,
        { propertyId: 'prop-1' },
        { $set: { deletedAt: null } },
      );
    });

    it('404s when the listing does not exist', async () => {
      const service = buildService(
        {
          updateOne: jest
            .fn()
            .mockReturnValue({ exec: jest.fn().mockResolvedValue({ matchedCount: 0 }) }),
        },
        { propertyIndex: { update: jest.fn() } },
      );

      await expect(service.softDeleteWithMirror('missing')).rejects.toMatchObject({
        code: ERROR_CODES.PROPERTY_NOT_FOUND,
      });
    });
  });
});

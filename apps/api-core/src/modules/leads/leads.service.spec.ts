import { AppException } from '../../common/errors/app.exception';
import type { LeadStatusValue } from '../../common/enums';
import { LEAD_TRANSITIONS, LeadsService } from './leads.service';

describe('LeadsService', () => {
  const buildService = (
    prisma: Record<string, unknown> = {},
    properties: Record<string, unknown> = {},
  ): LeadsService =>
    new LeadsService(prisma as never, {
      incrementLeadCount: jest.fn().mockResolvedValue(undefined),
      ...properties,
    } as never);

  describe('honeypot', () => {
    it('accepts and silently drops a submission that fills `company`', async () => {
      const create = jest.fn();
      const service = buildService({ lead: { create }, propertyIndex: { count: jest.fn() } });

      await expect(
        service.create({
          name: 'Bot',
          phone: '+201000000000',
          company: 'spam corp',
        } as never),
      ).resolves.toEqual({ id: null, received: true });

      // The give-away: nothing was written, but the caller cannot tell.
      expect(create).not.toHaveBeenCalled();
    });

    it('stores a genuine submission and bumps the listing counter', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'lead-1' });
      const incrementLeadCount = jest.fn().mockResolvedValue(undefined);

      const service = buildService(
        { lead: { create }, propertyIndex: { count: jest.fn().mockResolvedValue(1) } },
        { incrementLeadCount },
      );

      await expect(
        service.create({
          propertyId: 'prop-1',
          name: 'Ahmed Hassan',
          phone: '+201001234567',
        } as never),
      ).resolves.toEqual({ id: 'lead-1', received: true });

      expect(create).toHaveBeenCalledTimes(1);
      expect(incrementLeadCount).toHaveBeenCalledWith('prop-1');
    });

    it('rejects an enquiry against a listing that does not exist', async () => {
      const service = buildService({
        lead: { create: jest.fn() },
        propertyIndex: { count: jest.fn().mockResolvedValue(0) },
      });

      await expect(
        service.create({
          propertyId: 'nope',
          name: 'Ahmed',
          phone: '+201001234567',
        } as never),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('seller enquiries', () => {
    it('stores the area, compound and unit type a seller picked', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'lead-9' });
      const service = buildService({
        lead: { create },
        propertyIndex: { count: jest.fn() },
        area: { count: jest.fn().mockResolvedValue(1) },
        compound: { count: jest.fn().mockResolvedValue(1) },
      });

      await expect(
        service.create({
          name: 'Mona Saleh',
          phone: '+201009998877',
          areaId: 'area-1',
          compoundId: 'compound-1',
          propertyType: 'villa',
          source: 'sell_page',
        } as never),
      ).resolves.toEqual({ id: 'lead-9', received: true });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            areaId: 'area-1',
            compoundId: 'compound-1',
            propertyType: 'villa',
            source: 'sell_page',
            // A seller has no listing yet, so the enquiry points at no property.
            propertyId: null,
          }),
        }),
      );
    });

    it('rejects a compound that does not exist rather than filing a dangling lead', async () => {
      const create = jest.fn();
      const service = buildService({
        lead: { create },
        propertyIndex: { count: jest.fn() },
        area: { count: jest.fn().mockResolvedValue(1) },
        compound: { count: jest.fn().mockResolvedValue(0) },
      });

      await expect(
        service.create({
          name: 'Mona',
          phone: '+201009998877',
          compoundId: 'ghost',
          source: 'sell_page',
        } as never),
      ).rejects.toBeInstanceOf(AppException);

      expect(create).not.toHaveBeenCalled();
    });

    it('rejects an area that does not exist', async () => {
      const service = buildService({
        lead: { create: jest.fn() },
        propertyIndex: { count: jest.fn() },
        area: { count: jest.fn().mockResolvedValue(0) },
        compound: { count: jest.fn() },
      });

      await expect(
        service.create({
          name: 'Mona',
          phone: '+201009998877',
          areaId: 'ghost',
          source: 'sell_page',
        } as never),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('leaves the seller fields null for an ordinary buyer enquiry', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'lead-10' });
      const service = buildService({
        lead: { create },
        propertyIndex: { count: jest.fn().mockResolvedValue(1) },
        area: { count: jest.fn() },
        compound: { count: jest.fn() },
      });

      await service.create({
        propertyId: 'prop-1',
        name: 'Ahmed',
        phone: '+201001234567',
      } as never);

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            areaId: null,
            compoundId: null,
            propertyType: null,
          }),
        }),
      );
    });
  });

  describe('status transitions', () => {
    const buildForTransition = (from: LeadStatusValue): LeadsService =>
      buildService({
        lead: {
          findUnique: jest.fn().mockResolvedValue({ id: 'l1', status: from, contactedAt: null }),
          update: jest.fn().mockImplementation(({ data }) => ({ id: 'l1', ...data })),
        },
        user: { count: jest.fn().mockResolvedValue(1) },
      });

    it.each([
      ['new', 'contacted'],
      ['contacted', 'viewing'],
      ['qualified', 'negotiating'],
      ['viewing', 'won'],
      ['negotiating', 'lost'],
    ] as [LeadStatusValue, LeadStatusValue][])('allows %s → %s', async (from, to) => {
      await expect(
        buildForTransition(from).update('l1', { status: to } as never),
      ).resolves.toMatchObject({ status: to });
    });

    it.each([
      ['new', 'won'],
      ['new', 'negotiating'],
      ['contacted', 'won'],
      ['won', 'contacted'],
      ['lost', 'new'],
    ] as [LeadStatusValue, LeadStatusValue][])('rejects %s → %s', async (from, to) => {
      await expect(
        buildForTransition(from).update('l1', { status: to } as never),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('stamps contactedAt the first time a lead is contacted', async () => {
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'l1', ...data }));
      const service = buildService({
        lead: {
          findUnique: jest.fn().mockResolvedValue({ id: 'l1', status: 'new', contactedAt: null }),
          update,
        },
        user: { count: jest.fn().mockResolvedValue(1) },
      });

      await service.update('l1', { status: 'contacted' } as never);

      expect(update.mock.calls[0][0].data.contactedAt).toBeInstanceOf(Date);
    });

    it('does not overwrite an existing contactedAt', async () => {
      const contactedAt = new Date('2026-01-01T00:00:00.000Z');
      const update = jest.fn().mockImplementation(({ data }) => ({ id: 'l1', ...data }));

      const service = buildService({
        lead: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'l1', status: 'contacted', contactedAt }),
          update,
        },
        user: { count: jest.fn().mockResolvedValue(1) },
      });

      await service.update('l1', { status: 'qualified' } as never);

      expect(update.mock.calls[0][0].data.contactedAt).toBeUndefined();
    });

    it('refuses to assign a lead to a non-agent', async () => {
      const service = buildService({
        lead: {
          findUnique: jest.fn().mockResolvedValue({ id: 'l1', status: 'new', contactedAt: null }),
          update: jest.fn(),
        },
        user: { count: jest.fn().mockResolvedValue(0) },
      });

      await expect(
        service.update('l1', { assignedToId: 'some-buyer' } as never),
      ).rejects.toBeInstanceOf(AppException);
    });
  });

  describe('LEAD_TRANSITIONS', () => {
    it('treats won and lost as terminal', () => {
      expect(LEAD_TRANSITIONS.won).toHaveLength(0);
      expect(LEAD_TRANSITIONS.lost).toHaveLength(0);
    });

    it('lets every non-terminal status be abandoned', () => {
      for (const [status, allowed] of Object.entries(LEAD_TRANSITIONS)) {
        if (allowed.length > 0) {
          expect(allowed).toContain('lost');
        }
      }
    });
  });
});

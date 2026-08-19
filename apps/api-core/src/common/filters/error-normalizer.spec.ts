import { ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';

import { AppException } from '../errors/app.exception';
import { ERROR_CODES } from '../errors/error-codes';
import { normalizeException } from './error-normalizer';

describe('normalizeException', () => {
  it('keeps the code carried by an AppException', () => {
    const result = normalizeException(
      AppException.notFound('Property not found', ERROR_CODES.PROPERTY_NOT_FOUND),
    );

    expect(result).toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: 'PROPERTY_NOT_FOUND',
      message: 'Property not found',
      details: [],
    });
  });

  it('derives a code from the status for plain Nest exceptions', () => {
    expect(normalizeException(new ForbiddenException())).toMatchObject({
      status: HttpStatus.FORBIDDEN,
      code: ERROR_CODES.FORBIDDEN,
    });

    expect(normalizeException(new NotFoundException('Nothing here'))).toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: ERROR_CODES.NOT_FOUND,
      message: 'Nothing here',
    });
  });

  it('maps a Prisma unique constraint violation to 409 DUPLICATE_RESOURCE', () => {
    const result = normalizeException({
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      clientVersion: '6.3.1',
      message: 'Unique constraint failed',
      meta: { target: ['email'] },
    });

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.code).toBe(ERROR_CODES.DUPLICATE_RESOURCE);
    expect(result.details).toEqual([{ field: 'email', message: 'must be unique', rule: 'unique' }]);
  });

  it('maps a Prisma missing record to 404', () => {
    const result = normalizeException({
      name: 'PrismaClientKnownRequestError',
      code: 'P2025',
      clientVersion: '6.3.1',
      message: 'Record not found',
      meta: { cause: 'Record to update not found.' },
    });

    expect(result.status).toBe(HttpStatus.NOT_FOUND);
    expect(result.message).toBe('Record to update not found.');
  });

  it('maps a Mongo duplicate key error to 409', () => {
    const result = normalizeException({
      name: 'MongoServerError',
      code: 11000,
      keyValue: { slug: 'palm-hills-new-cairo-3br' },
    });

    expect(result.status).toBe(HttpStatus.CONFLICT);
    expect(result.code).toBe(ERROR_CODES.DUPLICATE_RESOURCE);
  });

  it('maps a Mongoose validation error to 422 with per-field details', () => {
    const result = normalizeException({
      name: 'ValidationError',
      errors: {
        'price.amount': {
          path: 'price.amount',
          message: 'Path `amount` is required.',
          kind: 'required',
        },
      },
    });

    expect(result.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(result.code).toBe(ERROR_CODES.VALIDATION_ERROR);
    expect(result.details[0]).toMatchObject({ field: 'price.amount', rule: 'required' });
  });

  it('maps an expired JWT to 401 TOKEN_EXPIRED', () => {
    const result = normalizeException({ name: 'TokenExpiredError', message: 'jwt expired' });

    expect(result.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(result.code).toBe(ERROR_CODES.TOKEN_EXPIRED);
  });

  it('falls back to a 500 for unknown values', () => {
    const result = normalizeException(new Error('boom'));

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.code).toBe(ERROR_CODES.INTERNAL_SERVER_ERROR);
    expect(result.message).toBe('Unexpected server error');
  });
});

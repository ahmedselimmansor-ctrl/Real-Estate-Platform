import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import { TransformInterceptor } from './transform.interceptor';

const executionContext = (): ExecutionContext =>
  ({
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  }) as unknown as ExecutionContext;

const callHandler = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('TransformInterceptor', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const interceptor = new TransformInterceptor(reflector);

  beforeEach(() => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
  });

  it('wraps a plain payload in the success envelope', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(executionContext(), callHandler({ id: 'abc' })),
    );

    expect(result).toEqual({ success: true, data: { id: 'abc' } });
  });

  it('lifts { data, meta } into the paginated envelope', async () => {
    const payload = {
      data: [{ id: 'a' }],
      meta: { page: 1, limit: 20, total: 134, totalPages: 7 },
    };

    const result = await lastValueFrom(
      interceptor.intercept(executionContext(), callHandler(payload)),
    );

    expect(result).toEqual({
      success: true,
      data: payload.data,
      meta: payload.meta,
    });
  });

  it('turns undefined into a null payload', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(executionContext(), callHandler(undefined)),
    );

    expect(result).toEqual({ success: true, data: null });
  });

  it('leaves an existing envelope untouched', async () => {
    const envelope = { success: false, error: { code: 'X', message: 'y', details: [] } };

    const result = await lastValueFrom(
      interceptor.intercept(executionContext(), callHandler(envelope)),
    );

    expect(result).toBe(envelope);
  });

  it('skips handlers marked with @SkipResponseTransform()', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const payload = { status: 'ok', service: 'api-core' };

    const result = await lastValueFrom(
      interceptor.intercept(executionContext(), callHandler(payload)),
    );

    expect(result).toBe(payload);
  });
});

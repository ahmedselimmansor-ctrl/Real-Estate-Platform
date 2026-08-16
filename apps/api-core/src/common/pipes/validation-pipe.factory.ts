import { ValidationError, ValidationPipe } from '@nestjs/common';

import { AppException } from '../errors/app.exception';
import { ApiErrorDetail } from '../types/api-response';

/** Flattens nested class-validator errors into CONTRACT §4 `error.details`. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ApiErrorDetail[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own: ApiErrorDetail[] = Object.entries(error.constraints ?? {}).map(
      ([rule, message]) => ({ field: path, message, rule }),
    );
    const children = error.children?.length ? flattenValidationErrors(error.children, path) : [];
    return [...own, ...children];
  });
}

/**
 * Global validation pipe.
 *
 * - `whitelist` + `forbidNonWhitelisted`: unknown properties are rejected.
 * - `transform`: query/body payloads become real DTO instances (defaults apply).
 * - failures become `422 VALIDATION_ERROR`, matching the FastAPI services.
 */
export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    stopAtFirstError: false,
    exceptionFactory: (errors: ValidationError[]) =>
      AppException.validation('Request validation failed', flattenValidationErrors(errors)),
  });

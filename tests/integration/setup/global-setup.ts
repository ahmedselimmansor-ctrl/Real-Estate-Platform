import type { GlobalSetupContext } from 'vitest/node';

import { ACCOUNTS, BASE_URL, call, login } from './client';

/**
 * Refuse to run against a stack that is not ready.
 *
 * A suite that silently passes because the data was never seeded is worse than
 * no suite, so this asserts the preconditions up front with a message that says
 * exactly which command fixes it.
 *
 * It also signs in once for each role and hands the tokens to every spec.
 * Vitest isolates module state per file, so a cache inside client.ts is rebuilt
 * for each one — which had the suite logging in twenty-odd times a minute and
 * tripping the very auth rate limit it exists to verify. Three logins for the
 * whole run, done here, is both faster and the only version that does not
 * measure the limiter by accident.
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const services = ['nginx', 'web', 'api-core', 'search-svc', 'rag-svc', 'reports-svc'];

  const unhealthy: string[] = [];
  for (const service of services) {
    const result = await call(`/__health/${service}`).catch(() => null);
    if (!result || result.status !== 200) unhealthy.push(`${service} (${result?.status ?? 'unreachable'})`);
  }

  if (unhealthy.length) {
    throw new Error(
      `The stack at ${BASE_URL} is not healthy: ${unhealthy.join(', ')}.\n` +
        'Start it with `make up` and wait for `make health` to go green.',
    );
  }

  const properties = await call<unknown[]>('/api/v1/properties?limit=1');
  const total = properties.body.meta?.total ?? 0;
  if (total < 1) {
    throw new Error(
      'The catalogue is empty — these tests assert against seeded data.\nRun `make seed`.',
    );
  }

  const search = await call<{ results: unknown[] }>('/api/search?limit=1');
  if (search.status !== 200) {
    throw new Error(`search-svc returned ${search.status}: ${search.raw.slice(0, 200)}`);
  }
  if (!search.body.meta?.total) {
    throw new Error(
      'The Elasticsearch index is empty while Mongo has listings.\nRun `make reindex`.',
    );
  }

  // Sequential, not Promise.all: three logins at once against a 20/min bucket
  // with a burst of 10 is fine, but doing it in a burst leaves less headroom
  // for a re-run that starts while the previous window is still open.
  const roleTokens = {
    admin: await login(ACCOUNTS.admin),
    agent: await login(ACCOUNTS.agent),
    user: await login(ACCOUNTS.user),
  };
  provide('tokens', roleTokens);

  // eslint-disable-next-line no-console
  console.log(
    `\n  integration target: ${BASE_URL}  (${total} listings, ${search.body.meta.total} indexed)\n`,
  );
}

declare module 'vitest' {
  interface ProvidedContext {
    tokens: { admin: string; agent: string; user: string };
  }
}

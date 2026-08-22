# Integration tests

Black-box tests against a **running, seeded** TopChoice stack. Nothing is
mocked — every request goes over TLS through the real nginx edge to the real
services and their real data stores.

```bash
make up && make health     # the stack must be green first
make test-integration
```

## What these are for

Each service already has its own unit suite, and those cover the logic inside a
process. These cover the seams between processes, which is where the bugs the
unit tests structurally cannot see actually live:

- a search hit whose slug does not resolve in the catalogue (the Mongo ↔
  Elasticsearch seam)
- the index quietly drifting from the published listing count
- a lead created through the public endpoint that staff cannot then see
- 401 versus 403, which only means anything with real tokens and real roles
- the brochure accepting all four documented identifiers against real data
- rate limits, security headers and the error envelope, which are nginx's job
  and therefore belong to no service's own tests

## Preconditions are asserted, not assumed

`setup/global-setup.ts` refuses to run if the stack is unhealthy, the catalogue
is empty or the search index is empty, and it names the command that fixes each
case. A suite that passes because there was no data to contradict it is worse
than no suite at all.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `INTEGRATION_BASE_URL` | `https://localhost` | Target stack |
| `INTEGRATION_DEMO_PASSWORD` | `TopChoice@Demo123` | Seeded account password |
| `INTEGRATION_ADMIN_EMAIL` | `admin@topchoice.local` | Staff fixture |
| `INTEGRATION_AGENT_EMAIL` | `agent@topchoice.local` | Agent fixture |
| `INTEGRATION_USER_EMAIL` | `buyer@topchoice.local` | Buyer fixture |

The stack's certificate is self-signed, so the client disables verification
unless `NODE_EXTRA_CA_CERTS` is set. Point that at the CA instead when running
against anything real.

## Conventions

**Assert invariants, not fixture values.** `totalPages === ceil(total / limit)`
survives someone adding a listing; `total === 180` does not.

**Clean up.** Specs that create favourites remove them, so a re-run against the
same stack behaves the same as the first run.

**Single-threaded.** Several specs assert against rate limits and against counts
that concurrent specs would perturb.

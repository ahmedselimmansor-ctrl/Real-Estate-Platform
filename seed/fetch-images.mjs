/**
 * Downloads real property photography from Unsplash into
 * `apps/web/public/properties/` so the app ships with genuine images instead of
 * generated placeholders.
 *
 *   node seed/fetch-images.mjs
 *
 * Photos are served under the Unsplash License (free for commercial and
 * non-commercial use, no permission needed). `CREDITS.md` is written alongside
 * them recording the source of every file.
 *
 * Each entry is tagged with the room/exterior it shows so `generate.mjs` can
 * assign a plausible gallery per property type rather than a random jumble.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'apps', 'web', 'public', 'properties');

/** `category` drives which listings a photo can appear on. */
const PHOTOS = [
  // --- apartment / general interior -------------------------------------
  ['1512917774080-9991f1c4c750', 'exterior', 'House exterior'],
  ['1568605114967-8130f3a36994', 'exterior', 'Modern house facade'],
  ['1600596542815-ffad4c1539a9', 'living', 'Bright living room'],
  ['1600585154340-be6161a56a0c', 'exterior', 'Contemporary home'],
  ['1600607687939-ce8a6c25118c', 'living', 'Open-plan interior'],
  ['1600566753086-00f18fb6b3ea', 'bedroom', 'Bedroom with linen bedding'],
  ['1600210492486-724fe5c67fb0', 'bathroom', 'Modern bathroom'],
  ['1600607687920-4e2a09cf159d', 'kitchen', 'Fitted kitchen'],
  ['1600566752355-35792bedcfea', 'bedroom', 'Minimal bedroom'],
  ['1600573472550-8090b5e0745e', 'bathroom', 'Stone bathroom'],
  ['1600121848594-d8644e57abab', 'kitchen', 'Kitchen island'],
  ['1522708323590-d24dbb6b0267', 'living', 'Living room with sofa'],
  ['1493809842364-78817add7ffb', 'living', 'Lounge seating'],
  ['1484154218962-a197022b5858', 'kitchen', 'White kitchen'],
  ['1560448204-e02f11c3d0e2', 'living', 'Sunlit lounge'],
  ['1502672260266-1c1ef2d93688', 'living', 'Styled interior'],
  ['1523217582562-09d0def993a6', 'bedroom', 'Bedroom with window'],
  ['1616486338812-3dadae4b4ace', 'exterior', 'Apartment block'],
  ['1545324418-cc1a3fa10c00', 'exterior', 'Residential building'],
  ['1460317442991-0ec209397118', 'exterior', 'Apartment facade'],

  // --- villa / townhouse -------------------------------------------------
  ['1613490493576-7fde63acd811', 'villa', 'Modern villa at dusk'],
  ['1613977257363-707ba9348227', 'villa', 'Villa with pool'],
  ['1600047509807-ba8f99d2cdde', 'villa', 'Villa exterior'],
  ['1580587771525-78b9dba3b914', 'villa', 'Family house'],
  ['1570129477492-45c003edd2be', 'villa', 'Suburban home'],
  ['1600585154526-990dced4db0d', 'villa', 'House with driveway'],
  ['1512915922686-57c11dde9b6b', 'villa', 'Detached house'],
  ['1583608205776-bfd35f0d9f83', 'pool', 'Swimming pool'],
  ['1571003123894-1f0594d2b5d9', 'pool', 'Pool terrace'],
  ['1600607688969-a5bfcd646154', 'garden', 'Landscaped garden'],

  // --- chalet / coastal --------------------------------------------------
  ['1540541338287-41700207dee6', 'coastal', 'Beach house'],
  ['1499793983690-e29da59ef1c2', 'coastal', 'Seaside terrace'],
  ['1519974719765-e6559eac2575', 'coastal', 'Coastal view'],
  ['1505142468610-359e7d316be0', 'coastal', 'Beachfront'],
  ['1439066615861-d1af74d74000', 'coastal', 'Sea view'],

  // --- commercial --------------------------------------------------------
  ['1497366216548-37526070297c', 'office', 'Open-plan office'],
  ['1497366811353-6870744d04b2', 'office', 'Office workspace'],
  ['1524758631624-e2822e304c36', 'office', 'Meeting area'],
  ['1541746972996-4e0b0f43e02a', 'office', 'Office lounge'],
  ['1497215728101-856f4ea42174', 'office', 'Desks and glass'],
];

const WIDTH = 1600;
const QUALITY = 80;

async function download(id, index) {
  const url = `https://images.unsplash.com/photo-${id}?w=${WIDTH}&q=${QUALITY}&auto=format&fit=crop`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  // A CDN error page would be tiny; a real photo at 1600px never is.
  if (buffer.length < 20_000) {
    throw new Error(`suspiciously small (${buffer.length} bytes)`);
  }

  const filename = `property-${String(index + 1).padStart(2, '0')}.jpg`;
  await writeFile(join(OUT_DIR, filename), buffer);
  return { filename, bytes: buffer.length };
}

async function main() {
  if (!existsSync(OUT_DIR)) {
    await mkdir(OUT_DIR, { recursive: true });
  }

  const manifest = [];
  const failures = [];

  for (const [index, [id, category, label]] of PHOTOS.entries()) {
    try {
      const { filename, bytes } = await download(id, index);
      manifest.push({ file: `/properties/${filename}`, category, label, unsplashId: id });
      process.stdout.write(`  ✓ ${filename}  ${category.padEnd(8)} ${(bytes / 1024).toFixed(0)} KB\n`);
    } catch (error) {
      failures.push({ id, reason: error.message });
      process.stdout.write(`  ✗ photo-${id}: ${error.message}\n`);
    }
  }

  await writeFile(
    join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const credits = [
    '# Photo credits',
    '',
    'Property photography in this project comes from [Unsplash](https://unsplash.com)',
    'and is used under the [Unsplash License](https://unsplash.com/license):',
    'free to use for commercial and non-commercial purposes, no permission needed.',
    '',
    'Regenerate with `node seed/fetch-images.mjs`.',
    '',
    '| File | Shows | Source |',
    '| --- | --- | --- |',
    ...manifest.map(
      (entry) =>
        `| \`${entry.file}\` | ${entry.label} | https://unsplash.com/photos/${entry.unsplashId} |`,
    ),
    '',
  ].join('\n');

  await writeFile(join(OUT_DIR, 'CREDITS.md'), credits, 'utf8');

  process.stdout.write(
    `\n${manifest.length}/${PHOTOS.length} photos saved to apps/web/public/properties/\n`,
  );
  if (failures.length > 0) {
    process.stdout.write(`${failures.length} failed: ${failures.map((f) => f.id).join(', ')}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`fetch-images failed: ${error.stack ?? error}\n`);
  process.exitCode = 1;
});

/**
 * Tuning tables for the 180 generated listings: the type mix, the spec envelope
 * for each property type, and the multipliers that turn an area's
 * `avgPricePerMeter` into a unit price.
 */

/**
 * Type mix — sums to exactly 180.
 * apartment 55% · villa 15% · townhouse 12% · twinhouse 8% · chalet 5% · other 5%
 */
export const TYPE_MIX = [
  ['apartment', 99],
  ['villa', 27],
  ['townhouse', 22],
  ['twinhouse', 14],
  ['chalet', 9],
  ['duplex', 2],
  ['penthouse', 2],
  ['studio', 2],
  ['office', 1],
  ['retail', 1],
  ['clinic', 1],
];

export const TOTAL_PROPERTIES = TYPE_MIX.reduce((sum, [, count]) => sum + count, 0);

/**
 * Per-type specification envelope.
 *   bedrooms       weighted [value, weight] pairs
 *   areaPerBedroom m² contributed by each bedroom
 *   areaBonus      [min, max] extra m² on top
 *   areaClamp      [min, max] hard bounds
 *   floors         [min, max] floor number (null → always 0, e.g. villas)
 *   parking        [min, max]
 *   garden         [min, max] garden m² when the unit has one (null → never)
 *   bathroomBonus  bathrooms = bedrooms + this (min 1)
 */
export const TYPE_SPECS = {
  apartment: {
    bedrooms: [[1, 6], [2, 30], [3, 45], [4, 19]],
    areaPerBedroom: 52,
    areaBonus: [10, 45],
    areaClamp: [85, 240],
    floors: [0, 9],
    parking: [1, 2],
    garden: [30, 95],
    bathroomBonus: 0,
  },
  studio: {
    bedrooms: [[1, 1]],
    areaPerBedroom: 0,
    areaBonus: [45, 75],
    areaClamp: [45, 75],
    floors: [0, 9],
    parking: [0, 1],
    garden: null,
    bathroomBonus: 0,
  },
  duplex: {
    bedrooms: [[3, 60], [4, 40]],
    areaPerBedroom: 62,
    areaBonus: [15, 80],
    areaClamp: [180, 330],
    floors: [0, 8],
    parking: [1, 2],
    garden: [40, 120],
    bathroomBonus: 1,
  },
  penthouse: {
    bedrooms: [[3, 55], [4, 45]],
    areaPerBedroom: 66,
    areaBonus: [20, 90],
    areaClamp: [200, 360],
    floors: [6, 12],
    parking: [2, 2],
    garden: null,
    bathroomBonus: 1,
  },
  chalet: {
    bedrooms: [[1, 20], [2, 45], [3, 35]],
    areaPerBedroom: 42,
    areaBonus: [25, 65],
    areaClamp: [70, 175],
    floors: [0, 3],
    parking: [1, 1],
    garden: [20, 70],
    bathroomBonus: 0,
  },
  townhouse: {
    bedrooms: [[3, 55], [4, 45]],
    areaPerBedroom: 58,
    areaBonus: [20, 70],
    areaClamp: [195, 300],
    floors: null,
    parking: [2, 2],
    garden: [50, 160],
    bathroomBonus: 1,
  },
  twinhouse: {
    bedrooms: [[4, 80], [5, 20]],
    areaPerBedroom: 55,
    areaBonus: [30, 90],
    areaClamp: [245, 340],
    floors: null,
    parking: [2, 3],
    garden: [70, 220],
    bathroomBonus: 1,
  },
  villa: {
    bedrooms: [[4, 45], [5, 35], [6, 20]],
    areaPerBedroom: 68,
    areaBonus: [40, 140],
    areaClamp: [300, 600],
    floors: null,
    parking: [2, 4],
    garden: [120, 450],
    bathroomBonus: 1,
  },
  office: {
    bedrooms: [[0, 1]],
    areaPerBedroom: 0,
    areaBonus: [60, 200],
    areaClamp: [60, 200],
    floors: [1, 12],
    parking: [1, 3],
    garden: null,
    bathroomBonus: 2,
  },
  retail: {
    bedrooms: [[0, 1]],
    areaPerBedroom: 0,
    areaBonus: [50, 180],
    areaClamp: [50, 180],
    floors: [0, 1],
    parking: [1, 2],
    garden: null,
    bathroomBonus: 1,
  },
  clinic: {
    bedrooms: [[0, 1]],
    areaPerBedroom: 0,
    areaBonus: [60, 120],
    areaClamp: [60, 120],
    floors: [1, 6],
    parking: [1, 2],
    garden: null,
    bathroomBonus: 2,
  },
};

/** Price-per-metre multiplier by property type, relative to the area benchmark. */
export const TYPE_PRICE_FACTOR = {
  apartment: 1.0,
  studio: 1.05,
  duplex: 1.02,
  penthouse: 1.25,
  chalet: 1.15,
  townhouse: 1.15,
  twinhouse: 1.22,
  villa: 1.35,
  office: 1.3,
  retail: 1.85,
  clinic: 1.5,
};

/** Price-per-metre multiplier by finishing level. */
export const FINISHING_PRICE_FACTOR = {
  core_shell: 0.88,
  semi_finished: 0.95,
  fully_finished: 1.06,
  furnished: 1.15,
};

/** Finishing mix for residential vs coastal vs commercial units. */
export const FINISHING_WEIGHTS = {
  default: [['core_shell', 8], ['semi_finished', 32], ['fully_finished', 45], ['furnished', 15]],
  coastal: [['core_shell', 2], ['semi_finished', 10], ['fully_finished', 48], ['furnished', 40]],
  commercial: [['core_shell', 45], ['semi_finished', 35], ['fully_finished', 20]],
};

/**
 * Sale type mix. Compounds that have already handed over trade far more on the
 * resale market. Rent is intentionally absent — see seed/README.md.
 */
export const SALE_TYPE_WEIGHTS = {
  deliveredCompound: [['primary', 55], ['resale', 45]],
  underConstruction: [['primary', 86], ['resale', 14]],
};

/**
 * Status mix. `delivered` is only reachable when the unit's own delivery date is
 * already in the past relative to the dataset anchor, and `off_plan` only when
 * it is still in the future — otherwise listings would contradict themselves.
 */
export const STATUS_WEIGHTS = {
  futureDelivery: {
    primary: [['off_plan', 70], ['available', 22], ['reserved', 8]],
    resale: [['off_plan', 45], ['available', 40], ['reserved', 10], ['sold', 5]],
  },
  pastDelivery: {
    primary: [['available', 55], ['delivered', 25], ['reserved', 12], ['sold', 8]],
    resale: [['available', 62], ['delivered', 26], ['reserved', 8], ['sold', 4]],
  },
};

export const PRICE_FLOOR = 2_000_000;
export const PRICE_CEILING = 95_000_000;

/** Number of listings flagged `isFeatured` (~12% of 180). */
export const FEATURED_COUNT = 22;

/** Areas whose compounds are coastal (chalets, beach copy, seasonal framing). */
export const COASTAL_AREA_SLUGS = ['north-coast', 'ain-sokhna', 'ras-el-hekma'];

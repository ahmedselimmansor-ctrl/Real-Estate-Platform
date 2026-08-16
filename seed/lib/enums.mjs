/**
 * Canonical enum values — copied verbatim from docs/CONTRACT.md §3.
 * Never introduce a value that is not in these lists.
 */
export const PROPERTY_TYPES = [
  'apartment',
  'villa',
  'townhouse',
  'twinhouse',
  'duplex',
  'penthouse',
  'studio',
  'chalet',
  'office',
  'retail',
  'clinic',
];

export const SALE_TYPES = ['primary', 'resale', 'rent'];
export const STATUSES = ['available', 'reserved', 'sold', 'off_plan', 'delivered'];
export const FINISHINGS = ['core_shell', 'semi_finished', 'fully_finished', 'furnished'];
export const AMENITY_CATEGORIES = ['lifestyle', 'security', 'wellness', 'family', 'services'];

/** Bilingual display labels used when composing listing copy. */
export const PROPERTY_TYPE_LABELS = {
  apartment: { en: 'Apartment', ar: 'شقة', enPlural: 'apartments', arIndef: 'شقة' },
  villa: { en: 'Standalone Villa', ar: 'فيلا مستقلة', enPlural: 'villas', arIndef: 'فيلا' },
  townhouse: { en: 'Townhouse', ar: 'تاون هاوس', enPlural: 'townhouses', arIndef: 'تاون هاوس' },
  twinhouse: { en: 'Twin House', ar: 'توين هاوس', enPlural: 'twin houses', arIndef: 'توين هاوس' },
  duplex: { en: 'Duplex', ar: 'دوبلكس', enPlural: 'duplexes', arIndef: 'دوبلكس' },
  penthouse: { en: 'Penthouse', ar: 'بنتهاوس', enPlural: 'penthouses', arIndef: 'بنتهاوس' },
  studio: { en: 'Studio', ar: 'استوديو', enPlural: 'studios', arIndef: 'استوديو' },
  chalet: { en: 'Chalet', ar: 'شاليه', enPlural: 'chalets', arIndef: 'شاليه' },
  office: { en: 'Office Space', ar: 'مكتب إداري', enPlural: 'offices', arIndef: 'مكتب إداري' },
  retail: { en: 'Retail Shop', ar: 'محل تجاري', enPlural: 'shops', arIndef: 'محل تجاري' },
  clinic: { en: 'Medical Clinic', ar: 'عيادة', enPlural: 'clinics', arIndef: 'عيادة' },
};

export const FINISHING_LABELS = {
  core_shell: {
    en: 'core & shell',
    ar: 'على الطوب الأحمر',
    enPhrase: 'on core & shell',
    arPhrase: 'على الطوب الأحمر',
  },
  semi_finished: {
    en: 'semi finished',
    ar: 'نصف تشطيب',
    enPhrase: 'semi finished',
    arPhrase: 'نصف تشطيب',
  },
  fully_finished: {
    en: 'fully finished',
    ar: 'تشطيب كامل',
    enPhrase: 'fully finished',
    arPhrase: 'بتشطيب كامل',
  },
  furnished: {
    en: 'fully finished with furniture',
    ar: 'مفروش بالكامل',
    enPhrase: 'fully finished and furnished',
    arPhrase: 'مفروش بالكامل',
  },
};

export const STATUS_LABELS = {
  available: { en: 'available', ar: 'متاحة' },
  reserved: { en: 'reserved', ar: 'محجوزة' },
  sold: { en: 'sold', ar: 'تم بيعها' },
  off_plan: { en: 'off plan', ar: 'تحت الإنشاء' },
  delivered: { en: 'delivered', ar: 'تم التسليم' },
};

/** Commercial unit types have no bedrooms. */
export const COMMERCIAL_TYPES = ['office', 'retail', 'clinic'];

import {
  ArrowDown,
  ArrowUp,
  Baby,
  BadgeCheck,
  Ban,
  Blocks,
  Briefcase,
  Building,
  Building2,
  Car,
  Clock,
  Crown,
  DoorOpen,
  Droplets,
  Dumbbell,
  Eye,
  Facebook,
  Fence,
  Flame,
  Flower2,
  Footprints,
  GraduationCap,
  Hammer,
  Handshake,
  HardHat,
  Home as HomeIcon,
  Hotel,
  Instagram,
  Landmark,
  Laptop,
  Layers,
  LifeBuoy,
  Linkedin,
  MapPin,
  Maximize2,
  Moon,
  PackageCheck,
  Paintbrush,
  PhoneCall,
  Repeat,
  ShieldCheck,
  ShoppingBag,
  Sofa,
  Sparkles,
  Stethoscope,
  Store,
  Tag,
  Tent,
  ThumbsDown,
  Trees,
  Trophy,
  Umbrella,
  UserCheck,
  Users,
  Video,
  Waves,
  Wifi,
  Wrench,
  Youtube,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type {
  Finishing,
  LeadStatus,
  Locale,
  PropertyStatus,
  PropertyType,
  SaleType,
  SearchSort,
} from '@/types/enums';

/* ========================================================================== */
/*  Brand                                                                     */
/* ========================================================================== */

export const BRAND = {
  name: 'TopChoice',
  nameAr: 'توب تشويس',
  tagline: {
    en: 'Egypt’s smartest way to buy a home',
    ar: 'أذكى طريقة لشراء منزلك في مصر',
  },
  phone: '+20 105 000 0000',
  whatsapp: '+20 105 000 0000',
  email: 'hello@topchoice.local',
  address: {
    en: 'Cairo Festival City, New Cairo, Egypt',
    ar: 'كايرو فستيفال سيتي، القاهرة الجديدة، مصر',
  },
} as const;

export const SOCIAL_LINKS = [
  { href: 'https://facebook.com', label: 'Facebook', icon: Facebook },
  { href: 'https://instagram.com', label: 'Instagram', icon: Instagram },
  { href: 'https://linkedin.com', label: 'LinkedIn', icon: Linkedin },
  { href: 'https://youtube.com', label: 'YouTube', icon: Youtube },
] as const;

/* ========================================================================== */
/*  Enum options (CONTRACT §3) — EN + AR labels + lucide icons                */
/* ========================================================================== */

export interface EnumOption<T extends string> {
  value: T;
  labelEn: string;
  labelAr: string;
  icon: LucideIcon;
  /** Optional plural used in result headers ("124 Apartments"). */
  pluralEn?: string;
  pluralAr?: string;
  /** Semantic tone for badges. */
  tone?: 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'featured';
}

export const PROPERTY_TYPE_OPTIONS: ReadonlyArray<EnumOption<PropertyType>> = [
  { value: 'apartment', labelEn: 'Apartment', labelAr: 'شقة', pluralEn: 'Apartments', pluralAr: 'شقق', icon: Building2 },
  { value: 'villa', labelEn: 'Villa', labelAr: 'فيلا', pluralEn: 'Villas', pluralAr: 'فيلات', icon: HomeIcon },
  { value: 'townhouse', labelEn: 'Townhouse', labelAr: 'تاون هاوس', pluralEn: 'Townhouses', pluralAr: 'تاون هاوس', icon: Building },
  { value: 'twinhouse', labelEn: 'Twinhouse', labelAr: 'توين هاوس', pluralEn: 'Twinhouses', pluralAr: 'توين هاوس', icon: Hotel },
  { value: 'duplex', labelEn: 'Duplex', labelAr: 'دوبلكس', pluralEn: 'Duplexes', pluralAr: 'دوبلكس', icon: Layers },
  { value: 'penthouse', labelEn: 'Penthouse', labelAr: 'بنتهاوس', pluralEn: 'Penthouses', pluralAr: 'بنتهاوس', icon: Crown },
  { value: 'studio', labelEn: 'Studio', labelAr: 'استوديو', pluralEn: 'Studios', pluralAr: 'استوديوهات', icon: DoorOpen },
  { value: 'chalet', labelEn: 'Chalet', labelAr: 'شاليه', pluralEn: 'Chalets', pluralAr: 'شاليهات', icon: Tent },
  { value: 'office', labelEn: 'Office', labelAr: 'مكتب', pluralEn: 'Offices', pluralAr: 'مكاتب', icon: Briefcase },
  { value: 'retail', labelEn: 'Retail', labelAr: 'محل تجاري', pluralEn: 'Retail units', pluralAr: 'محلات', icon: Store },
  { value: 'clinic', labelEn: 'Clinic', labelAr: 'عيادة', pluralEn: 'Clinics', pluralAr: 'عيادات', icon: Stethoscope },
];

export const SALE_TYPE_OPTIONS: ReadonlyArray<EnumOption<SaleType>> = [
  { value: 'primary', labelEn: 'Primary', labelAr: 'أولي', icon: Sparkles, tone: 'info' },
  { value: 'resale', labelEn: 'Resale', labelAr: 'إعادة بيع', icon: Repeat, tone: 'default' },
  { value: 'rent', labelEn: 'Rent', labelAr: 'إيجار', icon: HomeIcon, tone: 'default' },
];

export const PROPERTY_STATUS_OPTIONS: ReadonlyArray<EnumOption<PropertyStatus>> = [
  { value: 'available', labelEn: 'Available', labelAr: 'متاحة', icon: BadgeCheck, tone: 'success' },
  { value: 'reserved', labelEn: 'Reserved', labelAr: 'محجوزة', icon: Clock, tone: 'warning' },
  { value: 'sold', labelEn: 'Sold', labelAr: 'مباعة', icon: Ban, tone: 'destructive' },
  { value: 'off_plan', labelEn: 'Off plan', labelAr: 'تحت الإنشاء', icon: HardHat, tone: 'info' },
  { value: 'delivered', labelEn: 'Delivered', labelAr: 'تم التسليم', icon: PackageCheck, tone: 'success' },
];

export const FINISHING_OPTIONS: ReadonlyArray<EnumOption<Finishing>> = [
  { value: 'core_shell', labelEn: 'Core & shell', labelAr: 'على المحارة', icon: Hammer },
  { value: 'semi_finished', labelEn: 'Semi finished', labelAr: 'نصف تشطيب', icon: Paintbrush },
  { value: 'fully_finished', labelEn: 'Fully finished', labelAr: 'تشطيب كامل', icon: Sparkles },
  { value: 'furnished', labelEn: 'Furnished', labelAr: 'مفروشة', icon: Sofa },
];

export const LEAD_STATUS_OPTIONS: ReadonlyArray<EnumOption<LeadStatus>> = [
  { value: 'new', labelEn: 'New', labelAr: 'جديد', icon: Sparkles, tone: 'info' },
  { value: 'contacted', labelEn: 'Contacted', labelAr: 'تم التواصل', icon: PhoneCall, tone: 'default' },
  { value: 'qualified', labelEn: 'Qualified', labelAr: 'مؤهل', icon: UserCheck, tone: 'info' },
  { value: 'viewing', labelEn: 'Viewing', labelAr: 'معاينة', icon: Eye, tone: 'warning' },
  { value: 'negotiating', labelEn: 'Negotiating', labelAr: 'تفاوض', icon: Handshake, tone: 'warning' },
  { value: 'won', labelEn: 'Won', labelAr: 'تم البيع', icon: Trophy, tone: 'success' },
  { value: 'lost', labelEn: 'Lost', labelAr: 'خسارة', icon: ThumbsDown, tone: 'destructive' },
];

/** Resolve the localized label for any enum option list. */
export function getEnumLabel<T extends string>(
  options: ReadonlyArray<EnumOption<T>>,
  value: T | null | undefined,
  locale: Locale = 'en',
): string {
  if (!value) return '-';
  const option = options.find((entry) => entry.value === value);
  if (!option) return value;
  return locale === 'ar' ? option.labelAr : option.labelEn;
}

export function getEnumOption<T extends string>(
  options: ReadonlyArray<EnumOption<T>>,
  value: T | null | undefined,
): EnumOption<T> | undefined {
  if (!value) return undefined;
  return options.find((entry) => entry.value === value);
}

export const optionLabel = <T extends string>(option: EnumOption<T>, locale: Locale = 'en') =>
  locale === 'ar' ? option.labelAr : option.labelEn;

/* ========================================================================== */
/*  Sorting                                                                   */
/* ========================================================================== */

export interface SortOption {
  value: SearchSort;
  labelEn: string;
  labelAr: string;
  icon: LucideIcon;
}

/** search-svc `sort` values (CONTRACT §6). */
export const SORT_OPTIONS: ReadonlyArray<SortOption> = [
  { value: 'relevance', labelEn: 'Most relevant', labelAr: 'الأكثر صلة', icon: Sparkles },
  { value: 'newest', labelEn: 'Newest first', labelAr: 'الأحدث', icon: Clock },
  { value: 'price_asc', labelEn: 'Price: low to high', labelAr: 'السعر: من الأقل', icon: ArrowUp },
  { value: 'price_desc', labelEn: 'Price: high to low', labelAr: 'السعر: من الأعلى', icon: ArrowDown },
  { value: 'area_desc', labelEn: 'Largest area', labelAr: 'الأكبر مساحة', icon: Maximize2 },
];

/** api-core `sort` values (CONTRACT §4 — `-field` for descending). */
export const API_SORT_OPTIONS = [
  { value: '-publishedAt', labelEn: 'Newest first', labelAr: 'الأحدث' },
  { value: 'price.amount', labelEn: 'Price: low to high', labelAr: 'السعر: من الأقل' },
  { value: '-price.amount', labelEn: 'Price: high to low', labelAr: 'السعر: من الأعلى' },
  { value: '-specs.areaSqm', labelEn: 'Largest area', labelAr: 'الأكبر مساحة' },
] as const;

export const DEFAULT_SORT: SearchSort = 'relevance';

/* ========================================================================== */
/*  Filter ranges                                                             */
/* ========================================================================== */

/** EGP. Slider bounds tuned to the Egyptian primary market. */
export const PRICE_RANGE = {
  min: 500_000,
  max: 120_000_000,
  step: 250_000,
} as const;

export const PRICE_PRESETS = [
  { labelEn: 'Under 5M', labelAr: 'أقل من 5 مليون', minPrice: undefined, maxPrice: 5_000_000 },
  { labelEn: '5M – 10M', labelAr: '5 – 10 مليون', minPrice: 5_000_000, maxPrice: 10_000_000 },
  { labelEn: '10M – 20M', labelAr: '10 – 20 مليون', minPrice: 10_000_000, maxPrice: 20_000_000 },
  { labelEn: '20M – 40M', labelAr: '20 – 40 مليون', minPrice: 20_000_000, maxPrice: 40_000_000 },
  { labelEn: '40M+', labelAr: 'أكثر من 40 مليون', minPrice: 40_000_000, maxPrice: undefined },
] as const;

/** Square metres. */
export const AREA_RANGE = {
  min: 40,
  max: 1_500,
  step: 10,
} as const;

export const BEDROOM_OPTIONS = [
  { value: 1, labelEn: '1', labelAr: '١' },
  { value: 2, labelEn: '2', labelAr: '٢' },
  { value: 3, labelEn: '3', labelAr: '٣' },
  { value: 4, labelEn: '4', labelAr: '٤' },
  { value: 5, labelEn: '5', labelAr: '٥' },
  { value: 6, labelEn: '6+', labelAr: '+٦' },
] as const;

export const BATHROOM_OPTIONS = [
  { value: 1, labelEn: '1', labelAr: '١' },
  { value: 2, labelEn: '2', labelAr: '٢' },
  { value: 3, labelEn: '3', labelAr: '٣' },
  { value: 4, labelEn: '4+', labelAr: '+٤' },
] as const;

export const DOWN_PAYMENT_OPTIONS = [
  { value: 5, labelEn: 'Up to 5%', labelAr: 'حتى 5%' },
  { value: 10, labelEn: 'Up to 10%', labelAr: 'حتى 10%' },
  { value: 15, labelEn: 'Up to 15%', labelAr: 'حتى 15%' },
  { value: 20, labelEn: 'Up to 20%', labelAr: 'حتى 20%' },
  { value: 30, labelEn: 'Up to 30%', labelAr: 'حتى 30%' },
] as const;

export const INSTALLMENT_YEARS_OPTIONS = [
  { value: 3, labelEn: '3+ years', labelAr: '3 سنوات فأكثر' },
  { value: 5, labelEn: '5+ years', labelAr: '5 سنوات فأكثر' },
  { value: 7, labelEn: '7+ years', labelAr: '7 سنوات فأكثر' },
  { value: 8, labelEn: '8+ years', labelAr: '8 سنوات فأكثر' },
  { value: 10, labelEn: '10+ years', labelAr: '10 سنوات فأكثر' },
] as const;

export const RADIUS_OPTIONS = [1, 3, 5, 10, 20, 50] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [12, 20, 24, 48] as const;
export const MAX_COMPARE_ITEMS = 4;

/* ========================================================================== */
/*  Amenities                                                                 */
/* ========================================================================== */

/** seed/amenities.json ships kebab-case lucide names; map them to components. */
const AMENITY_ICONS: Record<string, LucideIcon> = {
  waves: Waves,
  'life-buoy': LifeBuoy,
  dumbbell: Dumbbell,
  'flower-2': Flower2,
  landmark: Landmark,
  'shield-check': ShieldCheck,
  cctv: Video,
  fence: Fence,
  'house-wifi': Wifi,
  blocks: Blocks,
  baby: Baby,
  'graduation-cap': GraduationCap,
  'moon-star': Moon,
  'shopping-bag': ShoppingBag,
  stethoscope: Stethoscope,
  'circle-parking': Car,
  wrench: Wrench,
  laptop: Laptop,
  trees: Trees,
  footprints: Footprints,
  volleyball: Trophy,
  flame: Flame,
  droplets: Droplets,
  umbrella: Umbrella,
};

export function getAmenityIcon(icon: string | null | undefined): LucideIcon {
  if (!icon) return ShieldCheck;
  return AMENITY_ICONS[icon] ?? ShieldCheck;
}

export const AMENITY_CATEGORY_LABELS = {
  lifestyle: { en: 'Lifestyle', ar: 'أسلوب الحياة' },
  family: { en: 'Family', ar: 'العائلة' },
  wellness: { en: 'Wellness', ar: 'الصحة واللياقة' },
  security: { en: 'Security', ar: 'الأمن' },
  services: { en: 'Services', ar: 'الخدمات' },
} as const;

/* ========================================================================== */
/*  Navigation                                                                */
/* ========================================================================== */

export interface NavItem {
  href: string;
  labelEn: string;
  labelAr: string;
  icon?: LucideIcon;
  descriptionEn?: string;
  descriptionAr?: string;
  badge?: 'new' | 'hot';
}

export const MAIN_NAV: ReadonlyArray<NavItem> = [
  {
    href: '/',
    labelEn: 'Home',
    labelAr: 'الرئيسية',
    icon: HomeIcon,
    descriptionEn: 'Start here',
    descriptionAr: 'ابدأ من هنا',
  },
  {
    href: '/search',
    labelEn: 'Search',
    labelAr: 'ابحث',
    icon: Building2,
    descriptionEn: 'Every home on TopChoice, primary and resale',
    descriptionAr: 'كل الوحدات على توب تشويس، أولية وإعادة بيع',
  },
  {
    href: '/compounds',
    labelEn: 'Compounds',
    labelAr: 'الكمبوندات',
    icon: Layers,
    descriptionEn: 'Master-planned communities',
    descriptionAr: 'مجتمعات سكنية متكاملة',
  },
  {
    href: '/developers',
    labelEn: 'Developers',
    labelAr: 'المطورون',
    icon: Users,
    descriptionEn: 'Every major Egyptian developer',
    descriptionAr: 'كل المطورين الكبار في مصر',
  },
  {
    href: '/areas',
    labelEn: 'Areas',
    labelAr: 'المناطق',
    icon: MapPin,
    descriptionEn: 'New Cairo, Zayed, North Coast & more',
    descriptionAr: 'القاهرة الجديدة، زايد، الساحل وغيرها',
  },
  {
    href: '/topchoice-now',
    labelEn: 'TopChoice Now',
    labelAr: 'توب تشويس الآن',
    icon: Zap,
    descriptionEn: 'Move in today, pay over 8 years',
    descriptionAr: 'اسكن اليوم وقسّط على 8 سنوات',
    badge: 'new',
  },
  {
    href: '/sell',
    labelEn: 'Sell',
    labelAr: 'بيع',
    icon: Tag,
    descriptionEn: 'List your property and let an agent find the buyer',
    descriptionAr: 'اعرض عقارك ودع المستشار يجد لك المشتري',
  },
];

export const MOBILE_BOTTOM_NAV: ReadonlyArray<NavItem> = [
  { href: '/', labelEn: 'Home', labelAr: 'الرئيسية', icon: HomeIcon },
  { href: '/search', labelEn: 'Search', labelAr: 'بحث', icon: MapPin },
  { href: '/compounds', labelEn: 'Compounds', labelAr: 'كمبوندات', icon: Layers },
  { href: '/favorites', labelEn: 'Saved', labelAr: 'المحفوظة', icon: BadgeCheck },
  { href: '/account', labelEn: 'Account', labelAr: 'حسابي', icon: UserCheck },
];

/** Popular areas — slugs match seed/areas.json. */
export const POPULAR_AREAS = [
  { slug: 'new-cairo', labelEn: 'New Cairo', labelAr: 'القاهرة الجديدة' },
  { slug: 'sheikh-zayed', labelEn: 'Sheikh Zayed', labelAr: 'الشيخ زايد' },
  { slug: 'north-coast', labelEn: 'North Coast', labelAr: 'الساحل الشمالي' },
  { slug: 'new-administrative-capital', labelEn: 'New Capital', labelAr: 'العاصمة الإدارية' },
  { slug: '6th-of-october', labelEn: '6th of October', labelAr: 'السادس من أكتوبر' },
  { slug: 'mostakbal-city', labelEn: 'Mostakbal City', labelAr: 'مدينة المستقبل' },
  { slug: 'madinaty', labelEn: 'Madinaty', labelAr: 'مدينتي' },
  { slug: 'ain-sokhna', labelEn: 'Ain Sokhna', labelAr: 'العين السخنة' },
  { slug: 'ras-el-hekma', labelEn: 'Ras El Hekma', labelAr: 'رأس الحكمة' },
  { slug: 'zamalek', labelEn: 'Zamalek', labelAr: 'الزمالك' },
] as const;

/** Top developers — slugs match seed/developers.json. */
export const TOP_DEVELOPERS = [
  { slug: 'palm-hills', labelEn: 'Palm Hills', labelAr: 'بالم هيلز' },
  { slug: 'sodic', labelEn: 'SODIC', labelAr: 'سوديك' },
  { slug: 'emaar-misr', labelEn: 'Emaar Misr', labelAr: 'إعمار مصر' },
  { slug: 'talaat-moustafa-group', labelEn: 'Talaat Moustafa Group', labelAr: 'مجموعة طلعت مصطفى' },
  { slug: 'mountain-view', labelEn: 'Mountain View', labelAr: 'ماونتن فيو' },
  { slug: 'ora-developers', labelEn: 'Ora Developers', labelAr: 'أورا' },
  { slug: 'hassan-allam-properties', labelEn: 'Hassan Allam', labelAr: 'حسن علام' },
  { slug: 'tatweer-misr', labelEn: 'Tatweer Misr', labelAr: 'تطوير مصر' },
] as const;

export interface FooterSection {
  titleEn: string;
  titleAr: string;
  links: ReadonlyArray<{ href: string; labelEn: string; labelAr: string }>;
}

export const FOOTER_SECTIONS: ReadonlyArray<FooterSection> = [
  {
    titleEn: 'Explore',
    titleAr: 'استكشف',
    links: [
      { href: '/search?saleType=primary', labelEn: 'Buy a home', labelAr: 'اشترِ منزلاً' },
      { href: '/search?saleType=rent', labelEn: 'Rent a home', labelAr: 'استأجر منزلاً' },
      { href: '/compounds', labelEn: 'Compounds', labelAr: 'الكمبوندات' },
      { href: '/areas', labelEn: 'Browse by area', labelAr: 'تصفح حسب المنطقة' },
      { href: '/topchoice-now', labelEn: 'TopChoice Now', labelAr: 'توب تشويس الآن' },
    ],
  },
  {
    titleEn: 'Tools',
    titleAr: 'أدوات',
    links: [
      { href: '/mortgage-calculator', labelEn: 'Mortgage calculator', labelAr: 'حاسبة التمويل' },
      { href: '/compare', labelEn: 'Compare properties', labelAr: 'قارن العقارات' },
      { href: '/favorites', labelEn: 'Saved properties', labelAr: 'العقارات المحفوظة' },
      { href: '/saved-searches', labelEn: 'Saved searches', labelAr: 'عمليات البحث المحفوظة' },
    ],
  },
  {
    titleEn: 'Company',
    titleAr: 'الشركة',
    links: [
      { href: '/about', labelEn: 'About TopChoice', labelAr: 'عن توب تشويس' },
      { href: '/topchoice-now', labelEn: 'TopChoice Now', labelAr: 'توب تشويس الآن' },
      { href: '/developers', labelEn: 'Developers', labelAr: 'المطورون' },
      { href: '/contact', labelEn: 'Contact us', labelAr: 'تواصل معنا' },
    ],
  },
  {
    titleEn: 'Legal',
    titleAr: 'قانوني',
    links: [
      { href: '/terms', labelEn: 'Terms of service', labelAr: 'شروط الخدمة' },
      { href: '/privacy', labelEn: 'Privacy policy', labelAr: 'سياسة الخصوصية' },
    ],
  },
];

export const LOCALE_LABELS: Record<Locale, { native: string; en: string }> = {
  en: { native: 'English', en: 'English' },
  ar: { native: 'العربية', en: 'Arabic' },
};

/** Lead-form source values used across the app (see `LeadSource`). */
export const LEAD_SOURCES = {
  propertyPage: 'property_page',
  compoundPage: 'compound_page',
  developerPage: 'developer_page',
  searchResults: 'search_results',
  chatbot: 'chatbot',
  newsletter: 'newsletter',
  callButton: 'call_button',
  whatsapp: 'whatsapp',
} as const;

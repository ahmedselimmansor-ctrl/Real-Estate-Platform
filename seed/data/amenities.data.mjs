/**
 * 24 amenities. `slug` is the stable key used inside `properties[].amenities`
 * (see CONTRACT §3 — the Mongo document stores amenity slugs, while compounds
 * store amenity UUIDs in `amenityIds`).
 *
 * `icon` values are lucide-react icon names (kebab-case) so apps/web can render
 * them with a single lookup table.
 */
export const AMENITIES = [
  { slug: 'pool', nameEn: 'Swimming Pool', nameAr: 'حمام سباحة', icon: 'waves', category: 'lifestyle' },
  { slug: 'kids-pool', nameEn: 'Kids Pool', nameAr: 'حمام سباحة للأطفال', icon: 'life-buoy', category: 'family' },
  { slug: 'gym', nameEn: 'Gym & Fitness Centre', nameAr: 'جيم ومركز لياقة', icon: 'dumbbell', category: 'wellness' },
  { slug: 'spa', nameEn: 'Spa & Sauna', nameAr: 'سبا وساونا', icon: 'flower-2', category: 'wellness' },
  { slug: 'clubhouse', nameEn: 'Clubhouse', nameAr: 'النادي الاجتماعي', icon: 'landmark', category: 'lifestyle' },
  { slug: 'security', nameEn: '24/7 Security', nameAr: 'أمن على مدار الساعة', icon: 'shield-check', category: 'security' },
  { slug: 'cctv', nameEn: 'CCTV Surveillance', nameAr: 'كاميرات مراقبة', icon: 'cctv', category: 'security' },
  { slug: 'gated-community', nameEn: 'Gated Community', nameAr: 'كومباوند مغلق', icon: 'fence', category: 'security' },
  { slug: 'smart-home', nameEn: 'Smart Home System', nameAr: 'نظام المنزل الذكي', icon: 'house-wifi', category: 'lifestyle' },
  { slug: 'kids-area', nameEn: 'Kids Play Area', nameAr: 'منطقة ألعاب أطفال', icon: 'blocks', category: 'family' },
  { slug: 'nursery', nameEn: 'Nursery', nameAr: 'حضانة', icon: 'baby', category: 'family' },
  { slug: 'international-school', nameEn: 'International School', nameAr: 'مدرسة دولية', icon: 'graduation-cap', category: 'family' },
  { slug: 'mosque', nameEn: 'Mosque', nameAr: 'مسجد', icon: 'moon-star', category: 'services' },
  { slug: 'commercial-strip', nameEn: 'Commercial Strip', nameAr: 'منطقة تجارية', icon: 'shopping-bag', category: 'services' },
  { slug: 'medical-center', nameEn: 'Medical Centre', nameAr: 'مركز طبي', icon: 'stethoscope', category: 'services' },
  { slug: 'underground-parking', nameEn: 'Underground Parking', nameAr: 'جراج تحت الأرض', icon: 'circle-parking', category: 'services' },
  { slug: 'maintenance', nameEn: 'Facility Maintenance', nameAr: 'صيانة ومرافق', icon: 'wrench', category: 'services' },
  { slug: 'co-working', nameEn: 'Co-Working Space', nameAr: 'مساحة عمل مشتركة', icon: 'laptop', category: 'services' },
  { slug: 'landscaped-gardens', nameEn: 'Landscaped Gardens', nameAr: 'مساحات خضراء ولاندسكيب', icon: 'trees', category: 'lifestyle' },
  { slug: 'running-track', nameEn: 'Running & Cycling Track', nameAr: 'مسار للجري والدراجات', icon: 'footprints', category: 'wellness' },
  { slug: 'sports-courts', nameEn: 'Sports Courts', nameAr: 'ملاعب رياضية', icon: 'volleyball', category: 'wellness' },
  { slug: 'bbq-area', nameEn: 'BBQ Area', nameAr: 'منطقة شواء', icon: 'flame', category: 'lifestyle' },
  { slug: 'crystal-lagoon', nameEn: 'Crystal Lagoon', nameAr: 'بحيرة كريستالية', icon: 'droplets', category: 'lifestyle' },
  { slug: 'beach-access', nameEn: 'Private Beach Access', nameAr: 'شاطئ خاص', icon: 'umbrella', category: 'lifestyle' },
];

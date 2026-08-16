/**
 * 30 compounds. `developerSlug` and `areaSlug` are resolved to the UUIDs from
 * developers.json / areas.json in build/compounds.mjs.
 *
 * Generator-only fields (stripped from the emitted JSON):
 *   weight      relative share of the 180 seeded properties
 *   priceFactor multiplier applied on top of the area's avgPricePerMeter
 *   areaRange   [minSqm, maxSqm] envelope the compound's units stay inside
 *
 * Emitted `startingPrice`, `maxPrice`, `minAreaSqm` and `maxAreaSqm` are
 * recomputed from the generated properties so the files never disagree.
 */
export const COMPOUNDS = [
  // ------------------------------------------------------------- New Cairo ---
  {
    slug: 'palm-hills-new-cairo',
    name: 'Palm Hills New Cairo',
    nameAr: 'بالم هيلز نيو كايرو',
    developerSlug: 'palm-hills',
    areaSlug: 'new-cairo',
    geo: { lat: 30.0185, lng: 31.4602 },
    deliveryYear: 2026,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.08,
    weight: 8,
    areaRange: [110, 520],
    isFeatured: true,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa'],
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'kids-pool', 'clubhouse', 'gym',
      'landscaped-gardens', 'running-track', 'kids-area', 'commercial-strip', 'mosque', 'maintenance',
    ],
    descEn:
      'Palm Hills New Cairo spreads over 500 acres off the Ring Road in the Fifth Settlement, built around a central club and a chain of landscaped parks. The community mixes apartments, townhouses and standalone villas, with phases delivered progressively since 2019.',
    descAr:
      'يمتد بالم هيلز نيو كايرو على أكثر من 500 فدان بجوار الطريق الدائري في التجمع الخامس، ويتمحور حول نادٍ مركزي وسلسلة من الحدائق المنسقة. يضم المجتمع شققًا وتاون هاوس وفيلات مستقلة، وتُسلَّم مراحله تباعًا منذ 2019.',
  },
  {
    slug: 'mivida',
    name: 'Mivida',
    nameAr: 'ميفيدا',
    developerSlug: 'emaar-misr',
    areaSlug: 'new-cairo',
    geo: { lat: 30.0206, lng: 31.493 },
    deliveryYear: 2026,
    installmentYears: 6,
    downPaymentPercent: 15,
    priceFactor: 1.18,
    weight: 8,
    areaRange: [120, 560],
    isFeatured: true,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'office'],
    descEn:
      'Mivida is Emaar Misr\'s 900-acre community on the 90th Street corridor, planned around a 100-acre central park, a business park and the Mivida Downtown retail spine. Its Spanish-influenced architecture and mature landscaping make it one of the most liquid resale markets in New Cairo.',
    descAr:
      'ميفيدا هي مجتمع إعمار مصر على مساحة 900 فدان بامتداد شارع التسعين، وقد خُطط حول حديقة مركزية بمساحة 100 فدان ومنطقة أعمال ومحور تجاري هو ميفيدا داون تاون. طرازها المعماري الإسباني ومساحاتها الخضراء الناضجة يجعلانها من أنشط أسواق إعادة البيع في القاهرة الجديدة.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'clubhouse', 'gym', 'spa', 'landscaped-gardens',
      'running-track', 'international-school', 'medical-center', 'commercial-strip', 'co-working',
      'mosque', 'maintenance',
    ],
  },
  {
    slug: 'eastown',
    name: 'Eastown',
    nameAr: 'إيستاون',
    developerSlug: 'sodic',
    areaSlug: 'new-cairo',
    geo: { lat: 30.009, lng: 31.43 },
    deliveryYear: 2026,
    installmentYears: 7,
    downPaymentPercent: 10,
    priceFactor: 1.12,
    weight: 7,
    areaRange: [95, 320],
    isFeatured: false,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse', 'office', 'retail', 'clinic'],
    descEn:
      'Eastown sits directly on the South Teseen axis and pairs residential buildings with the Eastown Hub, one of the busiest office and dining destinations in New Cairo. Unit sizes are compact and walkability is the selling point, which makes it popular with young professionals and rental investors.',
    descAr:
      'يقع إيستاون مباشرة على محور التسعين الجنوبي ويجمع بين المباني السكنية وإيستاون هَب، أحد أنشط وجهات المكاتب والمطاعم في القاهرة الجديدة. المساحات مدمجة وسهولة التنقل سيرًا هي ميزته الأبرز، ما يجعله مفضلًا لدى الشباب المهني والمستثمرين في التأجير.',
    amenities: [
      'security', 'cctv', 'underground-parking', 'gym', 'pool', 'co-working', 'commercial-strip',
      'landscaped-gardens', 'smart-home', 'maintenance',
    ],
  },
  {
    slug: 'zed-east',
    name: 'ZED East',
    nameAr: 'زيد إيست',
    developerSlug: 'ora-developers',
    areaSlug: 'new-cairo',
    geo: { lat: 30.033, lng: 31.51 },
    deliveryYear: 2028,
    installmentYears: 9,
    downPaymentPercent: 10,
    priceFactor: 1.22,
    weight: 7,
    areaRange: [90, 400],
    isFeatured: true,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse', 'townhouse', 'retail'],
    descEn:
      'ZED East brings Ora\'s tower-led format to the Fifth Settlement, with residential blocks arranged around a members-only sports club and a central lagoon. Interiors are delivered fully finished with smart-home wiring, and the payment plan is one of the longest available in New Cairo.',
    descAr:
      'يقدم زيد إيست نموذج أورا القائم على الأبراج في التجمع الخامس، حيث تلتف المباني السكنية حول نادٍ رياضي للأعضاء وبحيرة مركزية. تُسلَّم الوحدات بتشطيب كامل مع تجهيزات المنزل الذكي، ونظام السداد من الأطول المتاحة في القاهرة الجديدة.',
    amenities: [
      'gated-community', 'security', 'cctv', 'smart-home', 'pool', 'crystal-lagoon', 'gym', 'spa',
      'clubhouse', 'sports-courts', 'running-track', 'kids-area', 'commercial-strip', 'underground-parking',
    ],
  },
  {
    slug: 'taj-city',
    name: 'Taj City',
    nameAr: 'تاج سيتي',
    developerSlug: 'madinet-masr',
    areaSlug: 'new-cairo',
    geo: { lat: 30.098, lng: 31.402 },
    deliveryYear: 2027,
    installmentYears: 10,
    downPaymentPercent: 5,
    priceFactor: 0.95,
    weight: 7,
    areaRange: [85, 420],
    isFeatured: true,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'clinic'],
    descEn:
      'Taj City occupies 900 acres directly on the Suez Road, the closest large-scale compound to Heliopolis and Cairo International Airport. Madinet Masr sells it on aggressive terms, a 5% down payment over ten years, around a lagoon-fronted district and an open-air retail promenade.',
    descAr:
      'تمتد تاج سيتي على 900 فدان مباشرة على طريق السويس، وهي أقرب كومباوند كبير إلى مصر الجديدة ومطار القاهرة الدولي. تطرحها مدينة مصر بشروط تنافسية تبدأ من 5% مقدم على عشر سنوات، حول منطقة مطلة على بحيرة وممشى تجاري مفتوح.',
    amenities: [
      'gated-community', 'security', 'cctv', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym',
      'kids-area', 'nursery', 'medical-center', 'commercial-strip', 'mosque', 'landscaped-gardens', 'maintenance',
    ],
  },

  // ---------------------------------------------------------- Sheikh Zayed ---
  {
    slug: 'cairo-gate',
    name: 'Cairo Gate',
    nameAr: 'كايرو جيت',
    developerSlug: 'emaar-misr',
    areaSlug: 'sheikh-zayed',
    geo: { lat: 30.047, lng: 31.006 },
    deliveryYear: 2027,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.15,
    weight: 6,
    areaRange: [100, 400],
    isFeatured: true,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'office', 'retail'],
    descEn:
      'Cairo Gate is Emaar Misr\'s gateway project at the start of the Cairo–Alexandria Desert Road, wrapped around a signature retail and F&B destination. Its location gives residents a ten-minute drive to Sheikh Zayed\'s schools and Arkan Plaza, and direct access to the Ring Road.',
    descAr:
      'كايرو جيت هو مشروع البوابة لإعمار مصر عند بداية طريق القاهرة الإسكندرية الصحراوي، ويلتف حول وجهة تجارية ومطاعم مميزة. يمنح موقعه السكان عشر دقائق إلى مدارس الشيخ زايد وأركان بلازا، واتصالًا مباشرًا بالطريق الدائري.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'gym', 'clubhouse', 'commercial-strip',
      'landscaped-gardens', 'underground-parking', 'kids-area', 'maintenance',
    ],
  },
  {
    slug: 'zed-west',
    name: 'ZED West',
    nameAr: 'زيد ويست',
    developerSlug: 'ora-developers',
    areaSlug: 'sheikh-zayed',
    geo: { lat: 30.049, lng: 30.979 },
    deliveryYear: 2027,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.28,
    weight: 6,
    areaRange: [95, 360],
    isFeatured: true,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse', 'office'],
    descEn:
      'ZED West is the original ZED tower community in Sheikh Zayed, built on the former Beverly Hills golf land and anchored by the ZED Park club, a 32-storey landmark tower and a curated retail strip. Units are delivered fully finished with premium fittings.',
    descAr:
      'زيد ويست هو مجتمع أبراج زيد الأصلي في الشيخ زايد، وقد أُقيم على أرض جولف بيفرلي هيلز السابقة ويتمحور حول نادي زيد بارك وبرج مميز بارتفاع 32 طابقًا وممشى تجاري منتقى. تُسلَّم الوحدات بتشطيب كامل بخامات فاخرة.',
    amenities: [
      'gated-community', 'security', 'cctv', 'smart-home', 'pool', 'gym', 'spa', 'clubhouse',
      'sports-courts', 'co-working', 'commercial-strip', 'underground-parking', 'landscaped-gardens',
    ],
  },
  {
    slug: 'allegria',
    name: 'Allegria',
    nameAr: 'أليجريا',
    developerSlug: 'sodic',
    areaSlug: 'sheikh-zayed',
    geo: { lat: 30.035, lng: 30.952 },
    deliveryYear: 2025,
    installmentYears: 5,
    downPaymentPercent: 20,
    priceFactor: 1.2,
    weight: 5,
    areaRange: [150, 620],
    isFeatured: false,
    unitTypes: ['apartment', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Allegria is SODIC\'s mature villa community on the Cairo–Alexandria Desert Road, laid out around an 18-hole golf course designed by Greg Norman. Almost everything trading here is resale, fully delivered and surrounded by fifteen years of grown landscaping.',
    descAr:
      'أليجريا هو مجتمع الفيلات الناضج لسوديك على طريق القاهرة الإسكندرية الصحراوي، ويمتد حول ملعب جولف من 18 حفرة صممه جريج نورمان. معظم ما يُتداول فيه إعادة بيع لوحدات مسلَّمة بالكامل وسط مساحات خضراء عمرها خمسة عشر عامًا.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'clubhouse', 'gym', 'landscaped-gardens',
      'running-track', 'kids-area', 'international-school', 'maintenance',
    ],
  },

  // ----------------------------------------------------------- North Coast ---
  {
    slug: 'marassi',
    name: 'Marassi',
    nameAr: 'مراسي',
    developerSlug: 'emaar-misr',
    areaSlug: 'north-coast',
    geo: { lat: 30.967, lng: 28.718 },
    deliveryYear: 2027,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.3,
    weight: 7,
    areaRange: [90, 520],
    isFeatured: true,
    unitTypes: ['chalet', 'apartment', 'duplex', 'penthouse', 'twinhouse', 'villa', 'retail'],
    descEn:
      'Marassi covers 1,544 acres at Sidi Abdel Rahman and is the benchmark address on the North Coast, with a marina, an 18-hole golf course, six hotels and more than a dozen architecturally distinct neighbourhoods. It is one of the few coastal projects with genuine year-round activity.',
    descAr:
      'تمتد مراسي على 1544 فدانًا في سيدي عبد الرحمن وتُعد العنوان المرجعي في الساحل الشمالي، بمارينا وملعب جولف من 18 حفرة وستة فنادق وأكثر من اثني عشر حيًا بطرز معمارية متمايزة. وهي من المشروعات الساحلية القليلة التي تنبض بالحياة طوال العام.',
    amenities: [
      'beach-access', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym', 'spa', 'security',
      'cctv', 'gated-community', 'commercial-strip', 'sports-courts', 'bbq-area', 'maintenance',
    ],
  },
  {
    slug: 'hacienda-bay',
    name: 'Hacienda Bay',
    nameAr: 'هاسيندا باي',
    developerSlug: 'palm-hills',
    areaSlug: 'north-coast',
    geo: { lat: 30.974, lng: 28.612 },
    deliveryYear: 2026,
    installmentYears: 6,
    downPaymentPercent: 15,
    priceFactor: 1.25,
    weight: 6,
    areaRange: [95, 480],
    isFeatured: true,
    unitTypes: ['chalet', 'apartment', 'twinhouse', 'villa'],
    descEn:
      'Hacienda Bay at Km 200 is Palm Hills\' flagship coastal community, built around a boardwalk, a beach club and one of the most active summer social calendars on the Sahel. Stock ranges from compact chalets on the lagoons to standalone villas on the first row.',
    descAr:
      'هاسيندا باي عند الكيلو 200 هو المشروع الساحلي الرئيسي لبالم هيلز، ويتمحور حول الممشى ونادي الشاطئ وواحد من أنشط البرامج الاجتماعية الصيفية في الساحل. يتنوع المعروض بين شاليهات مدمجة على البحيرات وفيلات مستقلة في الصف الأول.',
    amenities: [
      'beach-access', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym', 'security', 'cctv',
      'gated-community', 'bbq-area', 'sports-courts', 'commercial-strip', 'maintenance',
    ],
  },
  {
    slug: 'seazen',
    name: 'Seazen',
    nameAr: 'سيزن',
    developerSlug: 'hassan-allam-properties',
    areaSlug: 'north-coast',
    geo: { lat: 31.029, lng: 28.44 },
    deliveryYear: 2028,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.1,
    weight: 5,
    areaRange: [85, 400],
    isFeatured: false,
    unitTypes: ['chalet', 'apartment', 'duplex', 'twinhouse', 'villa'],
    descEn:
      'Seazen is Hassan Allam Properties\' North Coast destination at Km 158, planned as a terraced village that steps down towards a 700-metre private beach. Every unit is positioned for a sea or lagoon view, and construction is handled in-house by the group\'s contracting arm.',
    descAr:
      'سيزن هو وجهة حسن علام العقارية في الساحل الشمالي عند الكيلو 158، وقد خُطط كقرية مدرجة تنحدر نحو شاطئ خاص بطول 700 متر. كل وحدة موجهة لإطلالة على البحر أو البحيرة، وتتولى ذراع المقاولات في المجموعة التنفيذ بنفسها.',
    amenities: [
      'beach-access', 'crystal-lagoon', 'pool', 'clubhouse', 'gym', 'spa', 'security', 'cctv',
      'gated-community', 'landscaped-gardens', 'bbq-area', 'maintenance',
    ],
  },

  // ------------------------------------------- New Administrative Capital ---
  {
    slug: 'il-bosco',
    name: 'IL BOSCO',
    nameAr: 'إل بوسكو',
    developerSlug: 'misr-italia',
    areaSlug: 'new-administrative-capital',
    geo: { lat: 30.006, lng: 31.718 },
    deliveryYear: 2027,
    installmentYears: 9,
    downPaymentPercent: 10,
    priceFactor: 1.1,
    weight: 6,
    areaRange: [85, 420],
    isFeatured: true,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'office', 'clinic'],
    descEn:
      'IL BOSCO in district R7 introduced vertical gardens and green facades to the New Capital, with a 200,000 m² central park and a monorail station within walking distance. Misr Italia delivers units with smart-home packages and a choice of finishing levels.',
    descAr:
      'أدخل إل بوسكو في الحي R7 مفهوم الحدائق الرأسية والواجهات الخضراء إلى العاصمة الإدارية، مع حديقة مركزية بمساحة 200 ألف متر مربع ومحطة مونوريل على مسافة قريبة سيرًا. تُسلِّم مصر إيطاليا الوحدات مع باقات المنزل الذكي وخيارات متعددة للتشطيب.',
    amenities: [
      'gated-community', 'security', 'cctv', 'smart-home', 'pool', 'gym', 'clubhouse',
      'landscaped-gardens', 'running-track', 'kids-area', 'nursery', 'commercial-strip',
      'medical-center', 'mosque', 'underground-parking',
    ],
  },
  {
    slug: 'la-vista-city',
    name: 'La Vista City',
    nameAr: 'لافيستا سيتي',
    developerSlug: 'la-vista',
    areaSlug: 'new-administrative-capital',
    geo: { lat: 29.972, lng: 31.759 },
    deliveryYear: 2027,
    installmentYears: 7,
    downPaymentPercent: 15,
    priceFactor: 1.02,
    weight: 5,
    areaRange: [140, 560],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'La Vista City sits on the New Capital\'s southern expansion overlooking the Green River, and is one of the few projects in the city delivered fully finished. The master plan is deliberately low-density, with villas and limited-height apartment clusters.',
    descAr:
      'تقع لافيستا سيتي في الامتداد الجنوبي للعاصمة الإدارية بإطلالة على النهر الأخضر، وهي من المشروعات القليلة في المدينة التي تُسلَّم بتشطيب كامل. المخطط العام منخفض الكثافة عمدًا، ويضم فيلات ومجموعات سكنية محدودة الارتفاع.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'kids-pool', 'clubhouse', 'gym',
      'landscaped-gardens', 'kids-area', 'mosque', 'commercial-strip', 'maintenance',
    ],
  },
  {
    slug: 'celia',
    name: 'Celia',
    nameAr: 'سيليا',
    developerSlug: 'talaat-moustafa-group',
    areaSlug: 'new-administrative-capital',
    geo: { lat: 29.998, lng: 31.729 },
    deliveryYear: 2028,
    installmentYears: 10,
    downPaymentPercent: 5,
    priceFactor: 0.98,
    weight: 5,
    areaRange: [110, 480],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Celia is Talaat Moustafa Group\'s 500-acre district in the New Capital, applying the Madinaty playbook of long payment plans, wide service allocations and in-house facility management. Phases are released annually with delivery from 2028 onwards.',
    descAr:
      'سيليا هي منطقة مجموعة طلعت مصطفى على 500 فدان في العاصمة الإدارية، وتطبق فلسفة مدينتي من أنظمة سداد طويلة ونسب خدمات مرتفعة وإدارة مرافق داخلية. تُطرح المراحل سنويًا مع تسليم يبدأ من 2028.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'clubhouse', 'gym', 'landscaped-gardens',
      'kids-area', 'international-school', 'medical-center', 'commercial-strip', 'mosque', 'maintenance',
    ],
  },

  // ------------------------------------------------------- 6th of October ---
  {
    slug: 'badya',
    name: 'Badya',
    nameAr: 'بادية',
    developerSlug: 'palm-hills',
    areaSlug: '6th-of-october',
    geo: { lat: 29.911, lng: 30.836 },
    deliveryYear: 2028,
    installmentYears: 10,
    downPaymentPercent: 5,
    priceFactor: 1.05,
    weight: 6,
    areaRange: [95, 480],
    isFeatured: true,
    unitTypes: ['apartment', 'duplex', 'townhouse', 'twinhouse', 'villa', 'office', 'retail', 'clinic'],
    descEn:
      'Badya is Palm Hills\' 3,000-acre smart city in West October, designed around walkable neighbourhoods, a business district and an innovation hub. It is the largest single master plan in the area and is sold on the longest payment terms Palm Hills offers.',
    descAr:
      'بادية هي المدينة الذكية لبالم هيلز على 3000 فدان في غرب أكتوبر، وقد صُممت حول أحياء صديقة للمشاة ومنطقة أعمال ومركز للابتكار. وهي أكبر مخطط عام منفرد في المنطقة وتُطرح بأطول أنظمة سداد تقدمها بالم هيلز.',
    amenities: [
      'gated-community', 'security', 'cctv', 'smart-home', 'pool', 'clubhouse', 'gym', 'co-working',
      'landscaped-gardens', 'running-track', 'sports-courts', 'kids-area', 'nursery',
      'international-school', 'commercial-strip', 'medical-center', 'mosque',
    ],
  },
  {
    slug: 'mountain-view-icity-october',
    name: 'Mountain View iCity October',
    nameAr: 'ماونتن فيو آي سيتي أكتوبر',
    developerSlug: 'mountain-view',
    areaSlug: '6th-of-october',
    geo: { lat: 29.953, lng: 30.937 },
    deliveryYear: 2027,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.12,
    weight: 5,
    areaRange: [110, 460],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Mountain View iCity October is organised around Central Park, a 40-acre green spine that links themed districts and the developer\'s Club Park. The compound is on the Central Axis, minutes from Mall of Arabia and the October universities.',
    descAr:
      'يتمحور ماونتن فيو آي سيتي أكتوبر حول سنترال بارك، وهو محور أخضر بمساحة 40 فدانًا يربط الأحياء ذات الطابع الخاص بنادي المشروع. يقع الكومباوند على المحور المركزي على بعد دقائق من مول العرب وجامعات أكتوبر.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'kids-pool', 'clubhouse', 'gym', 'spa',
      'landscaped-gardens', 'running-track', 'sports-courts', 'kids-area', 'commercial-strip', 'maintenance',
    ],
  },

  // ------------------------------------------------------- Mostakbal City ---
  {
    slug: 'bloomfields',
    name: 'Bloomfields',
    nameAr: 'بلومفيلدز',
    developerSlug: 'tatweer-misr',
    areaSlug: 'mostakbal-city',
    geo: { lat: 30.043, lng: 31.648 },
    deliveryYear: 2027,
    installmentYears: 9,
    downPaymentPercent: 10,
    priceFactor: 1.06,
    weight: 6,
    areaRange: [90, 440],
    isFeatured: true,
    unitTypes: ['studio', 'apartment', 'duplex', 'townhouse', 'twinhouse', 'villa', 'office', 'retail'],
    descEn:
      'Bloomfields is Tatweer Misr\'s 415-acre community in Mostakbal City, planned around a central park, a university campus and a medical hub. Districts are themed and low-rise, and the project sits ten minutes from the New Cairo boundary on the Suez Road.',
    descAr:
      'بلومفيلدز هو مجتمع تطوير مصر على 415 فدانًا في مدينة المستقبل، ويتمحور حول حديقة مركزية وحرم جامعي ومركز طبي. الأحياء ذات طابع خاص ومنخفضة الارتفاع، ويبعد المشروع عشر دقائق عن حدود القاهرة الجديدة على طريق السويس.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'clubhouse', 'gym', 'landscaped-gardens',
      'running-track', 'kids-area', 'nursery', 'international-school', 'medical-center',
      'commercial-strip', 'co-working', 'maintenance',
    ],
  },
  {
    slug: 'haptown',
    name: 'Haptown',
    nameAr: 'هابتاون',
    developerSlug: 'hassan-allam-properties',
    areaSlug: 'mostakbal-city',
    geo: { lat: 30.057, lng: 31.672 },
    deliveryYear: 2028,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.0,
    weight: 5,
    areaRange: [100, 420],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Haptown by Hassan Allam Properties spans 360 acres in Mostakbal City and is built around a linear park with sports, co-working and retail nodes. The developer\'s own construction arm handles delivery, which has kept the project on its published timeline.',
    descAr:
      'يمتد هابتاون من حسن علام العقارية على 360 فدانًا في مدينة المستقبل، ويتمحور حول حديقة خطية تتخللها مناطق رياضية ومساحات عمل ومحاور تجارية. تتولى ذراع المقاولات الخاصة بالمطور التنفيذ، ما أبقى المشروع ملتزمًا بجدوله المعلن.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'clubhouse', 'gym', 'co-working', 'sports-courts',
      'landscaped-gardens', 'kids-area', 'commercial-strip', 'maintenance',
    ],
  },
  {
    slug: 'sarai',
    name: 'Sarai',
    nameAr: 'سراي',
    developerSlug: 'madinet-masr',
    areaSlug: 'mostakbal-city',
    geo: { lat: 30.018, lng: 31.594 },
    deliveryYear: 2027,
    installmentYears: 10,
    downPaymentPercent: 5,
    priceFactor: 0.96,
    weight: 6,
    areaRange: [90, 460],
    isFeatured: false,
    unitTypes: ['studio', 'apartment', 'duplex', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Sarai sits on the Cairo–Suez Road at the entrance to Mostakbal City, built around the Sarai Crystal Lagoon and the S-Walk retail destination. Madinet Masr has been delivering phases since 2020, so ready units and off-plan phases trade side by side.',
    descAr:
      'تقع سراي على طريق القاهرة السويس عند مدخل مدينة المستقبل، وتتمحور حول بحيرة سراي الكريستالية ووجهة S-Walk التجارية. تسلّم مدينة مصر مراحلها منذ 2020، لذا تتداول الوحدات الجاهزة والمراحل تحت الإنشاء جنبًا إلى جنب.',
    amenities: [
      'gated-community', 'security', 'cctv', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym',
      'landscaped-gardens', 'kids-area', 'commercial-strip', 'mosque', 'maintenance',
    ],
  },

  // ------------------------------------------------------------- Madinaty ---
  {
    slug: 'madinaty',
    name: 'Madinaty',
    nameAr: 'مدينتي',
    developerSlug: 'talaat-moustafa-group',
    areaSlug: 'madinaty',
    geo: { lat: 30.109, lng: 31.63 },
    deliveryYear: 2025,
    installmentYears: 10,
    downPaymentPercent: 10,
    priceFactor: 1.0,
    weight: 6,
    areaRange: [110, 540],
    isFeatured: true,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa', 'retail', 'clinic'],
    descEn:
      'Madinaty is a fully operational city of 8,000 acres with its own schools, hospitals, golf course, open-air malls and craft zone. Because deliveries started more than a decade ago, buyers can choose between ready-to-move resale units and newly launched phases from the developer.',
    descAr:
      'مدينتي مدينة متكاملة عاملة بالفعل على مساحة 8000 فدان، ولها مدارسها ومستشفياتها وملعب الجولف والمولات المفتوحة والمنطقة الحرفية. ولأن التسليمات بدأت منذ أكثر من عشر سنوات، يمكن للمشتري الاختيار بين وحدات جاهزة بإعادة البيع ومراحل جديدة من المطور.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'clubhouse', 'gym', 'landscaped-gardens',
      'running-track', 'sports-courts', 'kids-area', 'nursery', 'international-school',
      'medical-center', 'commercial-strip', 'mosque', 'maintenance',
    ],
  },

  // ----------------------------------------------------------- El Shorouk ---
  {
    slug: 'el-patio-oro',
    name: 'El Patio Oro',
    nameAr: 'الباتيو أورو',
    developerSlug: 'la-vista',
    areaSlug: 'el-shorouk',
    geo: { lat: 30.142, lng: 31.632 },
    deliveryYear: 2026,
    installmentYears: 6,
    downPaymentPercent: 15,
    priceFactor: 1.04,
    weight: 4,
    areaRange: [110, 480],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'El Patio Oro is part of La Vista\'s El Patio series in El Shorouk, delivered fully finished with the developer\'s signature Mediterranean facades. Densities are low, plots are generous and the compound is a short drive from the Horreya Axis into Heliopolis.',
    descAr:
      'الباتيو أورو جزء من سلسلة الباتيو للافيستا في مدينة الشروق، ويُسلَّم بتشطيب كامل بالواجهات المتوسطية المميزة للمطور. الكثافة منخفضة والمساحات كبيرة، ويبعد الكومباوند دقائق عن محور الحرية باتجاه مصر الجديدة.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'kids-pool', 'clubhouse', 'landscaped-gardens',
      'kids-area', 'sports-courts', 'mosque', 'maintenance',
    ],
  },

  // ----------------------------------------------------------- Ain Sokhna ---
  {
    slug: 'il-monte-galala',
    name: 'IL Monte Galala',
    nameAr: 'إل مونت جلالة',
    developerSlug: 'tatweer-misr',
    areaSlug: 'ain-sokhna',
    geo: { lat: 29.521, lng: 32.348 },
    deliveryYear: 2026,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.15,
    weight: 5,
    areaRange: [80, 400],
    isFeatured: true,
    unitTypes: ['chalet', 'apartment', 'duplex', 'twinhouse', 'villa'],
    descEn:
      'IL Monte Galala climbs the Galala plateau above Ain Sokhna, terracing chalets and villas so that almost every unit keeps a Red Sea view. The project includes a crystal lagoon, a hanging park, a cable car and hotel-operated serviced apartments.',
    descAr:
      'يتسلق إل مونت جلالة هضبة الجلالة فوق العين السخنة، حيث تتدرج الشاليهات والفيلات بحيث تحتفظ كل وحدة تقريبًا بإطلالة على البحر الأحمر. يضم المشروع بحيرة كريستالية وحديقة معلقة وتلفريك ووحدات فندقية مخدومة.',
    amenities: [
      'beach-access', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym', 'spa', 'security',
      'cctv', 'gated-community', 'commercial-strip', 'bbq-area', 'maintenance',
    ],
  },
  {
    slug: 'kai-sokhna',
    name: 'Kai Sokhna',
    nameAr: 'كاي سخنة',
    developerSlug: 'misr-italia',
    areaSlug: 'ain-sokhna',
    geo: { lat: 29.644, lng: 32.321 },
    deliveryYear: 2027,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.05,
    weight: 4,
    areaRange: [75, 340],
    isFeatured: false,
    unitTypes: ['chalet', 'apartment', 'duplex', 'twinhouse'],
    descEn:
      'Kai Sokhna sits at Km 40 on the Zaafarana Road with 400 metres of private beach and a stepped master plan that keeps the sea in view from the back rows. Misr Italia delivers units fully finished with air conditioning and kitchen cabinetry.',
    descAr:
      'يقع كاي سخنة عند الكيلو 40 على طريق الزعفرانة بشاطئ خاص بطول 400 متر ومخطط متدرج يبقي البحر في مرمى البصر حتى من الصفوف الخلفية. تُسلِّم مصر إيطاليا الوحدات بتشطيب كامل مع التكييف ومطبخ مجهز.',
    amenities: [
      'beach-access', 'pool', 'kids-pool', 'clubhouse', 'gym', 'security', 'cctv', 'gated-community',
      'bbq-area', 'commercial-strip', 'maintenance',
    ],
  },

  // ---------------------------------------------------------------- Maadi ---
  {
    slug: 'maadi-heights',
    name: 'Maadi Heights',
    nameAr: 'مرتفعات المعادي',
    developerSlug: 'al-ahly-sabbour',
    areaSlug: 'maadi',
    geo: { lat: 29.952, lng: 31.296 },
    deliveryYear: 2026,
    installmentYears: 6,
    downPaymentPercent: 15,
    priceFactor: 1.02,
    weight: 4,
    areaRange: [95, 320],
    isFeatured: false,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse', 'clinic'],
    descEn:
      'Maadi Heights is an in-city gated community on the Zahraa El Maadi side, a rare gated product inside Maadi itself. Buildings are limited to six floors around a private club, and the compound is fifteen minutes from Road 9 and the Maadi metro line.',
    descAr:
      'مرتفعات المعادي مجتمع مغلق داخل المدينة في نطاق زهراء المعادي، وهو منتج نادر داخل المعادي نفسها. لا تتجاوز المباني ستة أدوار وتلتف حول نادٍ خاص، ويبعد الكومباوند خمس عشرة دقيقة عن شارع 9 وخط مترو المعادي.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'gym', 'clubhouse', 'landscaped-gardens',
      'kids-area', 'underground-parking', 'medical-center', 'maintenance',
    ],
  },

  // -------------------------------------------------------------- Zamalek ---
  {
    slug: 'nile-crest-zamalek',
    name: 'Nile Crest Zamalek',
    nameAr: 'نايل كريست الزمالك',
    developerSlug: 'madinet-masr',
    areaSlug: 'zamalek',
    geo: { lat: 30.063, lng: 31.221 },
    deliveryYear: 2025,
    installmentYears: 5,
    downPaymentPercent: 25,
    priceFactor: 1.0,
    weight: 3,
    areaRange: [90, 360],
    isFeatured: false,
    unitTypes: ['studio', 'apartment', 'duplex', 'penthouse'],
    descEn:
      'Nile Crest Zamalek is a boutique residential building on Abou El Feda Street with direct Nile frontage and only two apartments per floor. Units are delivered fully finished with underground parking, a rarity on the island.',
    descAr:
      'نايل كريست الزمالك عمارة سكنية مميزة في شارع أبو الفدا بواجهة مباشرة على النيل وشقتين فقط في كل دور. تُسلَّم الوحدات بتشطيب كامل مع جراج تحت الأرض، وهو أمر نادر في الجزيرة.',
    amenities: [
      'security', 'cctv', 'underground-parking', 'gym', 'smart-home', 'maintenance', 'landscaped-gardens',
    ],
  },

  // ------------------------------------------------------------ New Zayed ---
  {
    slug: 'solana',
    name: 'Solana',
    nameAr: 'سولانا',
    developerSlug: 'ora-developers',
    areaSlug: 'new-zayed',
    geo: { lat: 30.01, lng: 30.833 },
    deliveryYear: 2029,
    installmentYears: 8,
    downPaymentPercent: 10,
    priceFactor: 1.18,
    weight: 5,
    areaRange: [110, 520],
    isFeatured: true,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Solana is Ora\'s New Zayed community on the Dabaa Axis, planned around a central sports club and a green corridor that runs the length of the site. It targets buyers priced out of Sheikh Zayed who still want a club-led community and a five-minute drive to Sphinx Airport.',
    descAr:
      'سولانا هو مجتمع أورا في زايد الجديدة على محور الضبعة، ويتمحور حول نادٍ رياضي مركزي وممر أخضر يمتد بطول الموقع. يستهدف المشترين الذين تجاوزت أسعار الشيخ زايد ميزانيتهم مع رغبتهم في مجتمع يقوده نادٍ وعلى بعد خمس دقائق من مطار سفنكس.',
    amenities: [
      'gated-community', 'security', 'cctv', 'smart-home', 'pool', 'clubhouse', 'gym', 'sports-courts',
      'running-track', 'landscaped-gardens', 'kids-area', 'commercial-strip', 'maintenance',
    ],
  },
  {
    slug: 'rivers',
    name: 'Rivers',
    nameAr: 'ريفرز',
    developerSlug: 'tatweer-misr',
    areaSlug: 'new-zayed',
    geo: { lat: 30.024, lng: 30.87 },
    deliveryYear: 2028,
    installmentYears: 9,
    downPaymentPercent: 10,
    priceFactor: 1.08,
    weight: 5,
    areaRange: [100, 500],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'townhouse', 'twinhouse', 'villa'],
    descEn:
      'Rivers by Tatweer Misr threads a network of water features through New Zayed, with residential clusters set between the streams and a wellness-focused club at the centre. Delivery starts in 2028 with a nine-year plan.',
    descAr:
      'يمتد مشروع ريفرز من تطوير مصر عبر شبكة من الممرات المائية في زايد الجديدة، حيث تتوزع المجموعات السكنية بين المجاري المائية ويتوسطها نادٍ يركز على الصحة والعافية. يبدأ التسليم في 2028 بنظام سداد تسع سنوات.',
    amenities: [
      'gated-community', 'security', 'cctv', 'pool', 'crystal-lagoon', 'clubhouse', 'gym', 'spa',
      'running-track', 'landscaped-gardens', 'kids-area', 'commercial-strip', 'maintenance',
    ],
  },

  // ----------------------------------------------------------- Heliopolis ---
  {
    slug: 'sheraton-heights',
    name: 'Sheraton Heights',
    nameAr: 'شيراتون هايتس',
    developerSlug: 'al-ahly-sabbour',
    areaSlug: 'heliopolis',
    geo: { lat: 30.093, lng: 31.362 },
    deliveryYear: 2026,
    installmentYears: 5,
    downPaymentPercent: 20,
    priceFactor: 1.05,
    weight: 4,
    areaRange: [100, 340],
    isFeatured: false,
    unitTypes: ['apartment', 'duplex', 'penthouse', 'office'],
    descEn:
      'Sheraton Heights is an infill residential project in Sheraton Heliopolis, five minutes from Cairo International Airport and Almaza. Al Ahly Sabbour delivers the units semi finished or fully finished, with covered parking and a small rooftop club.',
    descAr:
      'شيراتون هايتس مشروع سكني داخل نطاق شيراتون مصر الجديدة، على بعد خمس دقائق من مطار القاهرة الدولي والماظة. تسلّم الأهلي صبور الوحدات نصف تشطيب أو بتشطيب كامل، مع جراج مغطى ونادٍ صغير على السطح.',
    amenities: [
      'security', 'cctv', 'underground-parking', 'gym', 'pool', 'landscaped-gardens', 'kids-area',
      'commercial-strip', 'maintenance',
    ],
  },

  // --------------------------------------------------------- Ras El Hekma ---
  {
    slug: 'southmed',
    name: 'SouthMed',
    nameAr: 'ساوث ميد',
    developerSlug: 'talaat-moustafa-group',
    areaSlug: 'ras-el-hekma',
    geo: { lat: 31.113, lng: 27.796 },
    deliveryYear: 2029,
    installmentYears: 10,
    downPaymentPercent: 10,
    priceFactor: 1.2,
    weight: 5,
    areaRange: [90, 560],
    isFeatured: true,
    unitTypes: ['chalet', 'apartment', 'duplex', 'penthouse', 'twinhouse', 'villa'],
    descEn:
      'SouthMed is Talaat Moustafa Group\'s Ras El Hekma destination, a 1,000-acre coastal town with a marina district, hotels and a year-round downtown. Launch phases sold on a ten-year plan with delivery from 2029.',
    descAr:
      'ساوث ميد هي وجهة مجموعة طلعت مصطفى في رأس الحكمة، وهي مدينة ساحلية على 1000 فدان تضم منطقة مارينا وفنادق ووسط مدينة يعمل على مدار العام. طُرحت المراحل الأولى بنظام سداد عشر سنوات وتسليم يبدأ من 2029.',
    amenities: [
      'beach-access', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym', 'spa', 'security',
      'cctv', 'gated-community', 'commercial-strip', 'sports-courts', 'medical-center', 'maintenance',
    ],
  },
  {
    slug: 'mountain-view-ras-el-hekma',
    name: 'Mountain View Ras El Hekma',
    nameAr: 'ماونتن فيو رأس الحكمة',
    developerSlug: 'mountain-view',
    areaSlug: 'ras-el-hekma',
    geo: { lat: 31.129, lng: 27.842 },
    deliveryYear: 2029,
    installmentYears: 9,
    downPaymentPercent: 10,
    priceFactor: 1.12,
    weight: 4,
    areaRange: [85, 460],
    isFeatured: false,
    unitTypes: ['chalet', 'apartment', 'duplex', 'twinhouse', 'villa'],
    descEn:
      'Mountain View Ras El Hekma applies the developer\'s iCity concept to the coast, with a lagoon spine, a beach club and the Mountain View lifestyle programme running through the summer. The plot sits on a natural bay with shallow water and white sand.',
    descAr:
      'يطبق ماونتن فيو رأس الحكمة مفهوم iCity الخاص بالمطور على الساحل، بمحور بحيرات ونادٍ على الشاطئ وبرنامج ماونتن فيو لأسلوب الحياة طوال الصيف. تقع الأرض على خليج طبيعي بمياه ضحلة ورمال بيضاء.',
    amenities: [
      'beach-access', 'crystal-lagoon', 'pool', 'kids-pool', 'clubhouse', 'gym', 'spa', 'security',
      'cctv', 'gated-community', 'bbq-area', 'sports-courts', 'maintenance',
    ],
  },
];

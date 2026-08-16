/**
 * 14 Egyptian areas covered by the marketplace.
 *
 * `geo` holds real approximate coordinates (WGS84 decimal degrees).
 * `avgPricePerMeter` is the EGP/m² benchmark that drives property pricing in
 * build/properties.mjs — change it and every listing in that area re-prices.
 * `streets` is generator-only input for `location.address` and is stripped from
 * the emitted JSON.
 */
export const AREAS = [
  {
    slug: 'new-cairo',
    nameEn: 'New Cairo',
    nameAr: 'القاهرة الجديدة',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 30.0304, lng: 31.4913 },
    avgPricePerMeter: 55000,
    descEn:
      'New Cairo is the eastern hub of Greater Cairo and the most active primary market in Egypt, stretching from the Fifth Settlement and 90th Street through Katameya and up to the Ring Road. It combines gated compounds, international schools, business parks and the country\'s densest concentration of malls and restaurants.',
    descAr:
      'القاهرة الجديدة هي القلب الشرقي للقاهرة الكبرى وأنشط سوق عقاري أولي في مصر، وتمتد من التجمع الخامس وشارع التسعين مرورًا بالقطامية وحتى الطريق الدائري. تجمع بين الكومباوندات المغلقة والمدارس الدولية ومناطق الأعمال وأكبر تجمع للمولات والمطاعم في مصر.',
    streets: ['90th North Street', 'South Teseen Street', 'Katameya Heights Road', 'Ring Road Exit 24', 'Road 90'],
  },
  {
    slug: 'sheikh-zayed',
    nameEn: 'Sheikh Zayed',
    nameAr: 'الشيخ زايد',
    city: 'Giza',
    governorate: 'Giza',
    geo: { lat: 30.0771, lng: 30.9714 },
    avgPricePerMeter: 52000,
    descEn:
      'Sheikh Zayed City sits on the Cairo–Alexandria Desert Road, minutes from Arkan, Americana Plaza and Mall of Arabia. It is a mature, low-density district of villas and boutique apartment compounds that appeals to families working in Smart Village and Mohandessin.',
    descAr:
      'تقع مدينة الشيخ زايد على طريق القاهرة الإسكندرية الصحراوي على بعد دقائق من أركان وأمريكانا بلازا ومول العرب. حي ناضج منخفض الكثافة يضم الفيلات والكومباوندات السكنية الصغيرة، ويجذب العائلات العاملة في القرية الذكية والمهندسين.',
    streets: ['Cairo-Alexandria Desert Road', 'Zayed 2000 Street', 'Al Yasmeen District', '26th of July Corridor'],
  },
  {
    slug: 'north-coast',
    nameEn: 'North Coast',
    nameAr: 'الساحل الشمالي',
    city: 'Sidi Abdel Rahman',
    governorate: 'Matrouh',
    geo: { lat: 30.96, lng: 28.7 },
    avgPricePerMeter: 75000,
    descEn:
      'The North Coast, Sahel, runs west from Alexandria along the Mediterranean, with the premium stretch between Km 120 and Km 200 around Sidi Abdel Rahman. It is a summer-first market of chalets, beachfront villas and crystal lagoons, increasingly year-round thanks to the new Alamein towers and the Fouka Road.',
    descAr:
      'يمتد الساحل الشمالي غربًا من الإسكندرية على البحر المتوسط، وتقع أرقى مناطقه بين الكيلو 120 والكيلو 200 حول سيدي عبد الرحمن. سوق صيفي في المقام الأول من الشاليهات والفيلات على البحر والبحيرات الكريستالية، ويتحول تدريجيًا إلى وجهة على مدار العام بفضل أبراج العلمين وطريق فوكة.',
    streets: ['Alexandria–Marsa Matrouh Road Km 129', 'Sidi Abdel Rahman Bay', 'Coastal Road Km 136', 'Fouka Road'],
  },
  {
    slug: 'new-administrative-capital',
    nameEn: 'New Administrative Capital',
    nameAr: 'العاصمة الإدارية الجديدة',
    city: 'New Capital',
    governorate: 'Cairo',
    geo: { lat: 30.008, lng: 31.74 },
    avgPricePerMeter: 42000,
    descEn:
      'The New Administrative Capital is Egypt\'s purpose-built government and business centre east of Cairo, organised into residential districts R1 to R8 around the Green River park. Entry prices are lower than New Cairo and payment plans are the longest in the market, which makes it the country\'s main investment play.',
    descAr:
      'العاصمة الإدارية الجديدة هي المركز الحكومي والاقتصادي الجديد شرق القاهرة، وتنقسم إلى أحياء سكنية من R1 إلى R8 حول حديقة النهر الأخضر. أسعار الدخول أقل من القاهرة الجديدة وأنظمة السداد هي الأطول في السوق، ما يجعلها الوجهة الاستثمارية الأولى.',
    streets: ['R7 District', 'R8 District', 'Mohammed bin Zayed Axis', 'Green River Boulevard'],
  },
  {
    slug: '6th-of-october',
    nameEn: '6th of October',
    nameAr: 'مدينة 6 أكتوبر',
    city: 'Giza',
    governorate: 'Giza',
    geo: { lat: 29.9285, lng: 30.9188 },
    avgPricePerMeter: 38000,
    descEn:
      '6th of October City is West Cairo\'s largest satellite city, home to universities, industrial zones and a deep supply of apartments at some of the most accessible price points in Greater Cairo. Dahshur Link and the Ring Road put Mohandessin within a 25-minute drive off peak.',
    descAr:
      'مدينة 6 أكتوبر هي أكبر مدن غرب القاهرة، وتضم الجامعات والمناطق الصناعية ومعروضًا كبيرًا من الشقق بأسعار من الأنسب في القاهرة الكبرى. وصلة دهشور والطريق الدائري تجعلان المهندسين على بعد 25 دقيقة خارج أوقات الذروة.',
    streets: ['Waslet Dahshur Road', 'Central Axis', 'Al Motamayez District', 'Juhayna Square'],
  },
  {
    slug: 'mostakbal-city',
    nameEn: 'Mostakbal City',
    nameAr: 'مدينة المستقبل',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 30.048, lng: 31.63 },
    avgPricePerMeter: 36000,
    descEn:
      'Mostakbal City sits between New Cairo, Madinaty and the New Capital on the Suez Road, planned as a low-rise, solar-powered smart city. Prices are still below neighbouring New Cairo, and the district has attracted large master-planned launches from Tatweer Misr, Hassan Allam and Madinet Masr.',
    descAr:
      'تقع مدينة المستقبل بين القاهرة الجديدة ومدينتي والعاصمة الإدارية على طريق السويس، وقد خُطط لها كمدينة ذكية منخفضة الارتفاع تعتمد على الطاقة الشمسية. أسعارها ما زالت أقل من القاهرة الجديدة المجاورة، وجذبت مشروعات كبرى من تطوير مصر وحسن علام ومدينة مصر.',
    streets: ['Mostakbal City Main Spine', 'Suez Road Km 35', 'Middle Ring Road', 'North Gate Axis'],
  },
  {
    slug: 'madinaty',
    nameEn: 'Madinaty',
    nameAr: 'مدينتي',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 30.109, lng: 31.63 },
    avgPricePerMeter: 40000,
    descEn:
      'Madinaty is Talaat Moustafa Group\'s self-contained city on the Cairo–Suez Road, with its own schools, hospitals, golf course, craft zone and open-air retail. Deliveries have been running for over a decade, so it offers a rare mix of ready-to-move units and new phases on payment plans.',
    descAr:
      'مدينتي هي مدينة متكاملة لمجموعة طلعت مصطفى على طريق القاهرة السويس، ولها مدارسها ومستشفياتها وملعب الجولف والمنطقة الحرفية والمناطق التجارية المفتوحة. التسليمات مستمرة منذ أكثر من عشر سنوات، ما يوفر مزيجًا نادرًا من الوحدات الجاهزة والمراحل الجديدة بأنظمة سداد.',
    streets: ['Madinaty Boulevard', 'East Hub', 'Craft Zone Road', 'Open Air Mall Street'],
  },
  {
    slug: 'el-shorouk',
    nameEn: 'El Shorouk',
    nameAr: 'مدينة الشروق',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 30.125, lng: 31.61 },
    avgPricePerMeter: 32000,
    descEn:
      'El Shorouk City is an established residential city on the Cairo–Ismailia Desert Road, popular with families who want villas and large apartments at a fraction of New Cairo pricing. The Horreya Axis and the Regional Ring Road connect it to Heliopolis and the New Capital.',
    descAr:
      'مدينة الشروق مدينة سكنية عريقة على طريق القاهرة الإسماعيلية الصحراوي، يفضلها من يبحث عن فيلات وشقق كبيرة بجزء من أسعار القاهرة الجديدة. محور الحرية والطريق الدائري الإقليمي يربطانها بمصر الجديدة والعاصمة الإدارية.',
    streets: ['El Horreya Axis', 'Cairo–Ismailia Desert Road', 'Ganoub El Ahyaa', 'Nadi El Shorouk Street'],
  },
  {
    slug: 'ain-sokhna',
    nameEn: 'Ain Sokhna',
    nameAr: 'العين السخنة',
    city: 'Ain Sokhna',
    governorate: 'Suez',
    geo: { lat: 29.6, lng: 32.32 },
    avgPricePerMeter: 45000,
    descEn:
      'Ain Sokhna is the Red Sea coast closest to Cairo, around 120 km along the Suez Road, which makes it a weekend destination rather than a purely summer one. The Galala plateau projects added mountain-view chalets and hotel-serviced units to the traditional beachfront supply.',
    descAr:
      'العين السخنة هي أقرب سواحل البحر الأحمر إلى القاهرة على بعد نحو 120 كم عبر طريق السويس، ما يجعلها وجهة لعطلات نهاية الأسبوع طوال العام وليست صيفية فقط. أضافت مشروعات هضبة الجلالة شاليهات بإطلالات جبلية ووحدات بخدمات فندقية إلى المعروض على البحر مباشرة.',
    streets: ['Zaafarana Road Km 45', 'Galala Mountain Road', 'Porto Sokhna Road', 'Suez–Sokhna Highway'],
  },
  {
    slug: 'maadi',
    nameEn: 'Maadi',
    nameAr: 'المعادي',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 29.96, lng: 31.257 },
    avgPricePerMeter: 60000,
    descEn:
      'Maadi is the leafy Nile-side district of southern Cairo, long favoured by diplomats and the expat community for its tree-lined streets, international schools and metro access. Supply is dominated by resale apartments in Degla and Sarayat, with a handful of new boutique buildings.',
    descAr:
      'المعادي حي هادئ على النيل جنوب القاهرة، فضّله الدبلوماسيون والجاليات الأجنبية لعقود بفضل شوارعه المشجّرة ومدارسه الدولية ومحطات المترو. يغلب على المعروض شقق إعادة البيع في دجلة والسرايات، مع عدد محدود من العمارات الجديدة المميزة.',
    streets: ['Road 9', 'Street 250', 'Corniche El Nil', 'Degla Road 199'],
  },
  {
    slug: 'zamalek',
    nameEn: 'Zamalek',
    nameAr: 'الزمالك',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 30.06, lng: 31.22 },
    avgPricePerMeter: 95000,
    descEn:
      'Zamalek occupies the northern half of Gezira Island in the middle of the Nile and remains the most expensive residential address in Cairo per square metre. Stock is almost entirely resale: high-ceilinged 1930s–1960s apartments, embassies, galleries and the Gezira Sporting Club.',
    descAr:
      'يقع الزمالك في النصف الشمالي من جزيرة الجزيرة وسط النيل، وما زال أغلى عنوان سكني في القاهرة من حيث سعر المتر. المعروض كله تقريبًا إعادة بيع: شقق بأسقف عالية من الثلاثينيات إلى الستينيات، إلى جانب السفارات وقاعات الفن ونادي الجزيرة.',
    streets: ['Abou El Feda Street', 'Brazil Street', 'Ismail Mohamed Street', '26th of July Street'],
  },
  {
    slug: 'new-zayed',
    nameEn: 'New Zayed',
    nameAr: 'زايد الجديدة',
    city: 'Giza',
    governorate: 'Giza',
    geo: { lat: 30.018, lng: 30.86 },
    avgPricePerMeter: 58000,
    descEn:
      'New Sheikh Zayed is the western extension of Zayed towards the Dabaa Axis and Sphinx International Airport, and the fastest-appreciating district in West Cairo. Plots were released to major developers from 2021 onwards, so almost everything here is off-plan with delivery between 2027 and 2030.',
    descAr:
      'زايد الجديدة هي الامتداد الغربي للشيخ زايد نحو محور الضبعة ومطار سفنكس الدولي، وأسرع مناطق غرب القاهرة نموًا في الأسعار. طُرحت أراضيها على كبار المطورين اعتبارًا من 2021، لذا فمعظم المعروض تحت الإنشاء بتسليم بين 2027 و2030.',
    streets: ['Dabaa Axis', 'Sphinx Airport Road', 'New Zayed Main Spine', 'Wahat Road'],
  },
  {
    slug: 'heliopolis',
    nameEn: 'Heliopolis',
    nameAr: 'مصر الجديدة',
    city: 'Cairo',
    governorate: 'Cairo',
    geo: { lat: 30.088, lng: 31.322 },
    avgPricePerMeter: 48000,
    descEn:
      'Heliopolis is the historic Baron district of north-east Cairo, minutes from Cairo International Airport and connected to downtown by the third metro line. It mixes protected early-twentieth-century architecture in Korba with newer towers around Almaza and Nozha.',
    descAr:
      'مصر الجديدة هي حي البارون التاريخي في شمال شرق القاهرة، على بعد دقائق من مطار القاهرة الدولي ومتصلة بوسط البلد عبر الخط الثالث للمترو. تجمع بين العمارة المحمية من أوائل القرن العشرين في الكوربة والأبراج الأحدث حول الماظة والنزهة.',
    streets: ['Al Nozha Street', 'Cleopatra Street', 'El Thawra Street', 'Almaza Square'],
  },
  {
    slug: 'ras-el-hekma',
    nameEn: 'Ras El Hekma',
    nameAr: 'رأس الحكمة',
    city: 'Ras El Hekma',
    governorate: 'Matrouh',
    geo: { lat: 31.12, lng: 27.8 },
    avgPricePerMeter: 85000,
    descEn:
      'Ras El Hekma is the headland at Km 190 of the Alexandria–Matrouh road, with the clearest water on the Egyptian Mediterranean and the largest coastal development programme in the country following the 2024 investment deal. Land values re-rated sharply, and every launch here sells on long payment plans.',
    descAr:
      'رأس الحكمة رأس بحري عند الكيلو 190 على طريق الإسكندرية مطروح، وتتمتع بأنقى مياه على البحر المتوسط المصري وأكبر برنامج تطوير ساحلي في البلاد بعد صفقة الاستثمار في 2024. ارتفعت قيم الأراضي بشكل حاد، وتُطرح جميع المشروعات بأنظمة سداد طويلة.',
    streets: ['Coastal Road Km 190', 'Ras El Hekma Bay', 'Alex–Matrouh Road Km 200', 'Hekma Marina Street'],
  },
];

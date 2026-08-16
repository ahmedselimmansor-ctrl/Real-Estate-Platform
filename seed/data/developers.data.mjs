/**
 * 12 Egyptian developers.
 *
 * `projectsCount` is NOT stored here — it is computed in build/developers.mjs
 * from the number of compounds each developer owns in compounds.json, so the
 * seed stays internally consistent.
 *
 * Phone numbers are marketing hotlines in Egyptian short-code format and are
 * placeholders for the demo dataset, not live customer-service lines.
 */
export const DEVELOPERS = [
  {
    slug: 'palm-hills',
    name: 'Palm Hills Developments',
    nameAr: 'بالم هيلز للتطوير العقاري',
    foundedYear: 2005,
    website: 'https://www.palmhillsdevelopments.com',
    phone: '16091',
    descEn:
      'Palm Hills Developments is one of Egypt\'s largest listed developers, with a land bank spread across West Cairo, East Cairo and the North Coast. Its portfolio ranges from the mature Palm Hills October and Palm Hills New Cairo communities to Badya, a 3,000-acre smart city, and the Hacienda family of coastal resorts.',
    descAr:
      'بالم هيلز للتطوير العقاري من أكبر المطورين المقيدين بالبورصة المصرية، ولديها محفظة أراضٍ تمتد في غرب القاهرة وشرقها والساحل الشمالي. تتنوع مشروعاتها بين مجتمعات بالم هيلز أكتوبر والقاهرة الجديدة الناضجة، ومدينة بادية الذكية على مساحة 3000 فدان، وسلسلة منتجعات هاسيندا الساحلية.',
  },
  {
    slug: 'sodic',
    name: 'SODIC',
    nameAr: 'سوديك',
    foundedYear: 1996,
    website: 'https://www.sodic.com',
    phone: '16220',
    descEn:
      'SODIC (Sixth of October Development & Investment Company) is known for design-led, low-density communities and for delivering on schedule. Allegria and SODIC West anchor its West Cairo presence, while Eastown and Villette serve New Cairo and June and Caesar cover the North Coast.',
    descAr:
      'سوديك (شركة السادس من أكتوبر للتنمية والاستثمار) معروفة بمجتمعاتها منخفضة الكثافة ذات التصميم المميز وبالالتزام بمواعيد التسليم. تمثل أليجريا وسوديك ويست حضورها في غرب القاهرة، بينما تخدم إيستاون وفيليت القاهرة الجديدة، ويغطي مشروعا جون وقيصر الساحل الشمالي.',
  },
  {
    slug: 'emaar-misr',
    name: 'Emaar Misr',
    nameAr: 'إعمار مصر',
    foundedYear: 2005,
    website: 'https://www.emaarmisr.com',
    phone: '16116',
    descEn:
      'Emaar Misr is the Egyptian arm of Emaar Properties and brings the group\'s master-community model to Cairo and the coast. Mivida in New Cairo, Uptown Cairo on the Mokattam plateau, Cairo Gate on the Alexandria Desert Road and Marassi in Sidi Abdel Rahman are its flagship developments.',
    descAr:
      'إعمار مصر هي الذراع المصرية لشركة إعمار العقارية، وتنقل نموذج المجتمعات المتكاملة إلى القاهرة والساحل. تُعد ميفيدا في القاهرة الجديدة، وأب تاون كايرو على هضبة المقطم، وكايرو جيت على الطريق الصحراوي، ومراسي في سيدي عبد الرحمن أبرز مشروعاتها.',
  },
  {
    slug: 'talaat-moustafa-group',
    name: 'Talaat Moustafa Group',
    nameAr: 'مجموعة طلعت مصطفى',
    foundedYear: 1975,
    website: 'https://www.talaatmoustafa.com',
    phone: '16116',
    descEn:
      'Talaat Moustafa Group is Egypt\'s largest community developer, responsible for Al Rehab and Madinaty, self-contained cities housing hundreds of thousands of residents, as well as Celia in the New Capital and the SouthMed project in Ras El Hekma. The group also owns and operates hotels through ICON.',
    descAr:
      'مجموعة طلعت مصطفى هي أكبر مطور للمجتمعات السكنية في مصر، وصاحبة الرحاب ومدينتي، وهما مدينتان متكاملتان يقطنهما مئات الآلاف، إضافة إلى سيليا في العاصمة الإدارية ومشروع ساوث ميد في رأس الحكمة. كما تمتلك المجموعة وتدير فنادق عبر شركة آيكون.',
  },
  {
    slug: 'mountain-view',
    name: 'Mountain View',
    nameAr: 'ماونتن فيو',
    foundedYear: 2005,
    website: 'https://www.mountainviewegypt.com',
    phone: '16268',
    descEn:
      'Mountain View, the residential arm of DMG, built its reputation on the iCity concept, walkable districts organised around large central parks, with projects in New Cairo, October, Ain Sokhna and Ras El Hekma. The developer is known for lifestyle programming and hotel-style community management.',
    descAr:
      'ماونتن فيو، الذراع السكنية لمجموعة DMG، بنت سمعتها على مفهوم iCity القائم على أحياء صديقة للمشاة حول حدائق مركزية كبرى، ولها مشروعات في القاهرة الجديدة وأكتوبر والعين السخنة ورأس الحكمة. يشتهر المطور ببرامج أسلوب الحياة وإدارة المجتمعات على الطريقة الفندقية.',
  },
  {
    slug: 'ora-developers',
    name: 'Ora Developers',
    nameAr: 'أورا ديفلوبرز',
    foundedYear: 2016,
    website: 'https://www.oradevelopers.com',
    phone: '16606',
    descEn:
      'Ora Developers, founded by Naguib Sawiris, positions itself at the top of the market with the ZED brand in Sheikh Zayed and New Cairo, Silver Sands in the North Coast and Solana in New Zayed. Projects are design-heavy, tower-led and paired with members-only sports and social clubs.',
    descAr:
      'أورا ديفلوبرز، التي أسسها نجيب ساويرس، تضع نفسها في قمة السوق عبر علامة زيد في الشيخ زايد والقاهرة الجديدة، وسيلفر ساندز في الساحل الشمالي، وسولانا في زايد الجديدة. تتميز مشروعاتها بالتصميم اللافت والأبراج السكنية والنوادي الرياضية والاجتماعية الخاصة بالأعضاء.',
  },
  {
    slug: 'hassan-allam-properties',
    name: 'Hassan Allam Properties',
    nameAr: 'حسن علام العقارية',
    foundedYear: 2016,
    website: 'https://www.hassanallamproperties.com',
    phone: '16992',
    descEn:
      'Hassan Allam Properties is the real-estate development platform of Hassan Allam Holding, a construction group operating in Egypt since 1936. Its in-house contracting capability underpins projects such as Swan Lake, Haptown in Mostakbal City and Seazen on the North Coast.',
    descAr:
      'حسن علام العقارية هي ذراع التطوير العقاري لمجموعة حسن علام القابضة العاملة في المقاولات في مصر منذ عام 1936. تعتمد مشروعاتها مثل سوان ليك وهابتاون في مدينة المستقبل وسيزن في الساحل الشمالي على قدرات التنفيذ الذاتية للمجموعة.',
  },
  {
    slug: 'misr-italia',
    name: 'Misr Italia Properties',
    nameAr: 'مصر إيطاليا العقارية',
    foundedYear: 1998,
    website: 'https://www.misritaliaproperties.com',
    phone: '16172',
    descEn:
      'Misr Italia Properties built the IL BOSCO brand of forest-inspired communities, with IL BOSCO in the New Capital, IL BOSCO City in Mostakbal City and Kai in Ain Sokhna. The developer was an early adopter of vertical-garden facades and smart-home packages in the Egyptian market.',
    descAr:
      'أسست مصر إيطاليا العقارية علامة إل بوسكو المستوحاة من الغابات، بمشروعات إل بوسكو في العاصمة الإدارية وإل بوسكو سيتي في مدينة المستقبل وكاي في العين السخنة. كان المطور من أوائل من أدخلوا واجهات الحدائق الرأسية وأنظمة المنزل الذكي إلى السوق المصري.',
  },
  {
    slug: 'tatweer-misr',
    name: 'Tatweer Misr',
    nameAr: 'تطوير مصر',
    foundedYear: 2014,
    website: 'https://www.tatweermisr.com',
    phone: '16388',
    descEn:
      'Tatweer Misr focuses on integrated destinations with an education and wellness component: Bloomfields in Mostakbal City, IL Monte Galala on the Sokhna cliffs, Fouka Bay in Ras El Hekma and Rivers in New Zayed. The company was among the first to package university partnerships with residential launches.',
    descAr:
      'تركز تطوير مصر على الوجهات المتكاملة التي تضم مكونات تعليمية وصحية: بلومفيلدز في مدينة المستقبل، وإل مونت جلالة على منحدرات السخنة، وفوكا باي في رأس الحكمة، وريفرز في زايد الجديدة. كانت الشركة من أوائل من ربطوا الشراكات الجامعية بالمشروعات السكنية.',
  },
  {
    slug: 'al-ahly-sabbour',
    name: 'Al Ahly Sabbour',
    nameAr: 'الأهلي صبور للتنمية العقارية',
    foundedYear: 1994,
    website: 'https://www.alahlysabbour.com',
    phone: '16116',
    descEn:
      'Al Ahly Sabbour Developments is a joint venture between the National Bank of Egypt and the Sabbour family, with more than thirty projects delivered across Cairo, the North Coast and Sokhna. The company is known for conservative delivery timelines and for in-city infill projects in Maadi and Heliopolis.',
    descAr:
      'الأهلي صبور للتنمية العقارية شركة مشتركة بين البنك الأهلي المصري وعائلة صبور، وسلّمت أكثر من ثلاثين مشروعًا في القاهرة والساحل الشمالي والسخنة. تشتهر الشركة بالالتزام بجداول تسليم متحفظة وبمشروعات داخل المدينة في المعادي ومصر الجديدة.',
  },
  {
    slug: 'madinet-masr',
    name: 'Madinet Masr',
    nameAr: 'مدينة مصر للإسكان والتعمير',
    foundedYear: 1959,
    website: 'https://www.madinetmasr.com',
    phone: '16690',
    descEn:
      'Madinet Masr, formerly Madinet Nasr for Housing and Development, is one of the oldest listed developers in Egypt and the original master developer of Nasr City. Taj City on the Suez Road and Sarai near Mostakbal City are its two flagship communities today.',
    descAr:
      'مدينة مصر للإسكان والتعمير، المعروفة سابقًا بمدينة نصر للإسكان والتعمير، من أقدم المطورين المقيدين بالبورصة المصرية وهي المطور الأصلي لمدينة نصر. ويُعد مشروعا تاج سيتي على طريق السويس وسراي بجوار مدينة المستقبل أبرز مجتمعاتها حاليًا.',
  },
  {
    slug: 'la-vista',
    name: 'La Vista Developments',
    nameAr: 'لافيستا للتطوير العقاري',
    foundedYear: 1991,
    website: 'https://www.lavistadevelopments.com',
    phone: '16116',
    descEn:
      'La Vista Developments has delivered more than twenty coastal and residential projects, mostly fully finished, which is unusual in the Egyptian primary market. La Vista City in the New Capital and the El Patio series in El Shorouk and New Heliopolis are its best-known Cairo communities.',
    descAr:
      'سلّمت لافيستا للتطوير العقاري أكثر من عشرين مشروعًا ساحليًا وسكنيًا، معظمها بتشطيب كامل وهو أمر غير معتاد في السوق الأولي المصري. ويُعد مشروع لافيستا سيتي في العاصمة الإدارية وسلسلة الباتيو في الشروق ومصر الجديدة الجديدة أشهر مجتمعاتها في القاهرة.',
  },
];

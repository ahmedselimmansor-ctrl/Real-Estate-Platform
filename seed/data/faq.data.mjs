/**
 * 40 customer-support Q&A entries for the RAG knowledge base (rag-svc ingests
 * these into `rag_documents` / `rag_chunks`).
 *
 * `key` is the stable slug the UUID is derived from. Categories are exactly:
 * buying_process, payment_plans, mortgage, legal_documents, delivery_handover,
 * nawy_services, resale, rental, fees_taxes, account_support — four entries each.
 *
 * The answers describe general Egyptian market practice for a demo dataset.
 * They are not legal, tax or financial advice, and figures such as fee caps,
 * tax thresholds and subsidised mortgage terms change with legislation.
 */
export const FAQ = [
  // ------------------------------------------------------- buying_process ---
  {
    key: 'how-to-buy-through-nawy',
    category: 'buying_process',
    tags: ['buying', 'reservation', 'consultant', 'primary', 'process'],
    questionEn: 'How do I buy a property through Nawy?',
    questionAr: 'إزاي أشتري وحدة من خلال ناوي؟',
    answerEn:
      'Start by shortlisting units with the filters for area, compound, budget, delivery date and payment plan, then request a call from any listing. A property consultant checks live availability with the developer, sends you the current price list and the plans that fit your budget, and arranges a site visit or a video walkthrough. When you pick a unit you sign a reservation form and pay the reservation deposit directly to the developer, in the developer\'s name, never to an individual. The developer then issues the preliminary contract (عقد ابتدائي), usually within two to six weeks, and the consultant stays with you through signing. For primary units the developer pays the brokerage fee, so the price you pay is the developer\'s own price list.',
    answerAr:
      'ابدأ بتحديد الوحدات المناسبة باستخدام فلاتر المنطقة والكومباوند والميزانية وموعد التسليم ونظام السداد، ثم اطلب مكالمة من صفحة أي وحدة. يتأكد مستشار العقارات من التوافر الفعلي لدى المطور، ويرسل لك قائمة الأسعار الحالية وأنظمة السداد المناسبة لميزانيتك، ثم ينظم زيارة للموقع أو جولة بالفيديو. عند اختيار الوحدة توقّع استمارة الحجز وتدفع مقدم الحجز مباشرة للمطور وباسم الشركة وليس لأي شخص بصفته الفردية. بعدها يصدر المطور العقد الابتدائي خلال أسبوعين إلى ستة أسابيع غالبًا، ويظل المستشار معك حتى التوقيع. في السوق الأولي يتحمل المطور عمولة التسويق، وبالتالي تدفع نفس سعر قائمة أسعار المطور.',
  },
  {
    key: 'documents-to-reserve-a-unit',
    category: 'buying_process',
    tags: ['documents', 'reservation', 'national-id', 'expats', 'kyc'],
    questionEn: 'What documents do I need to reserve a unit?',
    questionAr: 'ما هي المستندات المطلوبة لحجز وحدة؟',
    answerEn:
      'For an Egyptian buyer the developer normally asks for a copy of a valid national ID, a recent utility bill or any proof of address, and the reservation cheque or bank transfer receipt. On longer payment plans some developers also request a simple employment letter or recent bank statements. Foreign buyers provide a passport copy and, in most cases, evidence that the funds were transferred into Egypt through a local bank, this matters later if you want to repatriate the sale proceeds. Companies add a commercial register extract, tax card and a board resolution authorising the purchase. Keep the reservation receipt safe: until the contract is issued it is your only proof that the unit is blocked in your name.',
    answerAr:
      'بالنسبة للمشتري المصري يطلب المطور عادةً صورة بطاقة رقم قومي سارية، وإيصال مرافق حديث أو أي إثبات لمحل الإقامة، وشيك الحجز أو إيصال التحويل البنكي. ومع أنظمة السداد الطويلة قد يطلب بعض المطورين خطاب من جهة العمل أو كشف حساب بنكي لآخر عدة أشهر. أما المشتري الأجنبي فيقدم صورة جواز السفر، وفي أغلب الحالات ما يثبت تحويل قيمة الشراء إلى مصر عبر بنك محلي، وهو أمر مهم لاحقًا عند رغبتك في تحويل حصيلة البيع للخارج. وتضيف الشركات مستخرج السجل التجاري والبطاقة الضريبية وقرار مجلس الإدارة بالشراء. احتفظ بإيصال الحجز جيدًا، فهو الدليل الوحيد على حجز الوحدة باسمك حتى صدور العقد.',
  },
  {
    key: 'foreigners-buying-property-egypt',
    category: 'buying_process',
    tags: ['foreigners', 'expats', 'ownership-law', 'residency', 'law-230-1996'],
    questionEn: 'Can foreigners buy property in Egypt?',
    questionAr: 'هل يستطيع الأجانب شراء عقارات في مصر؟',
    answerEn:
      'Yes. Law 230 of 1996 allows non-Egyptians to own up to two residential properties for personal use, each on a plot of no more than 4,000 m², provided the property is not in a restricted zone such as parts of Sinai and is not a listed historic building. Ownership is documented and registered in the buyer\'s name exactly as it is for Egyptians, and transferring the purchase money through an Egyptian bank makes repatriating the proceeds much easier when you sell. Property purchases above certain values can also support residency applications, but the thresholds and the issuing authority have changed several times, so confirm the current rules with a property lawyer or the developer\'s legal team before transferring funds.',
    answerAr:
      'نعم. يسمح القانون رقم 230 لسنة 1996 لغير المصريين بتملك عقارين سكنيين على الأكثر للاستخدام الشخصي، على ألا تزيد مساحة الأرض في كل منهما عن 4000 متر مربع، وألا يقع العقار في المناطق المحظورة مثل أجزاء من سيناء، وألا يكون من المباني ذات الطراز التاريخي. ويُوثَّق التملك ويُسجَّل باسم المشتري تمامًا كما هو الحال مع المصريين، كما أن تحويل قيمة الشراء عبر بنك مصري يسهّل كثيرًا إعادة تحويل حصيلة البيع للخارج لاحقًا. كذلك قد يدعم شراء عقار بقيمة معينة طلب الإقامة، لكن الحدود والجهة المختصة تغيرت أكثر من مرة، لذا تأكد من القواعد السارية مع محامٍ عقاري أو الإدارة القانونية للمطور قبل تحويل الأموال.',
  },
  {
    key: 'how-long-purchase-takes',
    category: 'buying_process',
    tags: ['timeline', 'contract', 'resale', 'registration', 'process'],
    questionEn: 'How long does the process take from reservation to contract?',
    questionAr: 'كم يستغرق الأمر من الحجز حتى توقيع العقد؟',
    answerEn:
      'Reservation itself is immediate: you pay the deposit and the unit is blocked in your name, typically for two to four weeks. The developer then prepares the preliminary contract, and signing usually happens within two to six weeks depending on how quickly you complete the down payment and how busy the sales cycle is. Resale purchases take longer because you also need the seller\'s original contract, a developer no-objection letter and the transfer approval, which adds three to eight weeks. Registration at the Real Estate Publicity Department (الشهر العقاري) is a separate track that can normally only start after delivery, once the building licence and the land title chain are complete.',
    answerAr:
      'الحجز نفسه فوري: تدفع مقدم الحجز فتُحجز الوحدة باسمك لمدة أسبوعين إلى أربعة أسابيع غالبًا. بعدها يجهّز المطور العقد الابتدائي، ويتم التوقيع خلال أسبوعين إلى ستة أسابيع حسب سرعة استكمالك للمقدم وضغط دورة المبيعات لدى الشركة. أما شراء وحدة بإعادة البيع فيستغرق وقتًا أطول لأنه يحتاج أيضًا إلى عقد البائع الأصلي وخطاب عدم ممانعة من المطور وموافقة التنازل، وهو ما يضيف من ثلاثة إلى ثمانية أسابيع. أما التسجيل في الشهر العقاري فهو مسار منفصل لا يبدأ عادةً إلا بعد التسليم واكتمال ترخيص المبنى وسلسلة ملكية الأرض.',
  },

  // --------------------------------------------------------- payment_plans ---
  {
    key: 'typical-payment-plan',
    category: 'payment_plans',
    tags: ['payment-plan', 'down-payment', 'installments', 'primary', 'delivery'],
    questionEn: 'What does a typical payment plan look like for a primary unit?',
    questionAr: 'ما هو نظام السداد المعتاد للوحدات في السوق الأولي؟',
    answerEn:
      'The Egyptian primary market runs on developer instalments rather than bank finance. A standard plan today is a 5% to 15% down payment with the balance in equal quarterly instalments over six to ten years, and delivery two to four years after contract. Longer plans of ten to twelve years appear in the New Administrative Capital and Mostakbal City, usually at a slightly higher headline price. Most developers also collect a maintenance deposit of 8% to 10% of the unit price near handover, and some add a club membership fee. No interest rate is quoted on the instalments, but the cash price is always materially lower than the instalment price, that gap is the real cost of the plan.',
    answerAr:
      'يعتمد السوق الأولي في مصر على أقساط المطور وليس على التمويل البنكي. النظام المعتاد اليوم هو مقدم من 5% إلى 15% والباقي على أقساط ربع سنوية متساوية لمدة ست إلى عشر سنوات، مع تسليم بعد سنتين إلى أربع سنوات من التعاقد. وتظهر أنظمة أطول تصل إلى عشر أو اثنتي عشرة سنة في العاصمة الإدارية ومدينة المستقبل، وغالبًا بسعر إجمالي أعلى قليلًا. كما يحصّل معظم المطورين وديعة صيانة بنسبة 8% إلى 10% من سعر الوحدة قرب الاستلام، ويضيف بعضهم اشتراك النادي. لا تُذكر فائدة على الأقساط، لكن سعر الكاش دائمًا أقل بوضوح من سعر التقسيط، وهذا الفرق هو التكلفة الحقيقية للنظام.',
  },
  {
    key: 'cash-discount',
    category: 'payment_plans',
    tags: ['cash-discount', 'negotiation', 'pricing', 'down-payment'],
    questionEn: 'Can I get a discount if I pay cash?',
    questionAr: 'هل يوجد خصم عند الدفع كاش؟',
    answerEn:
      'Yes, and it is significant. Because instalment pricing already embeds the cost of deferring payment, developers typically discount 25% to 40% off the list price for full cash settlement, and 10% to 20% for short plans of one to three years. The exact number moves with interest rates and with how much of the phase is still unsold, so it is worth asking again at quarter end. If you cannot pay everything up front, a hybrid usually captures most of the benefit: a large down payment of 30% to 50% with the balance over two years. Before committing, compare the discount against what the same money would earn in a bank certificate over the same period.',
    answerAr:
      'نعم، والخصم كبير. لأن سعر التقسيط يتضمن أصلًا تكلفة تأجيل السداد، يقدم المطورون عادةً خصمًا من 25% إلى 40% على سعر القائمة عند السداد كاش بالكامل، ومن 10% إلى 20% للأنظمة القصيرة من سنة إلى ثلاث سنوات. وتتغير النسبة مع أسعار الفائدة ومع نسبة ما تبقى من المرحلة دون بيع، لذا يستحق الأمر السؤال مجددًا في نهاية كل ربع سنة. وإذا لم تستطع السداد بالكامل، فإن النظام المختلط يحقق معظم الفائدة: مقدم كبير من 30% إلى 50% والباقي على سنتين. وقبل اتخاذ القرار قارن قيمة الخصم بعائد نفس المبلغ في شهادة بنكية خلال المدة نفسها.',
  },
  {
    key: 'missed-installment',
    category: 'payment_plans',
    tags: ['late-payment', 'penalty', 'contract-clauses', 'cancellation'],
    questionEn: 'What happens if I miss an instalment?',
    questionAr: 'ماذا يحدث إذا تأخرت عن سداد قسط؟',
    answerEn:
      'Contracts include a grace period, commonly two weeks to a month, after which a delay penalty accrues on the late amount, often calculated daily at a rate written into the contract. If the delay continues the developer sends formal notices and, in the worst case, can cancel the contract and deduct a cancellation percentage from everything you have already paid. In practice most developers prefer to reschedule rather than cancel: contact the collections team before the due date and ask to postpone or split the instalment. Read the penalty and cancellation clauses before signing, they vary widely between developers and are the part of the contract buyers most often skip.',
    answerAr:
      'تتضمن العقود فترة سماح تتراوح غالبًا بين أسبوعين وشهر، وبعدها تُحتسب غرامة تأخير على المبلغ المستحق، وتُحسب في الغالب يوميًا بنسبة منصوص عليها في العقد. وإذا استمر التأخير يرسل المطور إنذارات رسمية، وفي أسوأ الحالات يحق له فسخ العقد وخصم نسبة من إجمالي ما سددته. لكن عمليًا يفضل معظم المطورين إعادة الجدولة على الفسخ، لذا تواصل مع إدارة التحصيل قبل موعد الاستحقاق واطلب تأجيل القسط أو تقسيمه. اقرأ بنود الغرامة والفسخ جيدًا قبل التوقيع، فهي تختلف كثيرًا من مطور لآخر وهي أكثر البنود التي يتجاهلها المشترون.',
  },
  {
    key: 'reschedule-payment-plan',
    category: 'payment_plans',
    tags: ['rescheduling', 'contract-annex', 'collections', 'flexibility'],
    questionEn: 'Can I change my payment plan after signing?',
    questionAr: 'هل يمكن تعديل نظام السداد بعد التوقيع؟',
    answerEn:
      'Sometimes. Most developers allow a one-off rescheduling, extending the remaining instalments or moving a due date, against a fee or a small price adjustment, decided case by case by the collections department. Shortening a plan is usually straightforward and may earn you a discount on the remaining balance, because the developer receives the money earlier. Going the other way, from a short plan to a longer one, is harder and is often repriced upward. Request the change in writing before the instalment falls due, and make sure whatever is agreed is documented in an annex signed and stamped by the developer rather than agreed verbally over the phone.',
    answerAr:
      'أحيانًا. يسمح معظم المطورين بإعادة جدولة لمرة واحدة، سواء بمد الأقساط المتبقية أو تحريك موعد الاستحقاق، مقابل رسوم أو تعديل بسيط في السعر، ويُبت في الطلب حالة بحالة عبر إدارة التحصيل. وتقصير مدة السداد عادةً أسهل وقد يمنحك خصمًا على الرصيد المتبقي لأن المطور يحصل على أمواله مبكرًا. أما التحول من نظام قصير إلى نظام أطول فأصعب وغالبًا ما يُعاد تسعيره بالزيادة. قدّم الطلب كتابةً قبل موعد استحقاق القسط، واحرص على توثيق ما يُتفق عليه في ملحق للعقد موقّع ومختوم من المطور وليس اتفاقًا شفهيًا عبر الهاتف.',
  },

  // -------------------------------------------------------------- mortgage ---
  {
    key: 'mortgage-availability',
    category: 'mortgage',
    tags: ['mortgage', 'banks', 'financing', 'ltv', 'tenor'],
    questionEn: 'Can I get a mortgage in Egypt?',
    questionAr: 'هل يمكنني الحصول على تمويل عقاري في مصر؟',
    answerEn:
      'Yes, though mortgages remain a small share of the market compared with developer instalments. Egyptian banks finance up to roughly 80% to 90% of the unit value for terms of up to twenty or thirty years, with the monthly instalment capped at a percentage of your documented income, commonly around 40%. The decisive condition is that the unit must be finished and registrable: banks will not lend against a unit that has not been delivered or whose ownership chain cannot be registered at the Real Estate Publicity Department. Rates track the Central Bank corridor and change frequently, so ask each bank for a written offer stating the rate type, tenor, fees and early-settlement terms.',
    answerAr:
      'نعم، رغم أن التمويل العقاري ما زال يمثل حصة صغيرة من السوق مقارنة بأقساط المطورين. تموّل البنوك المصرية نحو 80% إلى 90% من قيمة الوحدة لمدد تصل إلى عشرين أو ثلاثين عامًا، مع تحديد سقف للقسط الشهري كنسبة من دخلك الموثق تبلغ عادةً نحو 40%. والشرط الحاسم أن تكون الوحدة مكتملة وقابلة للتسجيل، إذ لا تموّل البنوك وحدة لم تُسلَّم أو لا يمكن تسجيل سلسلة ملكيتها في الشهر العقاري. وتتحرك أسعار الفائدة مع سعر البنك المركزي وتتغير باستمرار، لذا اطلب من كل بنك عرضًا مكتوبًا يوضح نوع الفائدة والمدة والمصروفات وشروط السداد المبكر.',
  },
  {
    key: 'mortgage-banks-requirements',
    category: 'mortgage',
    tags: ['mortgage', 'documents', 'banks', 'valuation', 'approval'],
    questionEn: 'Which banks offer mortgages and what do they ask for?',
    questionAr: 'ما البنوك التي تقدم التمويل العقاري وما المستندات المطلوبة؟',
    answerEn:
      'Most large Egyptian banks run a mortgage desk, the National Bank of Egypt, Banque Misr, CIB, QNB Alahli, Bank of Alexandria and the Housing and Development Bank among them, alongside licensed mortgage finance companies. A salaried applicant is typically asked for a national ID, a salary certificate and HR letter, six to twelve months of bank statements and a recent utility bill. Business owners provide a commercial register, tax card and financial statements. On the property side the bank needs the sale contract, the seller\'s or developer\'s title documents, the building licence and a valuation by its own surveyor. Approval usually takes two to six weeks once the file is complete, and the valuation, not the contract price, sets the loan amount.',
    answerAr:
      'تقدم معظم البنوك المصرية الكبرى تمويلًا عقاريًا، ومنها البنك الأهلي المصري وبنك مصر والبنك التجاري الدولي وبنك قطر الوطني الأهلي وبنك الإسكندرية وبنك التعمير والإسكان، إضافة إلى شركات التمويل العقاري المرخصة. ويُطلب من الموظف عادةً بطاقة الرقم القومي وشهادة راتب وخطاب من جهة العمل وكشف حساب لآخر ستة إلى اثني عشر شهرًا وإيصال مرافق حديث. أما أصحاب الأعمال فيقدمون السجل التجاري والبطاقة الضريبية والقوائم المالية. وعلى جانب العقار يحتاج البنك إلى عقد البيع ومستندات ملكية البائع أو المطور وترخيص المبنى وتقييم من خبير البنك. وتستغرق الموافقة عادةً من أسبوعين إلى ستة أسابيع بعد اكتمال الملف، ويحدد التقييم قيمة التمويل وليس سعر العقد.',
  },
  {
    key: 'cbe-mortgage-initiative',
    category: 'mortgage',
    tags: ['cbe-initiative', 'subsidised', 'eligibility', 'income-bands', 'mortgage'],
    questionEn: 'What is the Central Bank mortgage initiative?',
    questionAr: 'ما هي مبادرة التمويل العقاري من البنك المركزي؟',
    answerEn:
      'The Central Bank of Egypt has run subsidised mortgage programmes through the banks for low and middle income buyers, offering long tenors of twenty to thirty years at reduced declining rates far below commercial pricing. Eligibility depends on documented monthly income falling inside the published bands, a cap on the unit price, and the condition that the unit is finished, registrable and used as your primary residence rather than an investment or holiday home. The programme has been amended several times and parts of it were moved to the Social Housing and Mortgage Finance Fund, so treat any rate you read online as indicative and confirm the live terms with the bank before you plan a purchase around it.',
    answerAr:
      'أطلق البنك المركزي المصري مبادرات للتمويل العقاري عبر البنوك لمحدودي ومتوسطي الدخل، بمدد سداد طويلة تتراوح بين عشرين وثلاثين عامًا وبأسعار عائد متناقص أقل كثيرًا من السعر التجاري. وتتوقف الأحقية على وقوع الدخل الشهري الموثق داخل الشرائح المعلنة، وعلى حد أقصى لسعر الوحدة، وعلى أن تكون الوحدة مكتملة وقابلة للتسجيل ومخصصة للسكن الأساسي لا للاستثمار أو المصيف. وقد عُدّلت المبادرة أكثر من مرة ونُقل جزء منها إلى صندوق الإسكان الاجتماعي ودعم التمويل العقاري، لذا اعتبر أي سعر تقرؤه على الإنترنت استرشاديًا وتأكد من الشروط السارية مع البنك قبل بناء قرار الشراء عليها.',
  },
  {
    key: 'mortgage-off-plan',
    category: 'mortgage',
    tags: ['off-plan', 'mortgage', 'collateral', 'registration', 'refinance'],
    questionEn: 'Can I get a mortgage on an off-plan unit?',
    questionAr: 'هل يمكن تمويل وحدة تحت الإنشاء عقاريًا؟',
    answerEn:
      'Generally no. Banks lend against a property they can register and take as collateral, so an off-plan unit with no delivery and no registered title does not qualify. A few banks offer limited products for units in advanced construction with developers on their approved list, but these are the exception and usually require a tripartite agreement with the developer. The normal sequence is to buy off-plan on the developer\'s instalment plan, take delivery, complete registration, then refinance any remaining balance with a mortgage. Before you plan around that, check whether your contract permits assigning the unit to a bank and whether the developer will issue the documents the bank needs.',
    answerAr:
      'في الغالب لا. تقرض البنوك مقابل عقار يمكن تسجيله وقبوله كضمان، والوحدة تحت الإنشاء التي لم تُسلَّم ولا تملك سند ملكية مسجل لا تنطبق عليها الشروط. وتوجد منتجات محدودة لدى عدد قليل من البنوك لوحدات في مراحل تنفيذ متقدمة مع مطورين مدرجين على قوائمها المعتمدة، لكنها استثناء وتتطلب عادةً اتفاقًا ثلاثيًا مع المطور. والمسار المعتاد أن تشتري تحت الإنشاء بنظام أقساط المطور، ثم تستلم الوحدة وتستكمل التسجيل، ثم تموّل الرصيد المتبقي عقاريًا. وقبل الاعتماد على ذلك تأكد أن عقدك يسمح برهن الوحدة لصالح بنك وأن المطور سيصدر المستندات التي يطلبها البنك.',
  },

  // ------------------------------------------------------- legal_documents ---
  {
    key: 'preliminary-contract',
    category: 'legal_documents',
    tags: ['contract', 'aqd-ebtedai', 'sehat-tawqee', 'legal', 'clauses'],
    questionEn: 'What is the عقد ابتدائي and is it enough?',
    questionAr: 'ما هو العقد الابتدائي وهل يكفي؟',
    answerEn:
      'The عقد ابتدائي, the preliminary sale contract, is the private agreement between you and the developer or seller. It binds the two parties and is where every purchase in Egypt starts, but on its own it does not transfer registered ownership; only registration at the Real Estate Publicity Department does that. Check that it states the exact unit and building number, the net and gross area with the tolerance percentage, the total price and full payment schedule, the delivery date and the delay penalty, the finishing specification annex, the maintenance deposit and the resale or transfer conditions. Many buyers also file a validity-of-signature case (صحة توقيع) as interim protection until registration becomes possible.',
    answerAr:
      'العقد الابتدائي هو الاتفاق العرفي بينك وبين المطور أو البائع. وهو ملزم للطرفين ونقطة البداية لأي عملية شراء في مصر، لكنه بمفرده لا ينقل الملكية المسجلة، فذلك لا يتم إلا بالتسجيل في الشهر العقاري. تأكد أن العقد يذكر رقم الوحدة والعمارة بدقة، والمساحة الصافية والإجمالية مع نسبة التفاوت المسموح بها، والسعر الإجمالي وجدول السداد الكامل، وموعد التسليم وغرامة التأخير، وملحق مواصفات التشطيب، ووديعة الصيانة، وشروط البيع أو التنازل. كما يلجأ كثير من المشترين إلى رفع دعوى صحة توقيع كحماية مؤقتة لحين إمكانية التسجيل.',
  },
  {
    key: 'registration-shahr-aqary',
    category: 'legal_documents',
    tags: ['registration', 'shahr-aqary', 'title', 'fees', 'ownership'],
    questionEn: 'What is registration at the Shahr Aqary and what does it cost?',
    questionAr: 'ما هو التسجيل في الشهر العقاري وكم تكلفته؟',
    answerEn:
      'Registration at the Real Estate Publicity Department (الشهر العقاري) records your ownership in the state registry and is the only document that makes your title enforceable against everyone, not just the seller. Egyptian law replaced the old percentage-of-value formula with a capped fee set by the unit\'s area band, so the registration fee itself is in the low thousands of pounds, plus modest publicity and stamp charges and any lawyer fee. The real obstacles are documentary rather than financial: the building must be licensed, the land title chain complete and the developer cooperative. Ask the developer in writing whether the project is registrable, who bears the cost, and keep every contract annex and receipt you sign.',
    answerAr:
      'التسجيل في الشهر العقاري يقيد ملكيتك في السجلات الرسمية للدولة، وهو المستند الوحيد الذي يجعل ملكيتك حجة على الكافة وليس على البائع وحده. وقد استبدل القانون المصري نظام النسبة من قيمة العقار برسم محدد بحد أقصى وفق شريحة مساحة الوحدة، فأصبح رسم التسجيل نفسه في حدود آلاف قليلة من الجنيهات، إضافة إلى مصروفات الشهر والدمغة وأتعاب المحامي. لكن العقبات الحقيقية مستندية لا مالية: يجب أن يكون المبنى مرخصًا وسلسلة ملكية الأرض مكتملة والمطور متعاونًا. اسأل المطور كتابةً إن كان المشروع قابلًا للتسجيل ومن يتحمل التكلفة، واحتفظ بكل ملحق عقد وإيصال توقّعه.',
  },
  {
    key: 'verify-developer-project',
    category: 'legal_documents',
    tags: ['due-diligence', 'licence', 'land-title', 'developer', 'fraud'],
    questionEn: 'How do I verify that the developer and the project are legitimate?',
    questionAr: 'كيف أتحقق من جدية المطور وسلامة المشروع؟',
    answerEn:
      'Ask for four things in writing: the land allocation or ownership contract from the New Urban Communities Authority or the relevant governorate, the project\'s building licence, the developer\'s commercial register and tax card, and the marketing licence where the project is sold before construction. Confirm that the selling entity named in your contract is the same entity that owns the land, subsidiaries with similar names are a frequent source of disputes. Visit the site and look at the developer\'s previously delivered phases rather than renders, and check the company in Financial Regulatory Authority records and litigation searches. A property lawyer will run this review for a modest fee, which is inexpensive insurance on a seven-figure purchase.',
    answerAr:
      'اطلب أربعة مستندات كتابةً: عقد تخصيص أو تملك الأرض من هيئة المجتمعات العمرانية الجديدة أو المحافظة المختصة، وترخيص البناء الخاص بالمشروع، والسجل التجاري والبطاقة الضريبية للمطور، وترخيص التسويق إذا كان البيع قبل الإنشاء. وتأكد أن الشركة البائعة المذكورة في عقدك هي نفسها مالكة الأرض، فالشركات التابعة بأسماء متشابهة سبب متكرر للنزاعات. وزُر الموقع واطلع على مراحل سلّمها المطور فعليًا بدلًا من الصور التخيلية، وابحث عن الشركة في سجلات الهيئة العامة للرقابة المالية وفي قضايا المحاكم. ويقوم المحامي العقاري بهذه المراجعة مقابل أتعاب بسيطة، وهي تأمين زهيد على صفقة بملايين الجنيهات.',
  },
  {
    key: 'power-of-attorney',
    category: 'legal_documents',
    tags: ['power-of-attorney', 'tawkil', 'notary', 'expats', 'legal'],
    questionEn: 'What is a توكيل and when do I need one?',
    questionAr: 'ما هو التوكيل ومتى أحتاج إليه؟',
    answerEn:
      'A توكيل is a notarised power of attorney authorising someone to act for you, signing the contract, receiving the unit or completing registration. It is issued at a notary office in Egypt, or at an Egyptian consulate abroad and then authenticated by the Ministry of Foreign Affairs, which is how most expats buy remotely. Keep it narrow: name the exact unit and the exact acts permitted, and avoid a general power of attorney that also allows selling or mortgaging. Remember that a power of attorney is not a substitute for registration, a unit transferred only by a توكيل بالبيع remains legally owned by the original registered owner, and the authority lapses on that owner\'s death.',
    answerAr:
      'التوكيل هو تفويض موثق يخوّل شخصًا التصرف نيابةً عنك، سواء بتوقيع العقد أو استلام الوحدة أو استكمال التسجيل. ويُحرَّر في مكتب توثيق داخل مصر، أو في القنصلية المصرية بالخارج ثم يُصدَّق من وزارة الخارجية، وهي الطريقة التي يشتري بها معظم المصريين في الخارج عن بُعد. واحرص على أن يكون التوكيل محددًا: اذكر الوحدة بعينها والتصرفات المسموح بها فقط، وتجنب التوكيل العام الذي يشمل البيع أو الرهن. وتذكّر أن التوكيل ليس بديلًا عن التسجيل، فالوحدة المنقولة بتوكيل بالبيع فقط تظل مملوكة قانونًا للمالك المسجل الأصلي، وينتهي التوكيل بوفاته.',
  },

  // ------------------------------------------------------ delivery_handover ---
  {
    key: 'finishing-standards',
    category: 'delivery_handover',
    tags: ['finishing', 'core-shell', 'semi-finished', 'fully-finished', 'budget'],
    questionEn: 'What finishing standard should I expect at delivery?',
    questionAr: 'ما مستوى التشطيب المتوقع عند التسليم؟',
    answerEn:
      'Egyptian contracts use four levels. Core & shell (على الطوب الأحمر) means bare walls with no plaster or flooring, you install everything. Semi finished (نصف تشطيب) usually means plastered walls, screed floors, main door, windows and the electrical and plumbing rough-ins, leaving you the surfaces, kitchen and bathrooms. Fully finished (تشطيب كامل) covers paint, floors, complete bathrooms, internal doors and normally kitchen cabinetry and air conditioning. Furnished adds a furniture package. The exact specification must be an annex to your contract, item by item, with brands or approved equivalents. If you buy semi finished, budget roughly 20% to 35% of the unit price and three to six months to finish it yourself.',
    answerAr:
      'تستخدم العقود المصرية أربعة مستويات. على الطوب الأحمر يعني حوائط خرسانية دون محارة أو أرضيات وتتولى أنت كل شيء. ونصف تشطيب يعني غالبًا محارة وأرضيات مستوية وباب رئيسي وشبابيك وتأسيس الكهرباء والسباكة، وتتبقى لك الأرضيات النهائية والمطبخ والحمامات. أما التشطيب الكامل فيشمل الدهانات والأرضيات والحمامات كاملة والأبواب الداخلية وغالبًا مطبخًا وتكييفًا. ويضيف المفروش باقة الأثاث. ويجب أن تكون المواصفات التفصيلية ملحقًا للعقد بندًا بندًا مع ذكر الماركات أو ما يعادلها. وإذا اشتريت نصف تشطيب فخصّص نحو 20% إلى 35% من سعر الوحدة ومن ثلاثة إلى ستة أشهر لإنهاء التشطيب بنفسك.',
  },
  {
    key: 'handover-inspection',
    category: 'delivery_handover',
    tags: ['handover', 'inspection', 'snag-list', 'area-tolerance', 'delivery'],
    questionEn: 'What happens on handover day?',
    questionAr: 'ماذا يحدث في يوم الاستلام؟',
    answerEn:
      'You receive a delivery notice with an appointment, settle any outstanding instalments, the maintenance deposit and the utility connection charges, then inspect the unit with the developer\'s engineer. Take a tape measure and compare the actual area with the contract, test every socket and tap, run the air conditioning, check doors, windows, drainage and waterproofing, and photograph every defect. Snags are listed in signed delivery minutes (محضر استلام) with a deadline for the developer to fix them. If the delivered area differs from the contract by more than the stated tolerance, often 3% to 5%, the price is adjusted up or down. Sign the final acceptance only after the snag list is closed.',
    answerAr:
      'تصلك إخطار تسليم بموعد محدد، فتسدد أي أقساط متبقية ووديعة الصيانة ورسوم توصيل المرافق، ثم تعاين الوحدة مع مهندس المطور. خذ معك شريط قياس وقارن المساحة الفعلية بما في العقد، واختبر كل مفتاح كهرباء وكل حنفية، وشغّل التكييف، وافحص الأبواب والشبابيك والصرف والعزل، وصوّر أي عيب. وتُدرج الملاحظات في محضر استلام موقّع من الطرفين مع مهلة محددة لإصلاحها. وإذا اختلفت المساحة المسلَّمة عن العقد بأكثر من نسبة التفاوت المتفق عليها، وهي غالبًا من 3% إلى 5%، يُعدَّل السعر بالزيادة أو النقصان. ولا توقّع محضر الاستلام النهائي إلا بعد إغلاق قائمة الملاحظات.',
  },
  {
    key: 'delivery-delay',
    category: 'delivery_handover',
    tags: ['delay', 'grace-period', 'compensation', 'legal-notice', 'contract'],
    questionEn: 'What if the developer delays delivery?',
    questionAr: 'ماذا أفعل إذا تأخر المطور في التسليم؟',
    answerEn:
      'Almost every contract allows a grace period, commonly six months to a year, before a delay counts as a breach. Beyond that a well-drafted contract entitles you to compensation, usually a percentage of the unit price for each month of delay, or a rent allowance, and in extreme cases the right to terminate and recover what you paid. Read this clause before signing and check whether the compensation is capped. Practically: keep every receipt and written communication, send a formal notice through a lawyer once the grace period lapses, and consider a complaint to the consumer protection authority. Buyers in the same phase who act collectively usually get a faster response than individuals.',
    answerAr:
      'تمنح معظم العقود فترة سماح تتراوح غالبًا بين ستة أشهر وسنة قبل اعتبار التأخير إخلالًا. وبعدها يمنحك العقد الجيد الصياغة تعويضًا، غالبًا نسبة من سعر الوحدة عن كل شهر تأخير أو بدل إيجار، وفي الحالات القصوى الحق في الفسخ واسترداد ما دفعته. اقرأ هذا البند قبل التوقيع وتحقق إن كان التعويض له حد أقصى. وعمليًا: احتفظ بكل إيصال ومراسلة مكتوبة، وأرسل إنذارًا رسميًا عبر محامٍ بعد انتهاء فترة السماح، وفكر في تقديم شكوى لجهاز حماية المستهلك. وعادةً ما يحصل ملاك المرحلة الواحدة على استجابة أسرع عند التحرك بشكل جماعي بدلًا من الشكاوى الفردية.',
  },
  {
    key: 'maintenance-deposit',
    category: 'delivery_handover',
    tags: ['maintenance-deposit', 'facility-management', 'service-charge', 'handover'],
    questionEn: 'What is the maintenance deposit and what does it cover?',
    questionAr: 'ما هي وديعة الصيانة وماذا تغطي؟',
    answerEn:
      'Compounds charge a maintenance deposit, generally 8% to 10% of the unit price, paid at or shortly before handover. It funds facility management of the common areas: landscaping, street lighting, security, roads, pools, clubhouse upkeep and a reserve for major works. In most projects the deposit is held and invested by the developer or a dedicated facility company, and the annual maintenance charge is covered by its returns; other developers instead bill an annual fee per square metre on top of the deposit. Ask which model applies, whether the deposit is refundable or transfers with the unit when you sell, and who audits the maintenance account, this is a cost you carry for the life of the unit.',
    answerAr:
      'تفرض الكومباوندات وديعة صيانة تتراوح عادةً بين 8% و10% من سعر الوحدة، وتُسدَّد عند الاستلام أو قبله بقليل. وتموّل هذه الوديعة إدارة المرافق في المناطق المشتركة: اللاندسكيب وإنارة الشوارع والأمن والطرق وحمامات السباحة وصيانة النادي واحتياطي الأعمال الكبرى. وفي معظم المشروعات يحتفظ المطور أو شركة إدارة مرافق متخصصة بالوديعة ويستثمرها، ويُغطى رسم الصيانة السنوي من عائدها، بينما يفرض مطورون آخرون رسمًا سنويًا لكل متر مربع فوق الوديعة. اسأل عن النموذج المطبق، وهل الوديعة مستردة أم تنتقل مع الوحدة عند البيع، ومن يراجع حسابات الصيانة، فهذه تكلفة تتحملها طوال فترة امتلاك الوحدة.',
  },

  // ---------------------------------------------------------- nawy_services ---
  {
    key: 'nawy-fees-for-buyers',
    category: 'nawy_services',
    tags: ['commission', 'brokerage', 'primary', 'resale', 'pricing'],
    questionEn: 'Does Nawy charge buyers a commission?',
    questionAr: 'هل تتقاضى ناوي عمولة من المشتري؟',
    answerEn:
      'For primary market units, no. The developer pays the brokerage fee, so you pay exactly the price list you would get by walking into the developer\'s own sales office, with the advantage of comparing dozens of projects in one place and having a consultant who knows current availability and unpublished offers. On resale transactions a commission does apply; it is agreed and disclosed in writing before you sign anything, and Egyptian market practice is around 2% to 2.5% of the sale value, usually paid by the seller. Nawy never collects the unit price itself: your down payment and instalments are paid directly to the developer, in the developer\'s name.',
    answerAr:
      'في السوق الأولي لا. المطور هو من يتحمل عمولة التسويق، وبالتالي تدفع نفس قائمة الأسعار التي كنت ستحصل عليها لو ذهبت إلى مكتب مبيعات المطور مباشرة، مع ميزة مقارنة عشرات المشروعات في مكان واحد ووجود مستشار يعرف المتاح فعليًا والعروض غير المعلنة. أما في صفقات إعادة البيع فتُطبَّق عمولة يُتفق عليها وتُوضَّح كتابةً قبل توقيع أي مستند، والعرف في السوق المصري نحو 2% إلى 2.5% من قيمة البيع ويتحملها البائع غالبًا. ولا تحصّل ناوي قيمة الوحدة نفسها إطلاقًا، فالمقدم والأقساط تُدفع مباشرة للمطور وباسم الشركة.',
  },
  {
    key: 'nawy-now',
    category: 'nawy_services',
    tags: ['nawy-now', 'financing', 'cash-price', 'monthly-plan', 'eligibility'],
    questionEn: 'What is Nawy Now?',
    questionAr: 'ما هي خدمة ناوي ناو؟',
    answerEn:
      'Nawy Now is the instant-payment product: instead of paying the developer over years of instalments, Nawy settles the cash price with the developer on your behalf and you repay Nawy on a monthly plan. Because the developer receives cash, the buyer captures part of the cash discount, which frequently offsets much of the financing cost. Eligibility is assessed on documented income and credit history, and both the unit and the plan have to be approved. It suits buyers who want a finished or near-delivery unit quickly, or who want to lock a launch price without a large lump sum. The tenor, monthly amount and total cost are confirmed in writing before you commit.',
    answerAr:
      'ناوي ناو هي خدمة السداد الفوري: بدلًا من الدفع للمطور على مدى سنوات من الأقساط، تسدد ناوي سعر الكاش للمطور نيابةً عنك وتسدد أنت لناوي على أقساط شهرية. ولأن المطور يحصل على قيمة الوحدة كاش، يحصل المشتري على جزء من خصم الكاش، وهو ما يعوّض غالبًا جانبًا كبيرًا من تكلفة التمويل. وتُدرس الأحقية بناءً على الدخل الموثق والتاريخ الائتماني، ويجب اعتماد الوحدة ونظام السداد. وتناسب الخدمة من يريد وحدة جاهزة أو قريبة التسليم بسرعة، أو من يريد تثبيت سعر الإطلاق دون دفع مبلغ كبير دفعة واحدة. وتُحدَّد المدة والقسط الشهري والتكلفة الإجمالية كتابةً قبل الالتزام.',
  },
  {
    key: 'site-visits',
    category: 'nawy_services',
    tags: ['site-visit', 'viewing', 'video-tour', 'booking', 'consultant'],
    questionEn: 'Can Nawy arrange a site visit?',
    questionAr: 'هل يمكن لناوي ترتيب زيارة للمشروع؟',
    answerEn:
      'Yes. Request a viewing from any listing or through the chat and a consultant will arrange the developer\'s site tour, including transport from a meeting point for coastal projects. Weekend slots at popular North Coast and New Capital projects fill up early, so book several days ahead. If you are abroad or short on time, ask for a live video walkthrough, most sales teams offer one, and consultants can record short clips of the actual unit, the view and the construction status. For delivered units you can normally view the exact apartment; for off-plan phases you see the show unit, the model and the site rather than your specific unit.',
    answerAr:
      'نعم. اطلب معاينة من صفحة أي وحدة أو عبر المحادثة، وسينظم لك المستشار جولة المشروع لدى المطور، بما في ذلك الانتقال من نقطة تجمع في حالة المشروعات الساحلية. وتُحجز مواعيد نهاية الأسبوع في مشروعات الساحل الشمالي والعاصمة الإدارية مبكرًا، لذا احجز قبل الموعد بعدة أيام. وإذا كنت خارج مصر أو وقتك ضيق فاطلب جولة مباشرة بالفيديو، فمعظم فرق المبيعات توفرها، ويمكن للمستشار تصوير مقاطع قصيرة للوحدة نفسها والإطلالة وحالة التنفيذ. وفي الوحدات المسلَّمة يمكنك معاينة الوحدة بعينها، أما المراحل تحت الإنشاء فتعاين الوحدة النموذجية والماكيت والموقع وليس وحدتك تحديدًا.',
  },
  {
    key: 'nawy-mortgage-legal-help',
    category: 'nawy_services',
    tags: ['mortgage-desk', 'legal-review', 'documents', 'advisory'],
    questionEn: 'Does Nawy help with mortgage and legal paperwork?',
    questionAr: 'هل تساعد ناوي في إجراءات التمويل العقاري والأوراق القانونية؟',
    answerEn:
      'The mortgage desk collects your documents once and circulates them to partner banks, then returns comparable offers showing rate, tenor, monthly instalment and total cost, so you are not negotiating with each bank separately. On the legal side, consultants walk you through the clauses that matter most, delivery date and delay penalty, area tolerance, the finishing annex, maintenance deposit and resale conditions, and can refer you to an independent property lawyer for a full review before you sign. Nawy does not replace your lawyer and does not draft or notarise contracts: the contract is always between you and the developer or the seller.',
    answerAr:
      'يجمع فريق التمويل العقاري مستنداتك مرة واحدة ويعرضها على البنوك الشريكة، ثم يعود إليك بعروض قابلة للمقارنة توضح سعر العائد والمدة والقسط الشهري والتكلفة الإجمالية، فلا تتفاوض مع كل بنك على حدة. وعلى الجانب القانوني يشرح لك المستشارون أهم البنود، مثل موعد التسليم وغرامة التأخير ونسبة التفاوت في المساحة وملحق التشطيب ووديعة الصيانة وشروط إعادة البيع، ويمكنهم ترشيح محامٍ عقاري مستقل لمراجعة العقد بالكامل قبل التوقيع. ولا تحل ناوي محل محاميك ولا تحرر العقود أو توثقها، فالعقد دائمًا بينك وبين المطور أو البائع.',
  },

  // ---------------------------------------------------------------- resale ---
  {
    key: 'sell-before-fully-paid',
    category: 'resale',
    tags: ['assignment', 'transfer', 'resale', 'developer-approval', 'installments'],
    questionEn: 'Can I sell my unit before I finish paying the instalments?',
    questionAr: 'هل يمكنني بيع وحدتي قبل سداد كامل الأقساط؟',
    answerEn:
      'Yes, through an assignment: the developer replaces you with a new buyer on the same contract. Almost every contract requires you to have paid a minimum share of the price first, commonly 20% to 50%, and to obtain the developer\'s written approval. The new buyer pays you the difference between what you have already paid and the agreed resale price, then takes over the remaining instalments. The developer charges a transfer fee, and some apply their current price list to the remaining balance rather than your original one. Ask customer service for the transfer policy in writing before you market the unit, because those numbers decide whether the resale is worth doing at all.',
    answerAr:
      'نعم، عن طريق التنازل: يحل المشتري الجديد محلك في العقد ذاته لدى المطور. وتشترط معظم العقود سداد نسبة أدنى من السعر أولًا، غالبًا من 20% إلى 50%، مع الحصول على موافقة كتابية من المطور. ويدفع لك المشتري الجديد الفرق بين ما سددته فعليًا والسعر المتفق عليه لإعادة البيع، ثم يتحمل الأقساط المتبقية. ويفرض المطور رسم تنازل، كما يطبّق بعض المطورين قائمة أسعارهم الحالية على الرصيد المتبقي بدلًا من سعر عقدك الأصلي. اطلب سياسة التنازل كتابةً من خدمة العملاء قبل عرض الوحدة للبيع، فهذه الأرقام هي ما يحدد جدوى إعادة البيع من الأساس.',
  },
  {
    key: 'developer-transfer-fee',
    category: 'resale',
    tags: ['transfer-fee', 'resale', 'developer-policy', 'net-proceeds'],
    questionEn: 'What is the developer transfer fee on resale?',
    questionAr: 'كم رسم التنازل لدى المطور عند إعادة البيع؟',
    answerEn:
      'Developers charge a fee to move a contract to a new buyer. Common structures are a flat percentage of the total unit price, often 3% to 5%; a percentage of the amount paid to date; or a share of the gain between your contract price and the resale price. A few charge a fixed administrative amount instead. The fee is usually paid by the seller and is negotiable in slow markets, especially if the buyer is taking a unit the developer wants moved. Ask for the transfer policy in writing before you agree a price, and count it alongside the brokerage commission when you work out your net proceeds.',
    answerAr:
      'يفرض المطورون رسمًا لنقل العقد إلى مشترٍ جديد. وأكثر الصيغ شيوعًا نسبة ثابتة من إجمالي سعر الوحدة تتراوح غالبًا بين 3% و5%، أو نسبة من المبالغ المسددة حتى تاريخه، أو نسبة من الفرق بين سعر عقدك وسعر إعادة البيع. ويكتفي عدد قليل من المطورين بمبلغ إداري ثابت. ويتحمل البائع الرسم عادةً، وهو قابل للتفاوض في أوقات ركود السوق، خاصة إذا كان المشتري يأخذ وحدة يرغب المطور في تحريكها. اطلب سياسة التنازل كتابةً قبل الاتفاق على السعر، واحسبها مع عمولة الوساطة عند تقدير صافي حصيلة البيع.',
  },
  {
    key: 'resale-vs-primary-pricing',
    category: 'resale',
    tags: ['pricing', 'resale', 'primary', 'present-value', 'comparison'],
    questionEn: 'How is a resale unit priced compared with a primary one?',
    questionAr: 'كيف يُسعَّر العقار في إعادة البيع مقارنة بالسوق الأولي؟',
    answerEn:
      'You are comparing two different things. A primary instalment price bakes in years of deferred payment, while a resale is usually settled in cash or over a short period, so for the same unit the resale headline number should be lower. The fair comparison discounts the primary plan\'s future instalments to present value, then adds the resale advantages, earlier or immediate delivery, a finished product you can inspect, a neighbourhood you can see, and adjusts for floor, view, orientation and finishing. In compounds where deliveries are complete, such as Madinaty, Allegria or Mivida, resale is the only supply, and pricing is driven mainly by location within the compound and by view.',
    answerAr:
      'أنت تقارن بين شيئين مختلفين. سعر التقسيط في السوق الأولي يتضمن سنوات من تأجيل السداد، بينما تُسدَّد وحدة إعادة البيع غالبًا كاش أو على مدى قصير، لذا يفترض أن يكون رقمها المعلن أقل لنفس الوحدة. والمقارنة العادلة تخصم الأقساط المستقبلية في الخطة الأولية إلى قيمتها الحالية، ثم تضيف مزايا إعادة البيع من تسليم أسرع أو فوري ومنتج مكتمل يمكن معاينته وحي قائم بالفعل، مع تعديل السعر حسب الدور والإطلالة والاتجاه والتشطيب. وفي الكومباوندات التي اكتمل تسليمها مثل مدينتي وأليجريا وميفيدا تكون إعادة البيع هي المعروض الوحيد، ويتحدد السعر أساسًا بالموقع داخل الكومباوند وبالإطلالة.',
  },
  {
    key: 'resale-buyer-documents',
    category: 'resale',
    tags: ['resale', 'documents', 'no-objection', 'due-diligence', 'receipts'],
    questionEn: 'What documents do I need to buy a resale unit?',
    questionAr: 'ما المستندات المطلوبة لشراء وحدة بإعادة البيع؟',
    answerEn:
      'Ask the seller for the original contract with the developer plus every annex and amendment, all payment receipts, the delivery minutes if the unit is handed over, a recent statement from the developer confirming the outstanding balance, and the seller\'s national ID. If the unit is registered, request the registration extract; if it is not, ask exactly what stage the registration is at and why. The developer\'s written no-objection and transfer approval is essential, a private agreement between you and the seller does not bind the developer. Verify that the person signing is the contract holder or holds a valid, specific power of attorney, and pay only against receipts issued in the seller\'s own name.',
    answerAr:
      'اطلب من البائع العقد الأصلي المبرم مع المطور وكل الملاحق والتعديلات، وجميع إيصالات السداد، ومحضر الاستلام إذا كانت الوحدة مسلَّمة، وإفادة حديثة من المطور بالرصيد المتبقي، وصورة بطاقة الرقم القومي للبائع. وإذا كانت الوحدة مسجلة فاطلب مستخرج التسجيل، وإن لم تكن مسجلة فاسأل عن المرحلة التي وصل إليها التسجيل وسبب التوقف. وخطاب عدم الممانعة وموافقة التنازل من المطور أمر جوهري، فالاتفاق العرفي بينك وبين البائع لا يُلزم المطور. وتأكد أن الموقّع هو صاحب العقد أو يحمل توكيلًا ساريًا ومحددًا، ولا تدفع إلا مقابل إيصالات صادرة باسم البائع نفسه.',
  },

  // ---------------------------------------------------------------- rental ---
  {
    key: 'rental-market-overview',
    category: 'rental',
    tags: ['rental', 'lease', 'compounds', 'seasonal', 'furnished'],
    questionEn: 'How does the rental market work in Cairo\'s new communities?',
    questionAr: 'كيف يعمل سوق الإيجار في المجتمعات الجديدة بالقاهرة؟',
    answerEn:
      'In compounds across New Cairo, Sheikh Zayed and Madinaty most leases run for one renewable year, are quoted monthly in Egyptian pounds and are paid quarterly or half-yearly in advance. Furnished units let faster and command a premium, particularly with expats and corporate tenants. Compound managements normally require the landlord to register the tenant for gate access, and some restrict short-term letting entirely. North Coast and Ain Sokhna units let seasonally instead, by summer season or by the week, at rates that can equal several months of a Cairo rent. New leases fall under the modern civil-law rules; the old rent-control regime applies only to legacy contracts.',
    answerAr:
      'في كومباوندات القاهرة الجديدة والشيخ زايد ومدينتي تكون معظم عقود الإيجار لمدة سنة قابلة للتجديد، ويُحدد الإيجار شهريًا بالجنيه المصري ويُسدَّد مقدمًا كل ثلاثة أو ستة أشهر. وتُؤجَّر الوحدات المفروشة أسرع وبسعر أعلى، خاصة للأجانب والشركات. وتشترط إدارات الكومباوندات عادةً تسجيل المستأجر لدى المجتمع للحصول على تصاريح الدخول، ويمنع بعضها التأجير قصير الأجل تمامًا. أما وحدات الساحل الشمالي والعين السخنة فتُؤجَّر موسميًا بالموسم الصيفي أو بالأسبوع بأسعار قد تعادل إيجار عدة أشهر في القاهرة. وتخضع العقود الجديدة لقواعد القانون المدني الحديثة، بينما يقتصر نظام الإيجار القديم على العقود التاريخية.',
  },
  {
    key: 'rental-contract-deposit',
    category: 'rental',
    tags: ['lease', 'deposit', 'inventory', 'escalation', 'utilities'],
    questionEn: 'What does a typical rental contract include?',
    questionAr: 'ما الذي يتضمنه عقد الإيجار المعتاد؟',
    answerEn:
      'A standard lease states the parties and their national ID numbers, the unit and its address, the term and start date, the rent and payment frequency, the escalation applied on renewal (often a fixed annual percentage), the security deposit, and who pays utilities, maintenance and the compound service charge. Deposits are normally one to two months\' rent and are refundable after an exit inspection. For furnished units the landlord attaches a signed inventory of furniture and appliances with photographs. Insist on at least three signed originals, one for each party and one for the notary, and get receipts for every payment. Ask for the compound\'s own tenancy rules too, since gate access and club use depend on them.',
    answerAr:
      'يذكر عقد الإيجار المعتاد بيانات الطرفين وأرقامهما القومية، والوحدة وعنوانها، ومدة العقد وتاريخ بدايته، وقيمة الإيجار ودورية السداد، ونسبة الزيادة عند التجديد وهي غالبًا نسبة سنوية ثابتة، ومبلغ التأمين، ومن يتحمل المرافق والصيانة ورسوم خدمة الكومباوند. ويتراوح التأمين عادةً بين إيجار شهر وشهرين ويُرد بعد معاينة الخروج. وفي الوحدات المفروشة يرفق المالك قائمة موقعة بالأثاث والأجهزة مع صور. واحرص على تحرير ثلاث نسخ أصلية موقعة على الأقل، نسخة لكل طرف وثالثة للتوثيق، واحصل على إيصال بكل دفعة. واطلب أيضًا لائحة الكومباوند الخاصة بالمستأجرين، لأن تصاريح الدخول واستخدام النادي تتوقف عليها.',
  },
  {
    key: 'register-rental-contract',
    category: 'rental',
    tags: ['lease-registration', 'notary', 'tax', 'enforcement', 'utilities'],
    questionEn: 'Do I need to register or notarise my rental contract?',
    questionAr: 'هل يجب توثيق عقد الإيجار؟',
    answerEn:
      'It is strongly advisable. Notarising the signatures (تصديق على التوقيع) removes any later argument about authenticity and makes enforcement much faster if the tenant stops paying or refuses to leave. Landlords also need a documented contract for tax purposes, since rental income is reportable to the Egyptian Tax Authority, and tenants often need a registered lease to obtain utility meters, register children at school or complete residency paperwork. Compound managements usually ask for a copy before issuing tenant access cards. The cost is small relative to the rent, and a registered contract is the first document a lawyer will ask for if a dispute reaches court.',
    answerAr:
      'يُنصح بذلك بشدة. فتصديق التوقيعات على العقد يزيل أي جدل لاحق حول صحته ويجعل التنفيذ أسرع كثيرًا إذا توقف المستأجر عن السداد أو رفض إخلاء الوحدة. كما يحتاج المالك إلى عقد موثق لأغراض ضريبية، لأن الإيرادات الإيجارية يجب إقرارها لمصلحة الضرائب المصرية، ويحتاج المستأجر غالبًا إلى عقد موثق لاستخراج عدادات المرافق أو تسجيل الأبناء بالمدارس أو إنهاء إجراءات الإقامة. وتطلب إدارات الكومباوندات عادةً نسخة قبل إصدار كروت دخول المستأجر. والتكلفة بسيطة مقارنة بقيمة الإيجار، والعقد الموثق هو أول مستند يطلبه المحامي إذا وصل النزاع إلى المحكمة.',
  },
  {
    key: 'rental-yield',
    category: 'rental',
    tags: ['yield', 'investment', 'returns', 'vacancy', 'coastal'],
    questionEn: 'What rental yield can I expect on an Egyptian unit?',
    questionAr: 'ما العائد الإيجاري المتوقع من وحدة في مصر؟',
    answerEn:
      'Gross yields on residential units in Greater Cairo compounds have typically run between 5% and 8%, calculated as annual rent divided by current market value, with smaller furnished apartments at the top of that range and large villas at the bottom. Net yield is lower once you deduct the annual maintenance charge, vacancy between tenants, agency fees, tax on rental income and repairs, budget 20% to 30% of gross for those. Coastal units are seasonal: a strong summer in a prime North Coast compound can produce a comparable annual figure but with far more variability and higher management costs. Historically, capital appreciation rather than yield has driven Egyptian property returns.',
    answerAr:
      'تراوح العائد الإيجاري الإجمالي للوحدات السكنية في كومباوندات القاهرة الكبرى عادةً بين 5% و8%، ويُحسب بقسمة الإيجار السنوي على القيمة السوقية الحالية، وتقع الشقق الصغيرة المفروشة في أعلى النطاق والفيلات الكبيرة في أدناه. أما العائد الصافي فأقل بعد خصم رسوم الصيانة السنوية وفترات الخلو بين المستأجرين وعمولات التسويق والضريبة على الإيرادات الإيجارية وأعمال الإصلاح، وخصّص لها نحو 20% إلى 30% من العائد الإجمالي. والوحدات الساحلية موسمية: قد يحقق موسم صيفي قوي في كومباوند متميز بالساحل الشمالي رقمًا سنويًا مقاربًا لكن بتذبذب أكبر وتكلفة إدارة أعلى. وتاريخيًا كان النمو في قيمة العقار وليس العائد الإيجاري هو المحرك الأساسي للأرباح في السوق المصري.',
  },

  // ------------------------------------------------------------ fees_taxes ---
  {
    key: 'extra-fees-on-top',
    category: 'fees_taxes',
    tags: ['budget', 'maintenance-deposit', 'utilities', 'finishing', 'closing-costs'],
    questionEn: 'What costs should I budget on top of the unit price?',
    questionAr: 'ما التكاليف الإضافية فوق سعر الوحدة؟',
    answerEn:
      'Plan for the maintenance deposit of 8% to 10% of the price at handover; club membership in compounds that charge one; utility connection and meter fees for electricity, water and gas; registration fees and lawyer costs; and finishing if the unit is delivered semi finished or core & shell, which can add 20% to 35% of the price. Resale buyers add the developer transfer fee and the brokerage commission. Once you own the unit there is the annual maintenance charge and the annual real estate tax where it applies. A practical rule of thumb is to keep about 15% of the unit price aside beyond the payment plan for a fully finished unit, and considerably more if you are finishing it yourself.',
    answerAr:
      'احسب وديعة الصيانة بنسبة 8% إلى 10% من السعر عند الاستلام، واشتراك النادي في الكومباوندات التي تفرضه، ورسوم توصيل المرافق وعدادات الكهرباء والمياه والغاز، ورسوم التسجيل وأتعاب المحاماة، وتكلفة التشطيب إذا كانت الوحدة نصف تشطيب أو على الطوب الأحمر وقد تضيف من 20% إلى 35% من السعر. ويضيف مشتري إعادة البيع رسم التنازل لدى المطور وعمولة الوساطة. وبعد التملك يأتي رسم الصيانة السنوي والضريبة العقارية السنوية حيثما تُطبَّق. وقاعدة عملية مفيدة أن تحتفظ بنحو 15% من سعر الوحدة خارج نظام السداد إذا كانت الوحدة بتشطيب كامل، وبأكثر من ذلك بكثير إذا كنت ستشطبها بنفسك.',
  },
  {
    key: 'real-estate-tax',
    category: 'fees_taxes',
    tags: ['real-estate-tax', 'annual-tax', 'exemption', 'valuation', 'owner'],
    questionEn: 'What is the annual real estate tax and who pays it?',
    questionAr: 'ما هي الضريبة العقارية السنوية ومن يتحملها؟',
    answerEn:
      'Egypt levies an annual real estate tax on built property at 10% of the assessed annual rental value after a statutory deduction for maintenance, 30% for residential units and 32% for non-residential, with assessments revised periodically by valuation committees. A primary residence whose assessed annual rental value falls below the legal exemption threshold is exempt, which in practice exempts many modest homes but not high-value units. The tax is the owner\'s liability, not the tenant\'s, and is paid in instalments through the Real Estate Tax Authority. Thresholds and assessed values are updated by legislation from time to time, so confirm the current figures for your unit and area before you budget.',
    answerAr:
      'تفرض مصر ضريبة عقارية سنوية على العقارات المبنية بواقع 10% من القيمة الإيجارية السنوية المقدَّرة بعد خصم قانوني مقابل الصيانة يبلغ 30% للوحدات السكنية و32% لغير السكنية، وتُعاد التقديرات دوريًا عبر لجان الحصر والتقدير. وتُعفى وحدة السكن الرئيسية إذا قلّت قيمتها الإيجارية السنوية المقدَّرة عن حد الإعفاء القانوني، وهو ما يعفي عمليًا كثيرًا من المساكن المتوسطة دون الوحدات مرتفعة القيمة. والضريبة التزام على المالك وليس المستأجر وتُسدَّد على أقساط عبر مصلحة الضرائب العقارية. وتُحدَّث حدود الإعفاء والقيم المقدَّرة بالتشريع من وقت لآخر، لذا تأكد من الأرقام السارية لوحدتك ومنطقتك قبل وضع الميزانية.',
  },
  {
    key: 'capital-gains-on-sale',
    category: 'fees_taxes',
    tags: ['disposal-tax', 'selling', 'tax', 'stamp-duty', 'exemptions'],
    questionEn: 'Is there tax when I sell a property in Egypt?',
    questionAr: 'هل توجد ضريبة عند بيع العقار في مصر؟',
    answerEn:
      'Individuals disposing of built property or land inside urban boundaries in Egypt are subject to a real estate disposal tax of 2.5% on the gross sale value, not on the profit, payable whether or not the sale produced a gain. Specific transfers are excluded, for example transfers between spouses or between direct relatives and gifts within defined degrees of kinship. Companies are treated differently, with gains folded into taxable corporate profits. Stamp and publicity charges may also apply on transfer, and the developer transfer fee is separate again. The rules and exemptions are technical and change, so have a tax adviser confirm the treatment of your specific sale before you agree a price.',
    answerAr:
      'يخضع الأفراد عند التصرف في عقار مبني أو أرض داخل كردون المدن في مصر لضريبة تصرفات عقارية بنسبة 2.5% من إجمالي قيمة البيع وليس من الربح، وتُستحق سواء حقق البيع مكسبًا أم لا. وتُستثنى تصرفات بعينها، مثل التصرف بين الزوجين أو بين الأصول والفروع والهبات في حدود درجات قرابة محددة. أما الشركات فتُعامل بشكل مختلف إذ تدخل الأرباح ضمن وعاء ضريبة الأرباح التجارية. وقد تُضاف رسوم الدمغة والشهر عند نقل الملكية، ورسم التنازل لدى المطور بند منفصل. والقواعد والإعفاءات فنية ومتغيرة، لذا استعن بمستشار ضريبي لتأكيد المعاملة الضريبية لبيعتك قبل الاتفاق على السعر.',
  },
  {
    key: 'brokerage-commission',
    category: 'fees_taxes',
    tags: ['commission', 'brokerage', 'resale', 'rental', 'market-practice'],
    questionEn: 'What is the brokerage commission in Egypt?',
    questionAr: 'كم تبلغ عمولة الوساطة العقارية في مصر؟',
    answerEn:
      'In the primary market the developer pays the broker, so the buyer pays nothing extra, the price is the developer\'s list price whether you buy through a brokerage or walk in directly. In resale and rental transactions a commission does apply: market practice is around 2% to 2.5% of the sale value, usually charged to the seller, and for leases either one month\'s rent or about 5% of the annual rent, sometimes split between landlord and tenant. Agree the rate, who pays and when it becomes due in writing before viewings start, make sure the brokerage issues a proper invoice, and never pay commission before the contract is actually signed.',
    answerAr:
      'في السوق الأولي يتحمل المطور عمولة الوسيط، فلا يدفع المشتري أي مبلغ إضافي، والسعر هو سعر قائمة المطور سواء اشتريت عبر شركة تسويق أو ذهبت مباشرة. أما في صفقات إعادة البيع والإيجار فتُطبَّق عمولة: العرف نحو 2% إلى 2.5% من قيمة البيع ويتحملها البائع غالبًا، وفي الإيجار إما إيجار شهر أو نحو 5% من الإيجار السنوي وقد تُقسَّم بين المالك والمستأجر. واتفق كتابةً على النسبة ومن يتحملها وموعد استحقاقها قبل بدء المعاينات، واحرص على حصولك على فاتورة رسمية من شركة الوساطة، ولا تدفع أي عمولة قبل توقيع العقد فعليًا.',
  },

  // ------------------------------------------------------- account_support ---
  {
    key: 'create-account-favorites',
    category: 'account_support',
    tags: ['account', 'favorites', 'saved-searches', 'compare', 'alerts'],
    questionEn: 'How do I create an account and save properties?',
    questionAr: 'كيف أنشئ حسابًا وأحفظ الوحدات المفضلة؟',
    answerEn:
      'Register with your email and a password, or continue with Google, then confirm your phone number so a consultant can reach you about the units you shortlist. Once signed in, the heart icon on any listing saves it to your favourites, and the compare tray lets you place up to four units side by side on price, area, payment plan and delivery date. You can also save a search, for example three-bedroom apartments in New Cairo under EGP 12,000,000 delivering before 2028, and get an alert whenever a new listing matches it. Favourites, comparisons and saved searches are tied to your account and follow you across devices.',
    answerAr:
      'سجّل بالبريد الإلكتروني وكلمة مرور أو تابع باستخدام حساب جوجل، ثم أكّد رقم هاتفك حتى يتمكن المستشار من التواصل معك بشأن الوحدات التي تهتم بها. وبعد تسجيل الدخول يحفظ زر القلب في أي إعلان الوحدة ضمن المفضلة، بينما تتيح لك أداة المقارنة وضع حتى أربع وحدات جنبًا إلى جنب من حيث السعر والمساحة ونظام السداد وموعد التسليم. كما يمكنك حفظ عملية بحث، مثل شقق ثلاث غرف في القاهرة الجديدة بأقل من 12,000,000 جنيه وتسليم قبل 2028، وتصلك تنبيهات عند إضافة وحدة مطابقة. وترتبط المفضلة والمقارنات وعمليات البحث المحفوظة بحسابك وتظهر على كل أجهزتك.',
  },
  {
    key: 'contact-consultant-update-details',
    category: 'account_support',
    tags: ['support', 'consultant', 'profile', 'whatsapp', 'preferences'],
    questionEn: 'How do I speak to a consultant or update my contact details?',
    questionAr: 'كيف أتواصل مع مستشار أو أحدّث بيانات الاتصال الخاصة بي؟',
    answerEn:
      'Every listing has call and WhatsApp buttons that route to the consultant covering that project. The in-page chat assistant answers questions about payment plans, delivery dates and availability at any hour and hands you over to a human whenever you ask. To change your name, phone or email, open your profile from the account menu and edit the details there; a new phone number needs to be verified before consultants use it. If you would rather not be contacted at all, switch off marketing messages in the same screen, alerts for your saved searches keep working independently of that setting.',
    answerAr:
      'يحتوي كل إعلان على زري الاتصال والواتساب اللذين يوجهانك إلى المستشار المسؤول عن المشروع. كما يجيب مساعد المحادثة داخل الموقع عن أسئلة أنظمة السداد ومواعيد التسليم والتوافر في أي وقت، وينقلك إلى موظف بشري متى طلبت ذلك. ولتغيير الاسم أو رقم الهاتف أو البريد الإلكتروني، افتح ملفك الشخصي من قائمة الحساب وعدّل البيانات هناك، مع ملاحظة أن الرقم الجديد يحتاج إلى تأكيد قبل أن يستخدمه المستشارون. وإذا كنت تفضل عدم تلقي اتصالات تسويقية فيمكنك إيقافها من الشاشة نفسها، وستستمر تنبيهات عمليات البحث المحفوظة في العمل بشكل مستقل عن هذا الإعداد.',
  },
  {
    key: 'delete-account-data',
    category: 'account_support',
    tags: ['privacy', 'account-deletion', 'data-export', 'preferences'],
    questionEn: 'How do I delete my account or my data?',
    questionAr: 'كيف أحذف حسابي أو بياناتي؟',
    answerEn:
      'Open your profile settings and choose to delete the account. Deletion removes your saved searches, favourites, comparison lists and chat history, and detaches your profile from enquiries you submitted, although records tied to a transaction already in progress with a developer are retained where the law requires. You can export a copy of your data before deleting it. If you only want to stop being contacted, disable marketing communications instead, that keeps your shortlist and saved searches intact. Deletion is not instantaneous across backups, but the account is deactivated immediately and no consultant can see it afterwards.',
    answerAr:
      'افتح إعدادات ملفك الشخصي واختر حذف الحساب. يؤدي الحذف إلى إزالة عمليات البحث المحفوظة والمفضلة وقوائم المقارنة وسجل المحادثات، وفصل ملفك عن الطلبات التي أرسلتها، مع الاحتفاظ بالسجلات المرتبطة بصفقة جارية بالفعل مع مطور في الحدود التي يفرضها القانون. ويمكنك تصدير نسخة من بياناتك قبل الحذف. وإذا كان هدفك مجرد إيقاف الاتصالات فاختر تعطيل الرسائل التسويقية بدلًا من الحذف، وبذلك تحتفظ بقائمة اهتماماتك وعمليات البحث المحفوظة. ولا يتم الحذف فوريًا من النسخ الاحتياطية، لكن الحساب يُعطَّل مباشرة ولا يستطيع أي مستشار الاطلاع عليه بعدها.',
  },
  {
    key: 'otp-not-received',
    category: 'account_support',
    tags: ['otp', 'verification', 'sms', 'email', 'troubleshooting'],
    questionEn: 'I am not receiving the verification code, what should I do?',
    questionAr: 'لا يصلني كود التحقق، ماذا أفعل؟',
    answerEn:
      'First check that the number or email on screen is exactly the one you registered, including the country code (+20 for Egypt), and look in your spam or promotions folder for emailed codes. Codes expire after a few minutes, so request a fresh one instead of reusing an older message, and wait for the countdown to finish before requesting again, repeated requests are rate limited to protect the account. Egyptian mobile networks occasionally delay SMS at peak times; if nothing arrives after several minutes, switch to email verification or continue with Google instead. If it still fails, contact support with your registered email and the approximate time you tried.',
    answerAr:
      'تأكد أولًا أن الرقم أو البريد الإلكتروني الظاهر على الشاشة هو نفسه المسجل لديك بما في ذلك مفتاح الدولة (+20 لمصر)، وابحث في مجلد الرسائل غير المرغوب فيها أو العروض إذا كان الكود يصل بالبريد. وتنتهي صلاحية الأكواد خلال دقائق قليلة، لذا اطلب كودًا جديدًا بدلًا من استخدام رسالة قديمة، وانتظر انتهاء العد التنازلي قبل طلب كود آخر لأن الطلبات المتكررة محدودة لحماية الحساب. وقد تتأخر شبكات المحمول المصرية في تسليم الرسائل النصية في أوقات الذروة، فإذا لم يصلك شيء بعد عدة دقائق فانتقل إلى التحقق بالبريد الإلكتروني أو تابع باستخدام حساب جوجل. وإذا استمرت المشكلة تواصل مع الدعم مع ذكر بريدك المسجل والوقت التقريبي للمحاولة.',
  },
];

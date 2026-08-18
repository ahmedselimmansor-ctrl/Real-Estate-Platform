import 'package:flutter/widgets.dart';

/// Bilingual UI copy.
///
/// Deliberately not ARB/gen-l10n: this app has two locales that are always
/// shipped together and a lot of the text is already bilingual in the data
/// (`{en, ar}` on every title and description). One lookup that takes both
/// strings keeps the copy next to the widget that renders it, and makes a
/// missing translation impossible rather than merely detectable.
class Strings {
  const Strings(this.locale);

  final String locale;

  bool get isArabic => locale == 'ar';

  static Strings of(BuildContext context) =>
      Strings(Localizations.localeOf(context).languageCode == 'ar' ? 'ar' : 'en');

  /// The one primitive: pick the right side.
  String pick(String en, String ar) => isArabic ? ar : en;

  // ------------------------------------------------------------- navigation --
  String get home => pick('Home', 'الرئيسية');
  String get search => pick('Search', 'ابحث');
  String get compounds => pick('Compounds', 'الكمبوندات');
  String get favorites => pick('Saved', 'المحفوظة');
  String get chat => pick('Assistant', 'المساعد');
  String get sell => pick('Sell', 'بيع');
  String get areas => pick('Areas', 'المناطق');
  String get developers => pick('Developers', 'المطورون');

  // ------------------------------------------------------------------- home --
  String get heroTitle => pick('Find your home', 'ابحث عن منزلك');
  String get heroSubtitle => pick(
        'Search and compare homes across Egypt, or list your own property for sale.',
        'ابحث وقارن بين العقارات في مصر أو اعرض عقارك للبيع',
      );
  String get searchPlaceholder =>
      pick('Search by area, compound or developer', 'ابحث بالمنطقة أو الكمبوند أو المطور');
  String get featuredListings => pick('Featured listings', 'وحدات مميزة');
  String get browseByArea => pick('Browse by area', 'تصفح حسب المنطقة');
  String get topDevelopers => pick('Top developers', 'أبرز المطورين');
  String get viewAll => pick('View all', 'عرض الكل');

  // ----------------------------------------------------------------- search --
  String get filters => pick('Filters', 'الفلاتر');
  String get apply => pick('Apply', 'تطبيق');
  String get reset => pick('Reset', 'إعادة تعيين');
  String get propertyType => pick('Property type', 'نوع العقار');
  String get bedrooms => pick('Bedrooms', 'غرف النوم');
  String get priceRange => pick('Price range', 'نطاق السعر');
  String get sortBy => pick('Sort by', 'ترتيب حسب');
  String get anyPrice => pick('Any price', 'كل الأسعار');
  String resultCount(int n) => isArabic ? '$n نتيجة' : '$n ${n == 1 ? 'result' : 'results'}';
  String get noResults =>
      pick('No properties match those filters', 'لا توجد عقارات تطابق هذه الفلاتر');
  String get noResultsHint => pick(
        'Try widening your budget, removing a filter, or searching a nearby area.',
        'جرّب توسيع الميزانية أو إزالة فلتر أو البحث في منطقة قريبة.',
      );

  // --------------------------------------------------------------- property --
  String get overview => pick('Overview', 'نظرة عامة');
  String get paymentPlan => pick('Payment plan', 'خطة السداد');
  String get downPayment => pick('Down payment', 'المقدم');
  String get monthly => pick('Monthly', 'شهريًا');
  String get handover => pick('Handover', 'التسليم');
  String get readyToMove => pick('Ready', 'جاهزة');
  String get amenities => pick('Amenities', 'المرافق');
  String get location => pick('Location', 'الموقع');
  String get bathrooms => pick('Bathrooms', 'الحمامات');
  String get area => pick('Area', 'المساحة');
  String get floor => pick('Floor', 'الدور');
  String get parking => pick('Parking', 'الجراج');
  String get finishing => pick('Finishing', 'التشطيب');
  String get reference => pick('Reference', 'كود الوحدة');
  String get requestCallback => pick('Request a callback', 'اطلب اتصالاً');
  String get similarProperties => pick('Similar properties', 'وحدات مشابهة');

  // ------------------------------------------------------------------ leads --
  String get fullName => pick('Your name', 'الاسم');
  String get phone => pick('Phone number', 'رقم الهاتف');
  String get message => pick('Message', 'رسالة');
  String get optional => pick('optional', 'اختياري');
  String get submit => pick('Submit', 'إرسال');
  String get sending => pick('Sending…', 'جارٍ الإرسال…');
  String get leadSent => pick(
        'Received. One of our agents will call you shortly.',
        'تم الاستلام. سيتصل بك أحد مستشارينا قريبًا.',
      );
  String get fieldRequired => pick('This field is required', 'هذا الحقل مطلوب');
  String get invalidPhone => pick(
        'Enter a valid Egyptian mobile, e.g. 01001234567',
        'أدخل رقم موبايل مصري صحيح، مثل 01001234567',
      );

  // ------------------------------------------------------------------- sell --
  String get sellTitle => pick('Sell your property with TopChoice', 'بيع عقارك مع توب تشويس');
  String get sellStep1 => pick('List your property details', 'سجل بيانات عقارك');
  String get sellStep1Body =>
      pick('Add all the information related to your property', 'أضف كل المعلومات الخاصة بعقارك');
  String get sellStep2 => pick('One of our agents will call you', 'أحد مستشارينا سيتصل بك');
  String get sellStep2Body =>
      pick('We will help you find the best buyer', 'سنساعدك في الوصول لأفضل مشترٍ');
  String get sellStep3 => pick('Meet with serious buyers', 'قابل مشترين جادين');
  String get sellStep3Body => pick('Final step to sell your property', 'الخطوة الأخيرة لبيع عقارك');
  String get step => pick('Step', 'خطوة');
  String get completeTheForm => pick('Complete the form', 'أكمل النموذج');
  String get privacyNote => pick(
        'Your privacy is important to us. We will not publish or share your information.',
        'خصوصيتك تهمنا. لن ننشر بياناتك أو نشاركها مع أي جهة.',
      );
  String get selectLocation => pick('Location', 'الموقع');
  String get selectCompound => pick('Compound', 'الكمبوند');
  String get notInCompound => pick('Not in a compound', 'خارج الكمبوندات');

  // ------------------------------------------------------------------- chat --
  String get chatTitle => pick('TopChoice assistant', 'مساعد توب تشويس');
  String get chatPlaceholder =>
      pick('Ask about a property, area or payment plan…', 'اسأل عن وحدة أو منطقة أو خطة سداد…');
  String get chatIntro => pick(
        'Ask me about listings, compounds, payment plans or the buying process.',
        'اسألني عن الوحدات أو الكمبوندات أو خطط السداد أو إجراءات الشراء.',
      );
  String get chatDisclaimer => pick(
        'Answers are indicative. Confirm details with a consultant.',
        'الإجابات استرشادية، يرجى تأكيد التفاصيل مع المستشار.',
      );
  String get sources => pick('Sources', 'المصادر');

  // -------------------------------------------------------------- favorites --
  String get noFavorites => pick('Nothing saved yet', 'لا توجد وحدات محفوظة');
  String get noFavoritesHint => pick(
        'Tap the heart on any listing to keep it here.',
        'اضغط على القلب في أي وحدة لحفظها هنا.',
      );
  String get saved => pick('Saved', 'تم الحفظ');
  String get removed => pick('Removed', 'تم الحذف');

  // ------------------------------------------------------------------ state --
  String get retry => pick('Try again', 'حاول مرة أخرى');
  String get somethingWentWrong => pick('Something went wrong', 'حدث خطأ ما');
  String get offlineHint => pick(
        'We could not reach the server. Check your connection and try again.',
        'تعذر الوصول إلى الخادم. تحقق من اتصالك وحاول مرة أخرى.',
      );
  String get loading => pick('Loading…', 'جارٍ التحميل…');
  String get language => pick('العربية', 'English');

  // ------------------------------------------------------------------ enums --
  String propertyTypeLabel(String value) => switch (value) {
        'apartment' => pick('Apartment', 'شقة'),
        'villa' => pick('Villa', 'فيلا'),
        'townhouse' => pick('Townhouse', 'تاون هاوس'),
        'twinhouse' => pick('Twinhouse', 'توين هاوس'),
        'duplex' => pick('Duplex', 'دوبلكس'),
        'penthouse' => pick('Penthouse', 'بنتهاوس'),
        'studio' => pick('Studio', 'استوديو'),
        'chalet' => pick('Chalet', 'شاليه'),
        'office' => pick('Office', 'مكتب'),
        'retail' => pick('Retail', 'محل تجاري'),
        'clinic' => pick('Clinic', 'عيادة'),
        _ => value,
      };

  String finishingLabel(String value) => switch (value) {
        'not-finished' => pick('Not finished', 'غير مشطبة'),
        'semi-finished' => pick('Semi finished', 'نصف تشطيب'),
        'fully-finished' => pick('Fully finished', 'تشطيب كامل'),
        'furnished' => pick('Furnished', 'مفروشة'),
        _ => value,
      };

  String saleTypeLabel(String value) => switch (value) {
        'primary' => pick('Primary', 'أولية'),
        'resale' => pick('Resale', 'إعادة بيع'),
        'rent' => pick('Rent', 'إيجار'),
        _ => value,
      };

  String sortLabel(String value) => switch (value) {
        'relevance' => pick('Most relevant', 'الأكثر صلة'),
        'price_asc' => pick('Price: low to high', 'السعر: من الأقل'),
        'price_desc' => pick('Price: high to low', 'السعر: من الأعلى'),
        'newest' => pick('Newest', 'الأحدث'),
        'area_desc' => pick('Largest area', 'الأكبر مساحة'),
        _ => value,
      };
}

import type { Metadata } from 'next';

import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: 'The terms and privacy notes that apply to using the Nawy marketplace.',
  alternates: { canonical: '/terms' },
  robots: { index: false, follow: true },
};

const SECTIONS = [
  {
    headingEn: 'Listings are indicative',
    headingAr: 'الوحدات المعروضة استرشادية',
    bodyEn:
      'Prices, payment plans, availability and handover dates are supplied by developers and brokers and can change without notice. Nothing on this site is an offer, and no listing is reserved until a developer confirms it in writing.',
    bodyAr:
      'الأسعار وخطط السداد والإتاحة وتواريخ التسليم يوفرها المطورون والوسطاء وقد تتغير دون إشعار. لا شيء على هذا الموقع يُعد عرضًا ملزمًا، ولا تُحجز أي وحدة حتى يؤكدها المطور كتابيًا.',
  },
  {
    headingEn: 'What Nawy does',
    headingAr: 'ما يقوم به ناوي',
    bodyEn:
      'Nawy lists property and introduces buyers to developers and their agents. Nawy is not a party to your purchase contract, does not hold deposits, and does not provide legal, tax or financial advice.',
    bodyAr:
      'يعرض ناوي العقارات ويقدّم المشترين إلى المطورين ووكلائهم. ناوي ليس طرفًا في عقد الشراء، ولا يحتفظ بالمقدمات، ولا يقدم استشارات قانونية أو ضريبية أو مالية.',
  },
  {
    headingEn: 'Your enquiries',
    headingAr: 'استفساراتك',
    bodyEn:
      'When you submit an enquiry, the details you give are shared with a Nawy consultant and, where relevant, the developer of the unit you asked about, so that they can contact you.',
    bodyAr:
      'عند إرسال استفسار، تُشارَك البيانات التي تقدمها مع مستشار ناوي، وعند الاقتضاء مع مطور الوحدة التي سألت عنها، حتى يتمكنوا من التواصل معك.',
  },
  {
    headingEn: 'Using the site',
    headingAr: 'استخدام الموقع',
    bodyEn:
      'You may browse and share listings freely. Scraping, bulk extraction and republishing the catalogue are not permitted.',
    bodyAr:
      'يمكنك التصفح ومشاركة الوحدات بحرية. أما الاستخراج الآلي أو الجماعي للبيانات وإعادة نشر الكتالوج فغير مسموح بها.',
  },
  {
    headingEn: 'Changes',
    headingAr: 'التعديلات',
    bodyEn:
      'These terms may be updated. Continuing to use the site after a change means you accept the current version.',
    bodyAr:
      'قد يتم تحديث هذه الشروط. استمرارك في استخدام الموقع بعد أي تغيير يعني قبولك النسخة الحالية.',
  },
];

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Legal" ar="قانوني" />}
        title={<T en="Terms of use" ar="شروط الاستخدام" />}
      />

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.headingEn} className="space-y-2">
            <h2 className="display text-lg text-foreground">
              <T en={section.headingEn} ar={section.headingAr} />
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              <T en={section.bodyEn} ar={section.bodyAr} />
            </p>
          </section>
        ))}
      </div>

      <p className="figure mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
        <T
          en="This is a demonstration project and the text above is not legal advice."
          ar="هذا مشروع تجريبي والنص أعلاه ليس استشارة قانونية."
        />
      </p>
    </div>
  );
}

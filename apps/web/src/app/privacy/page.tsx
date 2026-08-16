import type { Metadata } from 'next';

import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'The terms and privacy notes that apply to using the Nawy marketplace.',
  alternates: { canonical: '/privacy' },
  robots: { index: false, follow: true },
};

const SECTIONS = [
  {
    headingEn: 'What we collect',
    headingAr: 'ما الذي نجمعه',
    bodyEn:
      'Your name, phone number and email when you send an enquiry; your account details if you sign in; and the searches and listings you view, so results can be ranked usefully.',
    bodyAr:
      'اسمك ورقم هاتفك وبريدك عند إرسال استفسار، وبيانات حسابك عند تسجيل الدخول، وعمليات البحث والوحدات التي تشاهدها حتى نرتب النتائج بشكل مفيد.',
  },
  {
    headingEn: 'Why we collect it',
    headingAr: 'لماذا نجمعها',
    bodyEn:
      'To answer your enquiry, to pass it to the right consultant, and to improve which homes are shown to you. Enquiry details are shared with the developer of the unit you asked about.',
    bodyAr:
      'للرد على استفسارك وتحويله إلى المستشار المناسب وتحسين الوحدات المعروضة عليك. تُشارَك بيانات الاستفسار مع مطور الوحدة التي سألت عنها.',
  },
  {
    headingEn: 'Chat conversations',
    headingAr: 'محادثات المساعد',
    bodyEn:
      'Messages to the assistant are stored so a conversation can continue where it left off, and are reviewed to improve the answers. Do not send payment details or identity documents through chat.',
    bodyAr:
      'تُحفظ الرسائل المرسلة إلى المساعد حتى تكمل المحادثة من حيث توقفت، وتُراجَع لتحسين الإجابات. لا ترسل بيانات دفع أو مستندات هوية عبر المحادثة.',
  },
  {
    headingEn: 'Analytics',
    headingAr: 'التحليلات',
    bodyEn:
      'Listing views are recorded against a hashed identifier rather than a raw IP address, and are de-duplicated per viewer.',
    bodyAr:
      'تُسجَّل مشاهدات الوحدات مقابل معرّف مشفّر بدلاً من عنوان IP صريح، وتُستبعد التكرارات لكل زائر.',
  },
  {
    headingEn: 'Your choices',
    headingAr: 'خياراتك',
    bodyEn:
      'You can ask for a copy of what we hold, or ask us to delete it, by contacting us. Deleting an account anonymises it and keeps only what is needed for records of past enquiries.',
    bodyAr:
      'يمكنك طلب نسخة مما نحتفظ به أو طلب حذفه بالتواصل معنا. حذف الحساب يجعله مجهول الهوية ويبقي فقط ما يلزم لسجلات الاستفسارات السابقة.',
  },
];

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="Legal" ar="قانوني" />}
        title={<T en="Privacy" ar="الخصوصية" />}
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

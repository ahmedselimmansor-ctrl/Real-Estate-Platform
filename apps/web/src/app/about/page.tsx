import type { Metadata } from 'next';

import { T } from '@/components/i18n/t';
import { PageHeader } from '@/components/layout/page-header';

export const metadata: Metadata = {
  title: 'About',
  description: 'What TopChoice does and how the marketplace works.',
  alternates: { canonical: '/about' },
};

const SECTIONS = [
  {
    headingEn: 'Why the plan comes first',
    headingAr: 'لماذا تأتي خطة السداد أولاً',
    bodyEn:
      'Most homes in Egypt are sold off plan. What decides the purchase is rarely the headline price; it is the deposit, the length of the instalment run and the handover date. Those three numbers appear on every card, every listing and every brochure we generate, in the same format, so two compounds can be compared without arithmetic.',
    bodyAr:
      'معظم الوحدات في مصر تُباع على الخريطة. وما يحسم قرار الشراء نادرًا ما يكون السعر المعلن، بل المقدم ومدة التقسيط وتاريخ التسليم. هذه الأرقام الثلاثة تظهر على كل بطاقة وكل وحدة وكل كتيب نصدره، بنفس الصيغة، حتى تتمكن من مقارنة كمبوندين دون حساب.',
  },
  {
    headingEn: 'Where the data comes from',
    headingAr: 'من أين تأتي البيانات',
    bodyEn:
      'Listings are supplied by developers and brokers and are indexed for search within minutes of a change. Prices are indicative: a developer can revise a price list or a payment plan at any time, and a consultant confirms both before anything is reserved.',
    bodyAr:
      'الوحدات يوفرها المطورون والوسطاء وتُفهرس للبحث خلال دقائق من أي تغيير. الأسعار استرشادية: يمكن للمطور تعديل قائمة الأسعار أو خطة السداد في أي وقت، ويؤكد المستشار كليهما قبل حجز أي شيء.',
  },
  {
    headingEn: 'What we do not do',
    headingAr: 'ما لا نقوم به',
    bodyEn:
      'We do not negotiate on your behalf, hold deposits, or give legal or tax advice. For contracts, registration and anything binding, you deal with the developer and your own lawyer, and a TopChoice consultant can walk you through the steps.',
    bodyAr:
      'نحن لا نتفاوض نيابة عنك ولا نحتفظ بالمقدمات ولا نقدم استشارات قانونية أو ضريبية. أما العقود والتسجيل وأي أمر ملزم فتتعامل فيه مع المطور ومحاميك، ويمكن لمستشار توب تشويس أن يشرح لك الخطوات.',
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-6">
      <PageHeader
        eyebrow={<T en="About" ar="عن توب تشويس" />}
        title={<T en="Buying a home in Egypt, without the guesswork" ar="اشترِ منزلك في مصر بلا تخمين" />}
        lede={
          <T
            en="TopChoice lists primary and resale property from the developers building across Egypt, and shows the payment plan next to every price."
            ar="يعرض توب تشويس وحدات أولية وإعادة بيع من المطورين في كل مصر، ويضع خطة السداد بجوار كل سعر."
          />
        }
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
    </div>
  );
}

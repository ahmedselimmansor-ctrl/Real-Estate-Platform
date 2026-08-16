import type { Metadata } from 'next';

import { T } from '@/components/i18n/t';
import { SellForm } from '@/components/sell/sell-form';
import { SellMark } from '@/components/sell/sell-mark';
import { api } from '@/lib/api';
import type { Area, Compound } from '@/types/catalog';

/** The list endpoints cap `limit` at 100, so anything larger has to be paged. */
const PAGE_SIZE = 100;

async function fetchAll<T>(path: string, sort: string): Promise<T[]> {
  try {
    const first = await api.list<T>(path, { query: { limit: PAGE_SIZE, page: 1, sort } });
    if (first.meta.totalPages <= 1) return first.items;

    const rest = await Promise.all(
      Array.from({ length: first.meta.totalPages - 1 }, (_, i) =>
        api
          .list<T>(path, { query: { limit: PAGE_SIZE, page: i + 2, sort } })
          .then((page) => page.items)
          .catch(() => [] as T[]),
      ),
    );

    return [...first.items, ...rest.flat()];
  } catch {
    return [];
  }
}

export const metadata: Metadata = {
  title: 'Sell your property',
  description:
    'List your property with Nawy. Tell us about your unit, one of our agents calls you, and we bring you serious buyers.',
  alternates: { canonical: '/sell' },
};

const STEPS = [
  {
    titleEn: 'List Your Property Details',
    titleAr: 'سجل بيانات عقارك',
    bodyEn: 'Add all the information related to your property',
    bodyAr: 'أضف كل المعلومات الخاصة بعقارك',
  },
  {
    titleEn: 'One Of Our Agents Will Call You',
    titleAr: 'أحد مستشارينا سيتصل بك',
    bodyEn: 'We will help you find the best buyer',
    bodyAr: 'سنساعدك في الوصول لأفضل مشترٍ',
  },
  {
    titleEn: 'Meet With Serious Buyers',
    titleAr: 'قابل مشترين جادين',
    bodyEn: 'Final step to sell your property',
    bodyAr: 'الخطوة الأخيرة لبيع عقارك',
  },
] as const;

export default async function SellPage() {
  // The seller picks their area and compound from the real catalogue, so the
  // enquiry lands on an agent's desk already pointing at known records.
  const [areas, compounds] = await Promise.all([
    fetchAll<Area>('/areas', 'nameEn'),
    fetchAll<Compound>('/compounds', 'name'),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12 lg:px-6 lg:py-16">
      <header className="flex flex-col items-center text-center">
        <SellMark className="h-20 w-auto" />
        <h1 className="display mt-6 text-3xl text-foreground sm:text-4xl">
          <T en="Sell Your Property With Nawy" ar="بيع عقارك مع ناوي" />
        </h1>
      </header>

      {/* --------------------------------------------------------- the steps */}
      <ol className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => (
          <li
            key={step.titleEn}
            className="flex flex-col items-center rounded-xl bg-surface px-5 py-6 text-center"
          >
            <span
              className="figure grid size-12 place-items-center rounded-full bg-background text-lg leading-none font-semibold text-primary"
              aria-hidden
            >
              {index + 1}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              <T en="Step" ar="خطوة" />
            </span>
            <h2 className="mt-4 text-sm font-semibold text-foreground">
              <T en={step.titleEn} ar={step.titleAr} />
            </h2>
            <p className="mt-1.5 text-xs text-muted-foreground">
              <T en={step.bodyEn} ar={step.bodyAr} />
            </p>
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------------------- the form */}
      <section className="mt-10 rounded-2xl bg-surface p-6 sm:p-8" aria-labelledby="sell-form-title">
        <h2 id="sell-form-title" className="text-base font-semibold text-foreground">
          <T en="Complete The Form" ar="أكمل النموذج" />
        </h2>
        <p className="mt-1.5 mb-6 text-xs text-muted-foreground">
          <T
            en="Your privacy is important to us. We will not publish or share your information with anyone."
            ar="خصوصيتك تهمنا. لن ننشر بياناتك أو نشاركها مع أي جهة."
          />
        </p>

        <SellForm areas={areas} compounds={compounds} />
      </section>
    </div>
  );
}

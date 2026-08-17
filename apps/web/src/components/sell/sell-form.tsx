'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/hooks/use-i18n';
import { PROPERTY_TYPE_OPTIONS } from '@/lib/constants';
import { useCreateLead } from '@/lib/queries';
import { useAuthStore } from '@/store/auth.store';
import type { Area, Compound } from '@/types/catalog';

/**
 * Egypt is the only market TopChoice sells in, so the dial code is fixed rather than
 * a country picker: one less decision on a form a seller fills once.
 */
const DIAL_CODE = '+20';

function EgyptFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 12" className={className} role="img" aria-label="Egypt" xmlns="http://www.w3.org/2000/svg">
      <rect width="18" height="4" fill="#CE1126" />
      <rect y="4" width="18" height="4" fill="#FFFFFF" />
      <rect y="8" width="18" height="4" fill="#000000" />
      <path d="M9 4.6 9.55 6.1h1.55l-1.25.93.48 1.5L9 7.6l-1.33.93.48-1.5L6.9 6.1h1.55L9 4.6Z" fill="#C09300" />
    </svg>
  );
}

const schema = z.object({
  name: z.string().trim().min(2, 'required').max(160),
  /** Local part only. The dial code is prepended on submit. */
  phone: z
    .string()
    .trim()
    .regex(/^0?1[0-9]{9}$/, 'phone'),
  areaId: z.string().min(1, 'required'),
  compoundId: z.string().optional(),
  propertyType: z.string().min(1, 'required'),
  message: z.string().trim().max(2000).optional(),
  /** Honeypot: real sellers never see it, bots fill it in. */
  company: z.string().max(200).optional(),
});

type SellFormValues = z.infer<typeof schema>;

/** Sentinel: a Radix SelectItem cannot hold an empty value. */
const NO_COMPOUND = 'none';

export function SellForm({ areas, compounds }: { areas: Area[]; compounds: Compound[] }) {
  const t = useT();
  const { locale } = useI18n();
  const user = useAuthStore((state) => state.user);
  const createLead = useCreateLead();
  const [submitted, setSubmitted] = React.useState(false);

  const form = useForm<SellFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      phone: '',
      areaId: '',
      compoundId: '',
      propertyType: '',
      message: '',
      company: '',
    },
  });

  const areaId = form.watch('areaId');

  // Picking an area narrows the compound list, because a seller knows their
  // compound but not which of the 30 on TopChoice shares a name.
  const compoundsInArea = React.useMemo(
    () => (areaId ? compounds.filter((compound) => compound.areaId === areaId) : compounds),
    [areaId, compounds],
  );

  // A compound chosen before the area changed may no longer be in the list.
  React.useEffect(() => {
    const chosen = form.getValues('compoundId');
    if (chosen && chosen !== NO_COMPOUND && !compoundsInArea.some((c) => c.id === chosen)) {
      form.setValue('compoundId', '');
    }
  }, [compoundsInArea, form]);

  const onSubmit = form.handleSubmit((values) => {
    createLead.mutate(
      {
        name: values.name,
        // Stored E.164-ish: the API accepts a leading + and digits.
        phone: `${DIAL_CODE}${values.phone.replace(/^0/, '')}`,
        areaId: values.areaId,
        compoundId: !values.compoundId || values.compoundId === NO_COMPOUND ? undefined : values.compoundId,
        propertyType: values.propertyType,
        message: values.message || undefined,
        source: 'sell_page',
      },
      {
        onSuccess: () => {
          setSubmitted(true);
          toast.success(
            t(
              'Received. One of our agents will call you shortly.',
              'تم الاستلام. سيتصل بك أحد مستشارينا قريبًا.',
            ),
          );
          form.reset();
        },
        onError: (error) =>
          toast.error(
            error.message ||
              t('Could not send your request. Please try again.', 'تعذر إرسال طلبك. حاول مرة أخرى.'),
          ),
      },
    );
  });

  const { errors } = form.formState;

  const messageFor = (key: keyof SellFormValues): string | null => {
    const error = errors[key];
    if (!error) return null;
    if (error.message === 'phone') {
      return t('Enter a valid Egyptian mobile, e.g. 01001234567', 'أدخل رقم موبايل مصري صحيح، مثل 01001234567');
    }
    return t('This field is required', 'هذا الحقل مطلوب');
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle2 className="size-10 text-primary" aria-hidden />
        <h3 className="display text-xl text-foreground">
          <T en="Thanks, we have your details" ar="شكرًا، وصلتنا بياناتك" />
        </h3>
        <p className="max-w-md text-sm text-muted-foreground">
          <T
            en="One of our agents will call you to confirm the details and agree a price with you."
            ar="سيتصل بك أحد مستشارينا لتأكيد التفاصيل والاتفاق معك على السعر."
          />
        </p>
        <Button variant="outline" className="mt-2" onClick={() => setSubmitted(false)}>
          <T en="List another property" ar="اعرض عقارًا آخر" />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Honeypot: off-screen rather than hidden, so bots reading styles still fill it. */}
      <div aria-hidden className="absolute -start-[9999px] size-px overflow-hidden">
        <label htmlFor="sell-company">Company</label>
        <input id="sell-company" tabIndex={-1} autoComplete="off" {...form.register('company')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ---------------------------------------------------------- name */}
        <div className="space-y-1.5">
          <Label htmlFor="sell-name" className="sr-only">
            <T en="Your name" ar="الاسم" />
          </Label>
          <Input
            id="sell-name"
            autoComplete="name"
            placeholder={t('Your Name', 'الاسم')}
            aria-invalid={Boolean(errors.name)}
            className="h-12 bg-background"
            {...form.register('name')}
          />
          {messageFor('name') && <p className="text-xs text-destructive">{messageFor('name')}</p>}
        </div>

        {/* --------------------------------------------------------- phone */}
        <div className="space-y-1.5">
          <Label htmlFor="sell-phone" className="sr-only">
            <T en="Phone number" ar="رقم الهاتف" />
          </Label>
          <div className="flex h-12 items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-[3px] focus-within:ring-ring/50">
            <span className="flex items-center gap-1.5 border-e border-input px-3 text-sm text-muted-foreground">
              <EgyptFlag className="h-3 w-4.5 rounded-[2px] ring-1 ring-black/10" />
              <span className="figure">{DIAL_CODE}</span>
            </span>
            <input
              id="sell-phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              placeholder="01001234567"
              aria-invalid={Boolean(errors.phone)}
              className="figure min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
              {...form.register('phone')}
            />
          </div>
          {messageFor('phone') && <p className="text-xs text-destructive">{messageFor('phone')}</p>}
        </div>

        {/* ------------------------------------------------------ location */}
        <div className="space-y-1.5">
          <Select
            value={form.watch('areaId')}
            onValueChange={(value) => form.setValue('areaId', value, { shouldValidate: true })}
          >
            <SelectTrigger
              className="h-12 bg-background"
              aria-label={t('Location', 'الموقع')}
              aria-invalid={Boolean(errors.areaId)}
            >
              <SelectValue placeholder={t('Location', 'الموقع')} />
            </SelectTrigger>
            <SelectContent>
              {areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {locale === 'ar' ? area.nameAr : area.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {messageFor('areaId') && (
            <p className="text-xs text-destructive">{messageFor('areaId')}</p>
          )}
        </div>

        {/* ------------------------------------------------------ compound */}
        <div className="space-y-1.5">
          <Select
            value={form.watch('compoundId')}
            onValueChange={(value) => form.setValue('compoundId', value)}
          >
            <SelectTrigger className="h-12 bg-background" aria-label={t('Compound', 'الكمبوند')}>
              <SelectValue placeholder={t('Compound', 'الكمبوند')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_COMPOUND}>
                {t('Not in a compound', 'خارج الكمبوندات')}
              </SelectItem>
              {compoundsInArea.map((compound) => (
                <SelectItem key={compound.id} value={compound.id}>
                  {locale === 'ar' ? compound.nameAr : compound.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ------------------------------------------------------ unit type */}
      <div className="space-y-1.5">
        <Select
          value={form.watch('propertyType')}
          onValueChange={(value) => form.setValue('propertyType', value, { shouldValidate: true })}
        >
          <SelectTrigger
            className="h-12 w-full bg-background"
            aria-label={t('Property type', 'نوع العقار')}
            aria-invalid={Boolean(errors.propertyType)}
          >
            <SelectValue placeholder={t('Property Type', 'نوع العقار')} />
          </SelectTrigger>
          <SelectContent>
            {PROPERTY_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {locale === 'ar' ? option.labelAr : option.labelEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {messageFor('propertyType') && (
          <p className="text-xs text-destructive">{messageFor('propertyType')}</p>
        )}
      </div>

      {/* ---------------------------------------------------- description */}
      <div className="space-y-1.5">
        <Label htmlFor="sell-message" className="sr-only">
          <T en="Description" ar="الوصف" />
        </Label>
        <Textarea
          id="sell-message"
          rows={4}
          className="bg-background"
          placeholder={t(
            'Description: size, bedrooms, floor, finishing, asking price',
            'الوصف: المساحة، عدد الغرف، الدور، التشطيب، السعر المطلوب',
          )}
          {...form.register('message')}
        />
      </div>

      <div className="flex justify-center pt-1">
        <Button type="submit" size="lg" className="min-w-48" disabled={createLead.isPending}>
          {createLead.isPending ? (
            <>
              <Spinner className="me-2 size-4" />
              {t('Sending…', 'جارٍ الإرسال…')}
            </>
          ) : (
            t('Submit', 'إرسال')
          )}
        </Button>
      </div>
    </form>
  );
}

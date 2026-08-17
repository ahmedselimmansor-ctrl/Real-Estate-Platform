'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Phone, Send } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { useCreateLead } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

const schema = z.object({
  name: z.string().trim().min(2, 'Please tell us your name').max(160),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{6,19}$/, 'Enter a valid phone number, e.g. +20 100 123 4567'),
  email: z.string().trim().email('Enter a valid email').max(320).optional().or(z.literal('')),
  message: z.string().trim().max(2000).optional(),
  /** Honeypot — real users never see it, bots fill it in. */
  company: z.string().max(200).optional(),
});

export type LeadFormValues = z.infer<typeof schema>;

interface LeadFormProps {
  propertyId?: string;
  source?: string;
  title?: string;
  description?: string;
  defaultMessage?: string;
  className?: string;
  compact?: boolean;
}

export function LeadForm({
  propertyId,
  source = 'property_detail',
  title,
  description,
  defaultMessage,
  className,
  compact = false,
}: LeadFormProps) {
  const t = useT();
  const user = useAuthStore((state) => state.user);
  const createLead = useCreateLead();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name ?? '',
      phone: user?.phone ?? '',
      email: user?.email ?? '',
      message: defaultMessage ?? '',
      company: '',
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    createLead.mutate(
      {
        propertyId,
        name: values.name,
        phone: values.phone,
        email: values.email || undefined,
        message: values.message || undefined,
        source,
      },
      {
        onSuccess: () => {
          toast.success('Thanks, a consultant will call you shortly.');
          form.reset({ ...form.getValues(), message: '' });
        },
        onError: (error) =>
          toast.error(error.message || 'Could not send your request. Please try again.'),
      },
    );
  });

  const { errors } = form.formState;

  return (
    <form onSubmit={onSubmit} className={cn('space-y-4', className)} noValidate>
      {!compact && (
        <div className="space-y-1">
          <h3 className="text-base font-semibold">
            {title ?? t('Request a callback', 'اطلب اتصالاً')}
          </h3>
          <p className="text-sm text-muted-foreground">
            {description ??
              t(
                'A TopChoice consultant will get back to you, usually within the hour.',
                'سيعاود مستشار توب تشويس الاتصال بك، عادةً خلال ساعة.',
              )}
          </p>
        </div>
      )}

      {/* Honeypot: off-screen, not hidden, so bots that read styles still fill it. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" tabIndex={-1} autoComplete="off" {...form.register('company')} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-name">
          <T en="Full name" ar="الاسم بالكامل" />
        </Label>
        <Input
          id="lead-name"
          autoComplete="name"
          aria-invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-phone">
          <T en="Phone" ar="رقم الهاتف" />
        </Label>
        <Input
          id="lead-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+20 100 123 4567"
          aria-invalid={Boolean(errors.phone)}
          {...form.register('phone')}
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="lead-email">
          <T en="Email" ar="البريد الإلكتروني" />{' '}
          <span className="font-normal text-muted-foreground">
            <T en="(optional)" ar="(اختياري)" />
          </span>
        </Label>
        <Input
          id="lead-email"
          type="email"
          autoComplete="email"
          aria-invalid={Boolean(errors.email)}
          {...form.register('email')}
        />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {!compact && (
        <div className="space-y-1.5">
          <Label htmlFor="lead-message">
            <T en="Message" ar="رسالة" />{' '}
          <span className="font-normal text-muted-foreground">
            <T en="(optional)" ar="(اختياري)" />
          </span>
          </Label>
          <Textarea
            id="lead-message"
            rows={3}
            placeholder={t('I would like to book a viewing this weekend.', 'أود حجز معاينة نهاية هذا الأسبوع.')}
            {...form.register('message')}
          />
        </div>
      )}

      <Button type="submit" className="w-full" disabled={createLead.isPending}>
        {createLead.isPending ? (
          <>
            <Spinner className="me-2 size-4" />
            {t('Sending…', 'جارٍ الإرسال…')}
          </>
        ) : (
          <>
            <Send className="me-2 size-4" />
            {t('Request a callback', 'اطلب اتصالاً')}
          </>
        )}
      </Button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Phone className="size-3" />
        <T en="Or call us on" ar="أو اتصل بنا على" /> 16766
      </p>
    </form>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/hooks/use-i18n';
import { errorMessage } from '@/lib/api';
import { LEAD_SOURCES } from '@/lib/constants';
import { useCreateLead } from '@/lib/queries';

/**
 * Footer lead capture — "tell me about new launches". Posts a `newsletter`
 * lead to `POST /api/v1/leads` (CONTRACT §6).
 */

/** Egyptian mobile: 010/011/012/015 + 8 digits, with or without +20. */
const EGYPT_MOBILE = /^(?:\+?20|0)?1[0125]\d{8}$/;

const schema = z.object({
  name: z.string().trim().min(2, 'Please enter your name'),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z
    .string()
    .trim()
    .regex(EGYPT_MOBILE, 'Enter a valid Egyptian mobile number, e.g. 01001234567'),
});

type NewsletterValues = z.infer<typeof schema>;

export function NewsletterForm() {
  const { pick } = useI18n();

  const form = useForm<NewsletterValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', phone: '' },
    mode: 'onBlur',
  });

  const createLead = useCreateLead({
    onSuccess: () => {
      toast.success(
        pick('You are on the list, we will be in touch.', 'تم تسجيلك, سنتواصل معك قريباً.'),
      );
      form.reset();
    },
    onError: (error) => {
      toast.error(errorMessage(error, pick('Could not subscribe', 'تعذر الاشتراك')));
    },
  });

  function onSubmit(values: NewsletterValues) {
    createLead.mutate({
      name: values.name,
      email: values.email,
      phone: values.phone,
      message: 'Newsletter subscription, new launches & price drops',
      source: LEAD_SOURCES.newsletter,
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">{pick('Name', 'الاسم')}</FormLabel>
              <FormControl>
                <Input
                  inputSize="sm"
                  autoComplete="name"
                  placeholder={pick('Your name', 'اسمك')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">{pick('Email', 'البريد الإلكتروني')}</FormLabel>
              <FormControl>
                <Input
                  inputSize="sm"
                  type="email"
                  autoComplete="email"
                  placeholder={pick('you@example.com', 'you@example.com')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">{pick('Mobile', 'رقم الموبايل')}</FormLabel>
              <FormControl>
                <Input
                  inputSize="sm"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="01001234567"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" size="sm" loading={createLead.isPending} className="w-full">
          {!createLead.isPending ? <Send aria-hidden="true" /> : null}
          {pick('Notify me', 'أبلغني')}
        </Button>
      </form>
    </Form>
  );
}

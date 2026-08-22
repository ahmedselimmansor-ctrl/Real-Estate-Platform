'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, MailCheck } from 'lucide-react';

import { T, useT } from '@/components/i18n/t';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useForgotPassword } from '@/lib/queries';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const t = useT();
  const [submitted, setSubmitted] = useState(false);
  const forgotPassword = useForgotPassword();

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit((values) => {
    forgotPassword.mutate(values, {
      // The endpoint answers 200 whether or not the address is registered, so
      // the confirmation is shown either way. Reporting "no such account" here
      // would hand out a list of who has one.
      onSettled: () => setSubmitted(true),
    });
  });

  if (submitted) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-success/10">
            <MailCheck className="size-5 text-success" />
          </div>
          <h1 className="display text-2xl text-foreground">
            <T en="Check your inbox" ar="تحقق من بريدك" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <T
              en="If that address belongs to a TopChoice account, a reset link is on its way. The link expires in an hour."
              ar="إذا كان هذا البريد مرتبطًا بحساب في توب تشويس، فسيصلك رابط إعادة التعيين. تنتهي صلاحية الرابط خلال ساعة."
            />
          </p>
          <Button variant="outline" className="w-full" onClick={() => setSubmitted(false)}>
            <T en="Use a different address" ar="استخدم بريدًا آخر" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { errors } = form.formState;

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10">
            <KeyRound className="size-5 text-primary" />
          </div>
          <h1 className="display text-2xl text-foreground">
            <T en="Reset your password" ar="إعادة تعيين كلمة المرور" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <T
              en="Enter the address on your account and we will send a reset link."
              ar="أدخل البريد المرتبط بحسابك وسنرسل لك رابط إعادة التعيين."
            />
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">
              <T en="Email" ar="البريد الإلكتروني" />
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="admin@topchoice.local"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...form.register('email')}
            />
            {errors.email ? (
              <p id="email-error" role="alert" className="text-xs text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={forgotPassword.isPending}>
            {forgotPassword.isPending ? <Spinner className="size-4" /> : null}
            {t('Send the reset link', 'أرسل رابط إعادة التعيين')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

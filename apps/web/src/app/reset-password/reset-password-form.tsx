'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useResetPassword } from '@/lib/queries';
import { routes } from '@/lib/routes';

/** Mirrors the server-side rule (CONTRACT §5) so the failure is caught here. */
const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .regex(/[a-z]/, 'Include a lowercase letter')
      .regex(/[A-Z]/, 'Include an uppercase letter')
      .regex(/[0-9]/, 'Include a number'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });

type Values = z.infer<typeof schema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const resetPassword = useResetPassword();

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  });

  // A visitor who lands here without a token followed a broken or truncated
  // link; say so rather than letting them fill in a form that cannot succeed.
  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-destructive/10">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <h1 className="display text-2xl text-foreground">
            <T en="This link is incomplete" ar="هذا الرابط غير مكتمل" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <T
              en="The reset link is missing its token. Request a new one and open it directly from the email."
              ar="الرابط ينقصه رمز التحقق. اطلب رابطًا جديدًا وافتحه مباشرة من البريد."
            />
          </p>
          <Button asChild className="w-full">
            <a href={routes.forgotPassword}>
              <T en="Request a new link" ar="اطلب رابطًا جديدًا" />
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = form.handleSubmit((values) => {
    resetPassword.mutate(
      { token, password: values.password },
      {
        onSuccess: () => {
          toast.success(t('Password updated. Sign in with it now.', 'تم تحديث كلمة المرور.'));
          router.replace(routes.login);
        },
        onError: (error) =>
          toast.error(
            error.status === 400 || error.status === 410
              ? t(
                  'That reset link has expired or was already used.',
                  'انتهت صلاحية الرابط أو تم استخدامه بالفعل.',
                )
              : error.message || t('Could not reset the password.', 'تعذر إعادة تعيين كلمة المرور.'),
          ),
      },
    );
  });

  const { errors } = form.formState;

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10">
            <KeyRound className="size-5 text-primary" />
          </div>
          <h1 className="display text-2xl text-foreground">
            <T en="Choose a new password" ar="اختر كلمة مرور جديدة" />
          </h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="password">
              <T en="New password" ar="كلمة المرور الجديدة" />
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...form.register('password')}
            />
            {errors.password ? (
              <p id="password-error" role="alert" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">
              <T en="Confirm password" ar="تأكيد كلمة المرور" />
            </Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={errors.confirm ? 'confirm-error' : undefined}
              {...form.register('confirm')}
            />
            {errors.confirm ? (
              <p id="confirm-error" role="alert" className="text-xs text-destructive">
                {errors.confirm.message}
              </p>
            ) : null}
          </div>

          <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
            {resetPassword.isPending ? <Spinner className="size-4" /> : null}
            {t('Update the password', 'تحديث كلمة المرور')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

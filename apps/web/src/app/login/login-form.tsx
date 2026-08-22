'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { T, useT } from '@/components/i18n/t';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useLogin } from '@/lib/queries';
import { routes } from '@/lib/routes';
import { useAuthStore } from '@/store/auth.store';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginValues = z.infer<typeof schema>;

/** Roles allowed into the dashboard. */
const STAFF_ROLES = new Set(['agent', 'admin', 'superadmin']);

export function LoginForm({ next }: { next: string }) {
  const t = useT();
  const router = useRouter();
  const login = useLogin();

  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated');

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(next);
    }
  }, [isAuthenticated, next, router]);

  const form = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = form.handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: (result) => {
        if (!STAFF_ROLES.has(result.user.role)) {
          toast.error('This account does not have dashboard access.');
          return;
        }
        toast.success(`Welcome back, ${result.user.name}`);
        router.replace(next);
      },
      onError: (error) =>
        toast.error(
          error.code === 'INVALID_CREDENTIALS'
            ? 'Incorrect email or password.'
            : error.message || 'Could not sign you in. Please try again.',
        ),
    });
  });

  const { errors } = form.formState;

  return (
    <Card className="w-full max-w-sm">
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
          </div>
          <h1 className="display text-2xl text-foreground">
            <T en="Dashboard sign in" ar="تسجيل دخول لوحة التحكم" />
          </h1>
          <p className="text-sm text-muted-foreground">
            <T
              en="Staff access only. Browsing properties does not require an account."
              ar="للموظفين فقط. تصفح العقارات لا يتطلب حسابًا."
            />
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="email">
              <T en="Email" ar="البريد الإلكتروني" />
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="admin@topchoice.local"
              aria-invalid={Boolean(errors.email)}
              {...form.register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">
              <T en="Password" ar="كلمة المرور" />
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              {...form.register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? (
              <>
                <Spinner className="me-2 size-4" />
                {t('Signing in', 'جارٍ تسجيل الدخول')}
              </>
            ) : (
              <>
                <LogIn className="me-2 size-4" />
                {t('Sign in', 'تسجيل الدخول')}
              </>
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          <Link
            href={routes.forgotPassword}
            className="underline underline-offset-2 hover:text-foreground"
          >
            <T en="Forgotten your password?" ar="نسيت كلمة المرور؟" />
          </Link>
        </p>

        {user && !STAFF_ROLES.has(user.role) && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <T en="You are signed in as" ar="أنت مسجّل باسم" /> {user.email}
            <T en=", which has no dashboard access." ar="، وهذا الحساب لا يملك صلاحية لوحة التحكم." />
          </p>
        )}
      </CardContent>
    </Card>
  );
}

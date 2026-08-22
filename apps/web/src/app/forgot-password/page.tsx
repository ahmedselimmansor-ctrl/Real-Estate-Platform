import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { T } from '@/components/i18n/t';
import { routes } from '@/lib/routes';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Reset your password',
  description: 'Request a password reset link for your TopChoice staff account.',
  // An account-recovery page has no business in an index.
  robots: { index: false, follow: false },
};

/**
 * Staff password recovery. The API has implemented forgot/reset since the
 * beginning; until now there was no way to reach it, so a locked-out admin had
 * to be fixed by hand in the database.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-7xl flex-col items-center justify-center gap-6 px-4 py-12">
      <ForgotPasswordForm />

      <Link
        href={routes.login}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        <T en="Back to sign in" ar="العودة لتسجيل الدخول" />
      </Link>
    </div>
  );
}

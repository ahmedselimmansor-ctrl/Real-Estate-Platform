import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { T } from '@/components/i18n/t';
import { routes } from '@/lib/routes';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Choose a new password',
  description: 'Set a new password for your TopChoice staff account.',
  robots: { index: false, follow: false },
};

/** The token arrives in the emailed link, so this must render per request. */
export const dynamic = 'force-dynamic';

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const { token } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-7xl flex-col items-center justify-center gap-6 px-4 py-12">
      <ResetPasswordForm token={token ?? ''} />

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

import type { Metadata } from 'next';
import { Mail, MapPin, Phone } from 'lucide-react';

import { T } from '@/components/i18n/t';
import { LeadForm } from '@/components/forms/lead-form';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Contact us',
  description:
    'Talk to a TopChoice property consultant about buying, reselling or renting in Egypt. Request a callback and we will get back to you.',
  alternates: { canonical: '/contact' },
};

const CHANNELS = [
  { icon: Phone, labelEn: 'Call us', labelAr: 'اتصل بنا', value: '16766', href: 'tel:16766' },
  {
    icon: Mail,
    labelEn: 'Email',
    labelAr: 'البريد',
    value: 'hello@topchoice.local',
    href: 'mailto:hello@topchoice.local',
  },
  {
    icon: MapPin,
    labelEn: 'Office',
    labelAr: 'المكتب',
    value: 'New Cairo, Cairo Governorate',
    href: null,
  },
] as const;

export default function ContactPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 lg:px-6">
      <header className="max-w-2xl space-y-2">
        <h1 className="display text-3xl text-foreground sm:text-4xl">
          <T en="Talk to a consultant" ar="تحدث مع مستشار" />
        </h1>
        <p className="text-muted-foreground">
          <T
            en="Tell us what you are looking for: budget, area, number of bedrooms, and a TopChoice consultant will call you back with matching options."
            ar="أخبرنا بما تبحث عنه: الميزانية والمنطقة وعدد الغرف، وسيتصل بك مستشار توب تشويس بخيارات مناسبة."
          />
        </p>
      </header>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-6">
            {/* No title/description props: LeadForm supplies its own
                translated defaults. */}
            <LeadForm source="contact_page" />
          </CardContent>
        </Card>

        <aside className="space-y-4">
          {CHANNELS.map((channel) => (
            <Card key={channel.labelEn}>
              <CardContent className="flex items-start gap-3 p-5">
                <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10">
                  <channel.icon className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    <T en={channel.labelEn} ar={channel.labelAr} />
                  </p>
                  {channel.href ? (
                    <a href={channel.href} className="font-medium hover:text-primary">
                      {channel.value}
                    </a>
                  ) : (
                    <p className="font-medium">{channel.value}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </aside>
      </div>
    </div>
  );
}

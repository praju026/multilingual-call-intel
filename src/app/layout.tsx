import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-header',
  display: 'swap',
});

import { ClerkProvider } from '@clerk/nextjs';

export const metadata: Metadata = {
  title: 'AuraIntel | Multilingual Call Intelligence Platform',
  description: 'Process customer support or sales recordings, generate summaries, diarize speakers, and extract insights in multiple languages.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hasClerkKey = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const bodyContent = (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <div className="bg-glow-radial" />
        {children}
      </body>
    </html>
  );

  if (hasClerkKey) {
    return <ClerkProvider>{bodyContent}</ClerkProvider>;
  }

  return bodyContent;
}

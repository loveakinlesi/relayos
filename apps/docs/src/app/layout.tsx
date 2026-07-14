import { RootProvider } from 'fumadocs-ui/provider/next';
import StaticSearchDialog from '@/components/static-search-dialog';
import './global.css';
import { Inter } from 'next/font/google';
import type { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin'],
});

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  metadataBase: new URL(`https://loveakinlesi.github.io${basePath}`),
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider search={{ SearchDialog: StaticSearchDialog }}>{children}</RootProvider>
      </body>
    </html>
  );
}

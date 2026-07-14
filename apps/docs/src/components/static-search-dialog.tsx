'use client';

import DefaultSearchDialog from 'fumadocs-ui/components/dialog/search-default';
import type { SharedProps } from 'fumadocs-ui/contexts/search';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function StaticSearchDialog(props: SharedProps) {
  return <DefaultSearchDialog type="static" api={`${basePath}/api/search`} {...props} />;
}

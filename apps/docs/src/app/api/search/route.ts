import { source } from '@/lib/source';
import { createFromSource } from 'fumadocs-core/search/server';

// staticGET exports the whole prebuilt index as one JSON response instead of
// answering per-query - GitHub Pages (and static export generally) can only
// serve static files, so searching happens client-side against this
// exported index (see DefaultSearchDialog's type="static" in layout.tsx),
// not via a live server-side query.
export const dynamic = 'force-static';

export const { staticGET: GET } = createFromSource(source, {
  // https://docs.orama.com/docs/orama-js/supported-languages
  language: 'english',
});

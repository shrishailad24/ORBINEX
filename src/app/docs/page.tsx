import type { Metadata } from 'next';
import DocsClient from './DocsClient';
import { ENDPOINT_COUNT } from './apiCatalog';

export const metadata: Metadata = {
  title: 'Documentation & API Reference',
  description: `Official ORBINEX documentation — self-hosting guide, interface reference, and the complete API reference for all ${ENDPOINT_COUNT} endpoints covering satellite, geospatial, aviation, maritime, seismic, and monitoring feeds. No API key required.`,
  alternates: { canonical: '/docs' },
  openGraph: {
    title: 'ORBINEX — Documentation & API Reference',
    description: `Self-hosting guide, interface reference, and the complete API reference for all ${ENDPOINT_COUNT} ORBINEX endpoints.`,
    url: '/docs',
    type: 'article',
  },
};

export default function DocsPage() {
  return <DocsClient />;
}

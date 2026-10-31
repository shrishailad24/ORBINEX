import type { Metadata, Viewport } from "next";
import ErrorBoundary from '@/components/ErrorBoundary';
import { BRAND } from '@/lib/brand';
import "./globals.css";

const SITE_URL = BRAND.url;
const SITE_NAME = BRAND.name;
const SITE_TITLE = `${BRAND.name} — ${BRAND.description} | ${BRAND.keywords}`;
const SITE_DESCRIPTION = `${BRAND.metaDescription} ${BRAND.tagline}`;

export const viewport: Viewport = {
  themeColor: "#00E5FF",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  colorScheme: "dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s | ${BRAND.name} Intelligence`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    // ORBINEX Core
    "ORBINEX", "orbinex.live", "geospatial intelligence", "GEOINT", "satellite AI",
    "earth intelligence", "satellite observation", "change detection", "remote sensing",
    "satellite imagery", "forest monitoring", "settlement monitoring", "historical satellite comparison",

    // OSINT Tools & Platforms
    "OSINT tools", "online OSINT toolkit", "OSINT framework",
    "threat intelligence", "IP geolocation", "network reconnaissance",
    
    // Tracking & Data
    "flight tracker", "aircraft tracking", "ADS-B tracker", "live flight radar",
    "satellite tracking", "ISS tracker", "space station tracker",
    "CCTV cameras live", "security cameras worldwide", "live cameras",
    "earthquake monitor", "seismic activity", "USGS earthquake",
    "wildfire tracker", "NASA FIRMS", "active fires",
    "nuclear facilities map", "severe weather alerts", "weather radar",
    "cyber threats dashboard", "CVE tracker",
    "defense stocks", "commodities tracker",
  ],
  authors: [{ name: "ORBINEX Project", url: SITE_URL }],
  creator: "ORBINEX Project",
  publisher: "ORBINEX Project",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.svg", type: "image/svg+xml", sizes: "32x32" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180" },
    ],
    shortcut: "/favicon.svg",
    other: [
      {
        rel: "apple-touch-icon-precomposed",
        url: "/apple-touch-icon.png",
      },
    ],
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: `${BRAND.name} — ${BRAND.description} | ${BRAND.keywords}`,
    description: SITE_DESCRIPTION,
    type: "website",
    siteName: SITE_NAME,
    locale: "en_US",
    url: SITE_URL,
    images: [
      {
        url: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: BRAND.fullTitle,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `🛰️ ${BRAND.name} — ${BRAND.tagline}`,
    description: SITE_DESCRIPTION,
    creator: "@orbinex",
    site: "@orbinex",
    images: [`${SITE_URL}/og-image.png`],
  },
  category: "technology",
  classification: "Geospatial Intelligence & Security",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "apple-mobile-web-app-title": "ORBINEX",
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#030712",
    "msapplication-config": "none",
  },
};

// JSON-LD Structured Data
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: BRAND.fullTitle,
  alternateName: ["ORBINEX", "OrbinexAI", "Orbinex Intelligence"],
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  browserRequirements: "Requires a modern web browser",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  featureList: [
    "Nmap port scanning from the browser — no install required",
    "DNS record lookup (A, AAAA, MX, NS, TXT, CNAME)",
    "WHOIS domain registration lookup",
    "SSL/TLS certificate transparency search",
    "BGP routing & ASN lookup",
    "IP geolocation & threat intelligence",
    "Real-time flight tracking via ADS-B",
    "Satellite tracking (including ISS)",
    "Worldwide CCTV camera monitoring",
    "Earthquake monitoring (USGS live feed)",
    "Wildfire detection (NASA FIRMS satellite data)",
    "Nuclear facility mapping (curated reference list, not a live feed)",
    "Severe weather alerts & tracking",
    "Cyber threat & CVE intelligence",
    "Space weather & solar storm monitoring",
    "GPS jamming detection",
    "Defense & commodity market tracking",
    "SIGINT news aggregation feed",
    "Interactive 3D globe with day/night cycle",
    "Region intelligence dossier reports",
  ],
  screenshot: `${SITE_URL}/og-image.png`,
  author: {
    "@type": "Organization",
    name: "ORBINEX Project",
    url: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="icon" href="/favicon.svg" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="canonical" href={SITE_URL} />
        
        {/* JSON-LD Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

      </head>
      <body className="antialiased">
        <ErrorBoundary name="ORBINEX Core">
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}

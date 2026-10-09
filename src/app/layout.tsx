import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Serif display face for page titles and marketing headings: academic, not template-generic.
const display = Source_Serif_4({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"], display: "swap" });

const description = "School management system with admin, principal, Faculty and student portals.";

export const metadata: Metadata = {
  // Absolute base for preview images; Vercel provides the production domain at build time.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://bigsms-seven.vercel.app",
  ),
  title: { default: "LGITE Portal", template: "%s · LGITE Portal" },
  description,
  applicationName: "LGITE Portal",
  // Link previews (WhatsApp, Slack, email, social) show the LGITE crest.
  openGraph: {
    type: "website",
    siteName: "Lahore Garrison Institute of Technical Education",
    title: "LGITE Portal",
    description,
    images: [{ url: "/lgite-icon-512.png", width: 512, height: 512, alt: "Lahore Garrison Institute of Technical Education crest" }],
  },
  twitter: { card: "summary", title: "LGITE Portal", description, images: ["/lgite-icon-512.png"] },
};

export const viewport = { themeColor: "#002A64" };

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        <MotionProvider>
          {children}
          <Toaster />
        </MotionProvider>
      </body>
    </html>
  );
}

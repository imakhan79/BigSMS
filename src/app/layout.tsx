import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Serif display face for page titles and marketing headings: academic, not template-generic.
const display = Source_Serif_4({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"], display: "swap" });

const description = "School management system with admin, principal, professor, student and parent portals.";

export const metadata: Metadata = {
  // Absolute base for preview images; Vercel provides the production domain at build time.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://bigsms-seven.vercel.app",
  ),
  title: { default: "Big SMS | Zicon", template: "%s · Big SMS" },
  description,
  applicationName: "Big SMS",
  // Link previews (WhatsApp, Slack, email, social) show the Zicon logo.
  openGraph: {
    type: "website",
    siteName: "Big SMS by Zicon",
    title: "Big SMS | Zicon",
    description,
    images: [{ url: "/zicon-logo.png", width: 391, height: 228, alt: "Zicon — Stand Out From The Crowd" }],
  },
  twitter: { card: "summary", title: "Big SMS | Zicon", description, images: ["/zicon-logo.png"] },
};

export const viewport = { themeColor: "#7A271D" };

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${display.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

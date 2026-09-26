import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";

/** Self-hosted at build time by next/font; no request goes to Google at runtime. */
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

/** Put on the `.auditor` wrapper so the CSS variables resolve. */
export const auditorFonts = `${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`;

import { Bricolage_Grotesque, IBM_Plex_Mono, Schibsted_Grotesk } from "next/font/google";

/// Headings and the big rupee figures. The width axis lets large amounts sit
/// tight without turning into a condensed face at small sizes.
const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "wdth"],
});

/// Body and UI. Chosen over the usual grotesques for its unambiguous 1/7 and
/// even colour at the small sizes this app lives at on a phone.
const sans = Schibsted_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

/// Serial data only — receipt numbers, meter readings, unit counts. Things you
/// read digit by digit rather than as a word.
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

export const fontVariables = `${display.variable} ${sans.variable} ${mono.variable}`;

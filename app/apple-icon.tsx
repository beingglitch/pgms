import { generatePgIcon } from "@/lib/generate-pg-icon";

export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function Icon() {
  return generatePgIcon(180);
}

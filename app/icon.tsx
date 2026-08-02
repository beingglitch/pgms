import { generatePgIcon } from "@/lib/generate-pg-icon";

export const dynamic = "force-dynamic";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default async function Icon() {
  return generatePgIcon(512);
}

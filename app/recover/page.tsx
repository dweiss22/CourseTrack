import type { Metadata } from "next";
import { RecoverForm } from "@/components/auth/recover-form";

export const metadata: Metadata = { title: "Reset password" };

export default function RecoverPage() {
  return <RecoverForm />;
}

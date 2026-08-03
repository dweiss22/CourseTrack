import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { createSupabaseServerClient } from "@/lib/supabase-ssr";

export const metadata: Metadata = { title: "Set password" };

export default async function UpdatePasswordPage() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/recover");
  }
  return <UpdatePasswordForm />;
}

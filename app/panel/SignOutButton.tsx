"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function SignOutButton({ email }: { email: string }) {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/");
        router.refresh();
      }}
      className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
      title={email}
    >
      {email} · Salir
    </button>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import ResetClient from "./ResetClient";

export const metadata: Metadata = {
  title: "Nueva contraseña",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetClient />
    </Suspense>
  );
}

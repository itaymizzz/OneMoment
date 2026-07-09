"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

// Cliente de autenticación para componentes "use client" (login, panel).
// baseURL vacío = mismo origen (/api/auth/*).
export const authClient = createAuthClient({
  plugins: [magicLinkClient()],
});

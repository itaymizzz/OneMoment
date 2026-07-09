import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Todos los endpoints de autenticación (login, magic link, reset, sesión…)
// los sirve better-auth bajo /api/auth/*. Rate limiting integrado.
export const { GET, POST } = toNextJsHandler(auth.handler);

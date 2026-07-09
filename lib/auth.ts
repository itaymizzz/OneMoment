import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { prisma } from "./db";
import { baseUrl } from "./base-url";
import { sendEmail, magicLinkEmail, resetPasswordEmail } from "./email";

// ───────────────────────────────────────────────────────────────────────────
// Autenticación de ORGANIZADORES (better-auth: nada de cripto casera).
//   • Magic link por email = camino principal (sin contraseña que olvidar).
//   • Email + contraseña = alternativa clásica, con reset por email.
//   • Sesiones de 90 días, válidas en cualquier dispositivo.
// Los INVITADOS no pasan por aquí: usan su token invisible por evento
// (Guest.token), sin cuentas ni contraseñas.
//
// El acceso por owner-token (?k=…) sigue funcionando como respaldo para los
// eventos ya creados — ver lib/owner.ts.
// ───────────────────────────────────────────────────────────────────────────

export const auth = betterAuth({
  baseURL: baseUrl(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "sqlite" }),
  session: {
    expiresIn: 60 * 60 * 24 * 90, // 90 días
    updateAge: 60 * 60 * 24, // se renueva sola al usarla
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({ to: user.email, ...resetPasswordEmail(url) });
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15, // 15 min de validez del enlace
      // Rate limit del plugin: 5 envíos/min por defecto (anti-abuso).
      sendMagicLink: async ({ email, url }) => {
        // Si este email acaba de crear un evento aún sin cuenta, el correo del
        // enlace mágico ES el correo de bienvenida: incluye el nombre del
        // evento y el enlace directo al panel (owner-token) como respaldo.
        const pendingEvent = await prisma.event.findFirst({
          where: { ownerEmail: email, userId: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, ownerToken: true },
        });
        const fallbackUrl = pendingEvent?.ownerToken
          ? `${baseUrl()}/e/${pendingEvent.id}?k=${pendingEvent.ownerToken}`
          : null;
        await sendEmail({
          to: email,
          ...magicLinkEmail(url, pendingEvent?.name ?? null, fallbackUrl),
        });
      },
    }),
  ],
  // Rate limiting integrado de better-auth (activo en producción): ventana
  // global + reglas más estrictas en los endpoints sensibles (login, signup).
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
  },
});

export type Session = typeof auth.$Infer.Session;

// Notificaciones por email vía Resend (https://resend.com), sin SDK: un fetch.
// Se activa sólo si hay RESEND_API_KEY; sin clave, no-op silencioso — el email
// es un aviso de cortesía, nunca puede romper el flujo que lo dispara.
//
// Remitente: RESEND_FROM (p.ej. "OneMoment <avisos@onemoment.app>"). Mientras
// no haya dominio verificado en Resend, el sandbox "onboarding@resend.dev"
// sólo entrega al propio dueño de la cuenta — suficiente para la beta.

const FROM = process.env.RESEND_FROM || "OneMoment <onboarding@resend.dev>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      console.warn("[email] Resend respondió", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[email] fallo al enviar:", (e as Error).message);
    return false;
  }
}

const wrap = (inner: string) => `
  <div style="font-family:Georgia,serif;background:#0b0a08;color:#f5f5f7;padding:40px 24px;text-align:center">
    <p style="letter-spacing:6px;font-size:12px;color:#e8b04b;text-transform:uppercase;margin:0">OneMoment</p>
    ${inner}
    <p style="margin-top:36px;font-size:12px;color:#8a8578">Una película hecha por todos</p>
  </div>`;

const FORMAT_ES: Record<string, string> = {
  reel: "reel",
  trailer: "tráiler",
  film: "película",
};

// "Tu película está lista" — con el enlace privado del panel para verla.
export function reelReadyEmail(eventName: string, format: string, panelUrl: string) {
  const f = FORMAT_ES[format] ?? "video";
  return {
    subject: `🎬 Tu ${f} de "${eventName}" está lista`,
    html: wrap(`
      <h1 style="font-weight:300;font-size:28px;margin:24px 0 8px">Tu ${f} está lista</h1>
      <p style="color:#c9c4b8;font-size:15px;line-height:1.6">La IA terminó de montar el ${f} de <strong>${eventName}</strong> con lo mejor que subieron tus invitados.</p>
      <a href="${panelUrl}" style="display:inline-block;margin-top:20px;background:#e8b04b;color:#0b0a08;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px">Verla y descargarla</a>`),
  };
}

// Enlace mágico de acceso. Si viene de crear un evento, hace también de correo
// de bienvenida (nombre del evento + enlace directo de respaldo al panel).
export function magicLinkEmail(
  url: string,
  eventName: string | null,
  fallbackUrl: string | null,
) {
  return {
    subject: eventName
      ? `Tu evento "${eventName}" está listo — entra a tu panel`
      : "Tu enlace de acceso a OneMoment",
    html: wrap(`
      <h1 style="font-weight:300;font-size:28px;margin:24px 0 8px">${
        eventName ? "Tu evento está creado" : "Entra a OneMoment"
      }</h1>
      ${
        eventName
          ? `<p style="color:#c9c4b8;font-size:15px;line-height:1.6"><strong>${eventName}</strong> ya tiene su QR y su galería. Entra con un clic — sin contraseña:</p>`
          : `<p style="color:#c9c4b8;font-size:15px;line-height:1.6">Toca el botón para entrar. El enlace vale 15 minutos y se usa una sola vez.</p>`
      }
      <a href="${url}" style="display:inline-block;margin-top:20px;background:#e8b04b;color:#0b0a08;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px">Entrar a mi panel</a>
      ${
        fallbackUrl
          ? `<p style="margin-top:28px;font-size:13px;color:#8a8578">¿El enlace caducó? Guarda este acceso directo permanente a tu evento:<br/><a href="${fallbackUrl}" style="color:#e8b04b;word-break:break-all">${fallbackUrl}</a></p>`
          : ""
      }`),
  };
}

// Restablecer contraseña (para quien eligió el camino clásico).
export function resetPasswordEmail(url: string) {
  return {
    subject: "Restablece tu contraseña de OneMoment",
    html: wrap(`
      <h1 style="font-weight:300;font-size:28px;margin:24px 0 8px">¿Nueva contraseña?</h1>
      <p style="color:#c9c4b8;font-size:15px;line-height:1.6">Toca el botón para elegir una contraseña nueva. Si no lo pediste tú, ignora este correo — tu cuenta sigue segura.</p>
      <a href="${url}" style="display:inline-block;margin-top:20px;background:#e8b04b;color:#0b0a08;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px">Elegir contraseña nueva</a>`),
  };
}

// Aviso amable de fallo, con enlace para reintentar desde el panel.
export function reelFailedEmail(eventName: string, format: string, panelUrl: string) {
  const f = FORMAT_ES[format] ?? "video";
  return {
    subject: `El ${f} de "${eventName}" necesita otro intento`,
    html: wrap(`
      <h1 style="font-weight:300;font-size:28px;margin:24px 0 8px">Casi…</h1>
      <p style="color:#c9c4b8;font-size:15px;line-height:1.6">El montaje del ${f} de <strong>${eventName}</strong> falló a mitad (suele ser un pico de memoria del servidor). Tus fotos y videos están a salvo: no se perdió nada.</p>
      <a href="${panelUrl}" style="display:inline-block;margin-top:20px;background:#e8b04b;color:#0b0a08;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px">Reintentar desde el panel</a>`),
  };
}

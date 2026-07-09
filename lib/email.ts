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

// Plantilla "La Première" en versión email-safe: estilos inline, serif del
// sistema (Georgia ≈ la voz display), mono para los metadatos, oro antiguo
// como único acento. Sin webfonts ni imágenes: llega igual a Gmail y Outlook.
const wrap = (inner: string) => `
  <div style="background:#0b0a08;padding:36px 16px;text-align:center">
    <div style="max-width:520px;margin:0 auto;background:#14120e;border:1px solid #262219;border-radius:6px;padding:40px 28px;font-family:Georgia,'Times New Roman',serif;color:#f2ede3">
      <p style="font-family:'Courier New',monospace;letter-spacing:5px;font-size:11px;color:#9c948a;text-transform:uppercase;margin:0">OneMoment presenta</p>
      ${inner}
    </div>
    <p style="font-family:'Courier New',monospace;letter-spacing:3px;font-size:10px;color:#9c948a;text-transform:uppercase;margin-top:24px">Una película hecha por todos</p>
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
      <h1 style="font-weight:400;font-size:30px;margin:24px 0 8px">Tu ${f} está lista</h1>
      <p style="color:#9c948a;font-size:15px;line-height:1.6">La IA terminó de montar el ${f} de <strong>${eventName}</strong> con lo mejor que subieron tus invitados.</p>
      <a href="${panelUrl}" style="display:inline-block;margin-top:20px;background:#c6a15b;color:#16120a;text-decoration:none;font-weight:600;padding:13px 30px;border-radius:4px">Verla y descargarla</a>`),
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
      <h1 style="font-weight:400;font-size:30px;margin:24px 0 8px">${
        eventName ? "Tu evento está creado" : "Entra a OneMoment"
      }</h1>
      ${
        eventName
          ? `<p style="color:#9c948a;font-size:15px;line-height:1.6"><strong>${eventName}</strong> ya tiene su QR y su galería. Entra con un clic — sin contraseña:</p>`
          : `<p style="color:#9c948a;font-size:15px;line-height:1.6">Toca el botón para entrar. El enlace vale 15 minutos y se usa una sola vez.</p>`
      }
      <a href="${url}" style="display:inline-block;margin-top:20px;background:#c6a15b;color:#16120a;text-decoration:none;font-weight:600;padding:13px 30px;border-radius:4px">Entrar a mi panel</a>
      ${
        fallbackUrl
          ? `<p style="margin-top:28px;font-size:13px;color:#9c948a">¿El enlace caducó? Guarda este acceso directo permanente a tu evento:<br/><a href="${fallbackUrl}" style="color:#c6a15b;word-break:break-all">${fallbackUrl}</a></p>`
          : ""
      }`),
  };
}

// Restablecer contraseña (para quien eligió el camino clásico).
export function resetPasswordEmail(url: string) {
  return {
    subject: "Restablece tu contraseña de OneMoment",
    html: wrap(`
      <h1 style="font-weight:400;font-size:30px;margin:24px 0 8px">¿Nueva contraseña?</h1>
      <p style="color:#9c948a;font-size:15px;line-height:1.6">Toca el botón para elegir una contraseña nueva. Si no lo pediste tú, ignora este correo — tu cuenta sigue segura.</p>
      <a href="${url}" style="display:inline-block;margin-top:20px;background:#c6a15b;color:#16120a;text-decoration:none;font-weight:600;padding:13px 30px;border-radius:4px">Elegir contraseña nueva</a>`),
  };
}

// Recibo de compra de paquete (o upgrade — se cobra la diferencia).
export function receiptEmail(
  eventName: string,
  uploads: number,
  chargedCents: number,
  panelUrl: string,
) {
  const amount = (chargedCents / 100).toFixed(2);
  return {
    subject: `Recibo — ${uploads} fotos para "${eventName}"`,
    html: wrap(`
      <h1 style="font-weight:400;font-size:30px;margin:24px 0 8px">¡Listo! Tu evento creció</h1>
      <p style="color:#9c948a;font-size:15px;line-height:1.6"><strong>${eventName}</strong> ahora incluye hasta <strong>${uploads.toLocaleString("es")}</strong> fotos y videos — con todo: reel, tráiler y película sin marca, muro en vivo, galería 12 meses y descarga completa.</p>
      <p style="font-family:'Courier New',monospace;font-size:14px;letter-spacing:1px;color:#f2ede3;margin-top:18px">TOTAL COBRADO&nbsp;&nbsp;US$ ${amount}</p>
      <a href="${panelUrl}" style="display:inline-block;margin-top:20px;background:#c6a15b;color:#16120a;text-decoration:none;font-weight:600;padding:13px 30px;border-radius:4px">Ir a mi panel</a>`),
  };
}

// Aviso amable de fallo, con enlace para reintentar desde el panel.
export function reelFailedEmail(eventName: string, format: string, panelUrl: string) {
  const f = FORMAT_ES[format] ?? "video";
  return {
    subject: `El ${f} de "${eventName}" necesita otro intento`,
    html: wrap(`
      <h1 style="font-weight:400;font-size:30px;margin:24px 0 8px">Casi…</h1>
      <p style="color:#9c948a;font-size:15px;line-height:1.6">El montaje del ${f} de <strong>${eventName}</strong> falló a mitad (suele ser un pico de memoria del servidor). Tus fotos y videos están a salvo: no se perdió nada.</p>
      <a href="${panelUrl}" style="display:inline-block;margin-top:20px;background:#c6a15b;color:#16120a;text-decoration:none;font-weight:600;padding:13px 30px;border-radius:4px">Reintentar desde el panel</a>`),
  };
}

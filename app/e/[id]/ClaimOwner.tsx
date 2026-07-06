"use client";

import { useEffect } from "react";

// Cuando el dueño abre el panel con su enlace privado (?k=<token>) en un
// dispositivo nuevo, canjeamos el token por la cookie httpOnly y limpiamos la
// URL para no dejar el secreto a la vista ni en el historial.
export default function ClaimOwner({
  eventId,
  token,
}: {
  eventId: string;
  token: string;
}) {
  useEffect(() => {
    fetch(`/api/events/${eventId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .catch(() => {})
      .finally(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.has("k")) {
          url.searchParams.delete("k");
          window.history.replaceState({}, "", url.toString());
        }
      });
  }, [eventId, token]);

  return null;
}

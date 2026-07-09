"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, PrinterIcon } from "@/app/components/icons";

// Pestañas del panel del evento: Resumen (galería + QR + estudio) y el nuevo
// Cartel para imprimir. Resalta la activa según la ruta.
export default function EventTabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const base = `/e/${eventId}`;
  const tabs = [
    { href: base, label: "Resumen", Icon: HomeIcon, exact: true },
    { href: `${base}/display`, label: "Cartel para imprimir", Icon: PrinterIcon },
  ];

  return (
    <nav className="mt-6 flex gap-1 border-b border-hairline">
      {tabs.map(({ href, label, Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
              active
                ? "border-accent text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            <Icon width={16} height={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

# Copias de seguridad y restauración

## Qué se respalda

Cada noche (~03:15, hora del servidor) la app genera
`onemoment-backup-<fecha>.zip` con:

- **`db.sqlite`** — snapshot consistente de TODA la base (eventos, cuentas,
  invitados, metadatos de fotos/reels), hecho con `VACUUM INTO` (seguro aunque
  la app esté escribiendo).
- **`media-manifest.json`** — inventario de todos los archivos de medios del
  volumen (ruta, tamaño, fecha). Los binarios de fotos/videos NO se copian
  (pesan GBs); el manifiesto dice exactamente qué existía.

Retención: **14 días** (`BACKUP_RETENTION_DAYS` para cambiarla). El último
resultado queda en `STORAGE_ROOT/last-backup.json`.

## Configurar el destino (una vez)

**Cloudflare R2 (recomendado, tier gratis de 10 GB):**

1. dash.cloudflare.com → R2 → *Create bucket* → nombre `onemoment-backups`.
2. R2 → *Manage API Tokens* → *Create API Token* → permiso **Object Read &
   Write** limitado a ese bucket. Copia Access Key ID y Secret.
3. ```
   railway variables --set "R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com" \
     --set "R2_ACCESS_KEY_ID=..." --set "R2_SECRET_ACCESS_KEY=..." \
     --set "R2_BUCKET=onemoment-backups" --set "ADMIN_KEY=<algo-largo-aleatorio>"
   ```
4. Verifica con un backup manual:
   `curl -X POST -H "x-admin-key: $ADMIN_KEY" https://<app>/api/admin/backup`
   → responde `{name, zipBytes, mediaFiles, ...}` y el zip aparece en el bucket
   bajo `backups/`.

(Para pruebas locales sirve `BACKUP_DIR=/ruta/carpeta` en lugar de R2.)

## Restaurar la base de datos

Escenario: el volumen se corrompió / se borró algo / Railway perdió el disco.

1. **Descarga el backup** más reciente del bucket R2 (`backups/…zip`) y
   descomprímelo → tienes `db.sqlite` y `media-manifest.json`.
2. **Pausa la app** (Railway → service → *Remove deployment*, o simplemente
   acepta unos segundos de inconsistencia).
3. **Sube la base al volumen.** La ruta de la base viva es la de
   `DATABASE_URL` (hoy: dentro del volumen `/data`). Con el servicio corriendo:
   ```bash
   # empaqueta la db en base64 y súbela vía railway ssh
   base64 -w0 db.sqlite > db.b64
   railway ssh "cat > /tmp/db.b64" < db.b64
   railway ssh "base64 -d /tmp/db.b64 > /tmp/db.sqlite && \
     cp \$(echo \$DATABASE_URL | sed 's|file:||') /tmp/db-anterior.sqlite && \
     cp /tmp/db.sqlite \$(echo \$DATABASE_URL | sed 's|file:||')"
   ```
   (Se guarda la base anterior en `/tmp/db-anterior.sqlite` por si acaso.)
4. **Redeploy / restart** el servicio. Verifica que el panel lista los eventos.
5. **Medios:** si el volumen sobrevivió, no hay nada más que hacer (la base
   apunta a los mismos archivos). Si se perdieron medios,
   `media-manifest.json` es la lista exacta de lo que había — sirve para
   avisar a los organizadores afectados y para reclamar los archivos que los
   invitados aún tengan en sus teléfonos ("mis fotos" re-sube… no: los
   invitados pueden volver a subir; el manifiesto identifica los eventos y
   volúmenes afectados).

## Probar el ciclo (ya validado el 9 jul 2026)

`npx tsx scripts/test-backup-cycle.ts` ejecuta: backup real → restaura el
`db.sqlite` del zip en una ruta temporal → abre la copia y compara conteos de
filas (eventos, usuarios, medios) contra la base viva → falla si difieren.

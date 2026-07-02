# Biblioteca de música

Suelta aquí las canciones (hechas en Suno Premier, licenciadas, etc.) y la app
las usará automáticamente — **sin tocar código**. `lib/music.ts` escanea esta
carpeta en cada render y arma el catálogo.

## Convención de nombre

```
<energy>-<bpm>[-etiqueta].<ext>
```

- **energy**: `calm` | `warm` | `upbeat`
  - `calm`  → Película (10 min)
  - `warm`  → Tráiler (3 min)
  - `upbeat`→ Reel (30s)
- **bpm**: el BPM **real** del track (número). Pon el que de verdad tenga la
  canción para que el corte al beat encaje. Si no lo sabes, mídelo en
  https://tunebat.com o similar.
- **etiqueta** (opcional): texto libre con guiones, solo para distinguir varias
  del mismo tipo. Se muestra como título.
- **ext**: `mp3` | `wav` | `m4a` | `ogg`

### Ejemplos

```
upbeat-128.mp3
upbeat-124-neon.mp3
warm-108-brindis.mp3
calm-84-primer-baile.wav
```

## Cómo se eligen

Cada evento recibe **una canción distinta** dentro de su energía (rotación
determinista por evento): dos bodas suenan diferente, pero el mismo evento
siempre mantiene su canción. Cuantas más subas, más variedad.

## Consejos para Suno

- Pide **"instrumental, no vocals"** en el prompt.
- Incluye el **BPM** en el prompt y ponlo también en el nombre del archivo.
- Que duren de sobra: reel ≥ 40s · tráiler ≥ 3min · película ≥ 4min (si no, se
  repite en bucle).

## Notas

- `calm-90.wav`, `warm-110.wav`, `upbeat-128.wav` son **beds sintetizados de
  reserva**. Se usan solo si la carpeta no tiene otras pistas válidas.
- `generated/` contiene las canciones únicas por evento creadas por IA
  (sunoapi.org / ElevenLabs) cuando hay clave. No la toques a mano.

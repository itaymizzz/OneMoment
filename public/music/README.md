# Biblioteca de música (licenciada)

Suelta aquí pistas **con licencia** (Artlist, Epidemic Sound, CC BY…) y la app
las usa automáticamente — sin tocar código. Nada de música generada por IA:
editamos momentos reales, no generamos contenido.

## Convención de nombre

```
<vibe>-<bpm>[-etiqueta].<ext>
```

- `vibe` ∈ `romantico` | `fiesta` | `cinematico` | `elegante`
- `bpm` = BPM real de la pista (el script lo verifica)
- `ext` ∈ mp3 | wav | m4a | ogg

Ejemplos: `romantico-81-heartwarming.mp3` · `fiesta-96-carefree.mp3`

## Al añadir pistas

1. Nombra el archivo con la convención y cópialo aquí.
2. Corre `npx tsx scripts/analyze-tracks.ts` — precomputa los beats en
   `beats/<id>.json` (los renders leen ese JSON, no analizan audio).
3. Registra la licencia en `LICENSES.md`.
4. Commit de los tres (mp3 + json + licencia).

El organizador elige el vibe (o la pista) en el panel del evento; si no elige,
la app auto-elige: reel→fiesta, tráiler→cinemático, película→romántico.

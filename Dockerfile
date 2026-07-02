# OneMoment — imagen para Railway (contenedor con Chrome headless para Remotion).
FROM node:22-bookworm-slim

# Dependencias de sistema que necesita el Chrome headless de Remotion + fuentes.
# Incluimos `ffmpeg` (build completo de Debian, CON el filtro lut3d) para que la
# gradación de color "de cine" (GRADE_LUT) funcione en producción. El ffmpeg que
# trae Remotion es mínimo y no tiene lut3d; grade.ts detecta el del sistema.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation fonts-noto-color-emoji ffmpeg \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 libgtk-3-0 \
    libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 libxkbcommon0 libdrm2 \
    wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala dependencias (incluye dev: se necesitan para `next build`).
COPY package*.json ./
RUN npm ci

# Copia el resto y construye.
COPY . .
RUN npx prisma generate \
 && (npx remotion browser ensure || true) \
 && npm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "docker-entrypoint.sh"]

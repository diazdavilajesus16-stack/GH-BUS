# Frontend GH BUS: compilación con Node y servicio con nginx (que además actúa de puerta de entrada)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# En Docker todo se sirve por el mismo origen: la API en /api y Socket.IO en el mismo host.
ARG VITE_API_URL=/api
ARG VITE_REALTIME_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_REALTIME_URL=$VITE_REALTIME_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

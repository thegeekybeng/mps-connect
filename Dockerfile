FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

ARG VITE_OLLAMA_HOST
ARG VITE_OLLAMA_MODEL
ARG VITE_SPEECH_HOST
ARG VITE_STAFF_ACCESS_CODE
ENV VITE_OLLAMA_HOST=$VITE_OLLAMA_HOST
ENV VITE_OLLAMA_MODEL=$VITE_OLLAMA_MODEL
ENV VITE_SPEECH_HOST=$VITE_SPEECH_HOST
ENV VITE_STAFF_ACCESS_CODE=$VITE_STAFF_ACCESS_CODE

RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache curl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Build stage
FROM docker.io/node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN node -e "process.stdout.write(require('./package.json').version)" > /version.txt

FROM docker.io/nginx:alpine

COPY nginx.conf /etc/nginx/nginx.conf.tpl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY --from=builder /version.txt /version.txt

EXPOSE 80 443

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/index.html || exit 1

CMD sh -c "export APP_VERSION=\$(cat /version.txt) && envsubst '\${APP_VERSION}' < /etc/nginx/nginx.conf.tpl > /etc/nginx/nginx.conf && nginx -g 'daemon off;'"

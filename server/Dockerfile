FROM docker.io/node:22-alpine

WORKDIR /app

# Install system dependencies (sharp needs cairo/jpeg/pango/giflib)
RUN apk add --no-cache cairo-dev jpeg-dev pango-dev giflib-dev python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application
COPY src ./src

# Create upload directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 3000

# PostgreSQL connection string (override in systemd unit / compose file)
ENV DATABASE_URL=postgresql://pawvax:pawvax@localhost:5432/pawvax
ENV UPLOADS_DIR=/app/uploads

# Health check endpoint needs to be added to your app
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "src/app.js"]

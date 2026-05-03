FROM docker.io/node:22-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev giflib-dev

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy application
COPY src ./src

# Create data directories
RUN mkdir -p /app/data /app/uploads

# Expose port
EXPOSE 3000

# Health check endpoint needs to be added to your app
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start application
CMD ["node", "src/app.js"]

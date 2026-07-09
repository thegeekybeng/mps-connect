FROM node:24-alpine
WORKDIR /app

# better-sqlite3 is a native addon — requires build tools at npm install time.
# They are removed after install to keep the final image lean.
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Remove build tools — no longer needed at runtime
RUN apk del .build-deps

# Copy all source files — audit.js, db.js and queue.js are required by server.js
COPY *.js ./

# Non-root user
RUN addgroup -S aiproxy && adduser -S aiproxy -G aiproxy

# Create audit DB directory owned by aiproxy before dropping privileges.
# Docker copies container dir ownership into a new named volume on first mount,
# so audit-data:/data will be writable by the aiproxy user.
RUN mkdir -p /data && chown aiproxy:aiproxy /data

USER aiproxy
EXPOSE 3103
CMD ["node", "server.js"]

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --no-audit
COPY . .
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data/uploads && chown -R app:app /data /app
USER app
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "src/server.js"]

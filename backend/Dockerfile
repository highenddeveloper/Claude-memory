FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
			npm ci --omit=dev; \
		else \
			npm install --omit=dev --no-audit --no-fund; \
		fi

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]

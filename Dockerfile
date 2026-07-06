FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@11.9.0 && pnpm install --no-frozen-lockfile --ignore-scripts

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "NODE_ENV=production node dist/server.cjs"]

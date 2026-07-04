FROM node:22-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["node", "dist/server.cjs"]

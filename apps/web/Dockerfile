FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY components.json tsconfig.json vite.config.ts ./
COPY src ./src

EXPOSE 3000

CMD ["npm", "run", "dev"]

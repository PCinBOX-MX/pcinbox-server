FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Generate prisma client if needed
RUN if grep -q "prisma" package.json; then npx prisma generate; fi

ARG BUILD_CMD="build"
RUN npm run $BUILD_CMD

EXPOSE 3000 3001 3002 3004 8000 9000

CMD ["npm", "start"]

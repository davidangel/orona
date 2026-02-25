FROM node:18-alpine

WORKDIR /app

RUN apk add --no-cache bash

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

RUN chmod +x docker-entrypoint.sh

EXPOSE 8124

ENTRYPOINT ["./docker-entrypoint.sh"]

FROM node:20-alpine

RUN apk add --no-cache imagemagick

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5050

CMD ["npm", "start"]
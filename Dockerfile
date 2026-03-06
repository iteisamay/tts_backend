FROM node:20

RUN apt-get update && \
    apt-get install -y \
    imagemagick \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5050

CMD ["npm", "start"]
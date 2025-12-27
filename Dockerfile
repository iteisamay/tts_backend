# ---------- 1. Base image ----------
FROM node:20-alpine AS base

# ---------- 2. Working directory ----------
WORKDIR /usr/src/app

# ---------- 3. Copy package files ----------
COPY package*.json ./

# ---------- 4. Install dependencies ----------
RUN npm install --only=production

# ---------- 5. Copy source code ----------
COPY . .


# ---------- 6. Expose app port ----------
EXPOSE 5000

# ---------- 7. Start command ----------
CMD ["npm", "start"]

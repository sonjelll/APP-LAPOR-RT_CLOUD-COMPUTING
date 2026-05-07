# Gunakan base image Node.js yang ringan
FROM node:18-alpine

# Set working directory di dalam container
WORKDIR /usr/src/app

# Copy package.json dan install dependencies
COPY package*.json ./
RUN npm install

# Copy seluruh source code
COPY . .

# Ekspos port 80 (standar HTTP untuk ALB/ECS)
EXPOSE 80

# Jalankan aplikasi
CMD ["node", "app.js"]
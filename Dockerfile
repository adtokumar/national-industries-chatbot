FROM node:20-alpine

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Copy all application files
COPY . .

# Expose server port (defaults to 3000)
EXPOSE 3000
ENV PORT=3000

# Start server
CMD ["node", "server.js"]


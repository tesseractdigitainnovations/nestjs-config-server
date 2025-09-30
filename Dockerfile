# BaseLine image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN pnpm install --production

# Copy application files
COPY . .
# Build the application

RUN pnpm run build

# Expose the port the app runs on
EXPOSE 3333

# Start the application
CMD ["node", "dist/main.js"]
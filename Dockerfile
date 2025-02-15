# Use Node.js as the base image
FROM node:22

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package.json package-lock.json ./

# Install dependencies
RUN yarn install --production

# Copy the rest of the application files
COPY . .

# Expose the correct port
EXPOSE 5000

# Start the application
CMD ["node", "server.js"]

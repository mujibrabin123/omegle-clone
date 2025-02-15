# Use an official Node.js runtime as the base image
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the server package.json and package-lock.json files
COPY server/package*.json ./server/

# Install server dependencies
RUN npm install --prefix server

# Copy the rest of the server code
COPY server/ ./server/

# Copy the client files
COPY client/ ./client/

# Build the client
WORKDIR /usr/src/app/client
RUN npm install && npm run build

# Expose the port the app will run on
EXPOSE 3000

# Define the environment variable for production
ENV NODE_ENV=production

# Set the working directory to the server and start the server
WORKDIR /usr/src/app/server
CMD ["node", "server.js"]

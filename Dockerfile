# Use an official Node.js runtime as the base image
FROM node:16

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files
COPY server/package*.json ./

# Install the dependencies
RUN npm install

# Copy the rest of the application code
COPY server/ .

# Expose the port the app will run on
EXPOSE 3000

# Define the environment variable for production
ENV NODE_ENV=production

# Start the server
CMD ["node", "server.js"]

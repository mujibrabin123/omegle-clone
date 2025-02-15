# Use an official Node.js runtime as the base image with the desired version
FROM node:22

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json and package-lock.json files from your server folder to the working directory
COPY server/package*.json ./

# Install the dependencies listed in package.json
RUN npm install

# Copy the rest of the application code from your server folder to the container
COPY server/ .

# Expose the port the app will run on
EXPOSE 3000

# Define the environment variable for production
ENV NODE_ENV=production

# Start the server using the main entry file
CMD ["node", "server.js"]

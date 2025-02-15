# Use an official Node.js runtime as the base image (Node.js 22)
FROM node:22

# Set the working directory inside the container
WORKDIR /app

# Install Yarn (if not already included)
RUN npm install -g yarn

# Copy the package.json and yarn.lock files
COPY server/package*.json ./ 
COPY server/yarn.lock ./

# Install dependencies with Yarn
RUN yarn install

# Copy the rest of the application code
COPY server/ ./

# Expose the port the app will run on
EXPOSE 3000

# Define the environment variable for production
ENV NODE_ENV=production

# Start the server
CMD ["node", "server.js"]

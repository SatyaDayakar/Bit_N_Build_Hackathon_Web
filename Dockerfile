# Use an official Node.js runtime as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the application code to the container
COPY . .

# Expose the port your app runs on (e.g., 3000)
EXPOSE 3000

# Set the environment variable for production (optional)
ENV NODE_ENV=production

# Command to run the application
CMD ["node", "server.js"]

# Use the official Node.js runtime as the base image
FROM node:20

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# Install only production dependencies (ignores devDependencies like nodemon)
RUN npm install --only=production

# Copy the entire application code to the container
COPY . .

# Expose the port your app listens on (default 3000 for Express)
EXPOSE 3000

# Set the environment variable to production
ENV NODE_ENV=production

# Command to run the application
CMD ["npm", "start"]

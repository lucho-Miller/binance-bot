FROM node:18-alpine

# Add node user for security
USER node

# Create app directory and set ownership
WORKDIR /home/node/app

# Copy dependency files with correct ownership
COPY --chown=node:node package*.json ./

# Install dependencies
RUN npm install

# Copy source code with correct ownership
COPY --chown=node:node . .

# Command to run the application
CMD ["node", "index.js"]

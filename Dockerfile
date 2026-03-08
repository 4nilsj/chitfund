FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Bundle app source
COPY . .

# Create directory for SQLite DB
RUN mkdir -p data

# Expose port
EXPOSE 3000

# Start command
CMD [ "npm", "start" ]

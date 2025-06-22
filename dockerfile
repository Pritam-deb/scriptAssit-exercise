FROM oven/bun:latest
# Set working directory
WORKDIR /usr/src/app

# Copy only package files first for better caching
COPY bun.lock bun.lock
COPY bunfig.toml bunfig.toml
COPY package.json package.json

# Install dependencies
RUN bun install

# Copy the rest of the project
COPY . .

# Expose port
EXPOSE 3000

# Start the dev server
CMD ["bun", "run", "start:dev"]
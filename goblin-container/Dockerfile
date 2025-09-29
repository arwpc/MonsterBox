# Multi-arch Dockerfile for MonsterBox Goblin
# Supports both ARM64 (Pi 4) and ARMv7 (Pi 3B+)
FROM node:18-slim

# Install system dependencies for media playback
RUN apt-get update && apt-get install -y \
    vlc \
    alsa-utils \
    pulseaudio \
    ffmpeg \
    omxplayer \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install --only=production

# Copy application source
COPY src/ ./src/
COPY media/ ./media/

# Create required directories
RUN mkdir -p /app/logs /app/config

# Create non-root user for security
RUN groupadd -r goblin && useradd -r -g goblin goblin
RUN chown -R goblin:goblin /app
USER goblin

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Start the Goblin service
CMD ["npm", "start"]
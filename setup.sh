#!/bin/bash

echo "🗓️  ADE Calendar Exporter - Setup Script"
echo "=========================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env file from template..."
    cp .env.example .env
    echo ""
    echo "📝 Please edit the .env file with your ADE credentials:"
    echo "   nano .env"
    echo ""
    read -p "Press Enter after you've configured .env..."
fi

# Create export directory if it doesn't exist
if [ ! -d export ]; then
    mkdir -p export
    echo "✅ Created export directory"
fi

# Build and start containers
echo ""
echo "🐳 Building Docker images..."
docker compose build

echo ""
echo "🚀 Starting services..."
docker compose up -d

echo ""
echo "✅ Setup complete!"
echo ""
echo "📊 Dashboard: http://localhost:6845"
echo "📋 Calendar URLs: http://localhost:6845/calendars/"
echo ""
echo "📝 Useful commands:"
echo "   View logs:         docker compose logs -f"
echo "   Stop services:     docker compose down"
echo "   Restart services:  docker compose restart"
echo "   Manual export:     docker compose exec exporter bun run src/index.ts"
echo ""
echo "💡 For public access, set up Cloudflare Tunnel:"
echo "   cloudflared tunnel --url http://localhost:6845"

#!/bin/bash

# Audio Scrapper Deployment Script
echo "🚀 Starting Audio Scrapper Deployment..."

# Create necessary directories
mkdir -p logs
mkdir -p downloads

# Install dependencies
echo "📦 Installing dependencies..."
cd BACKEND
npm install
npx puppeteer browsers install chrome

# Install PM2 globally if not installed
if ! command -v pm2 &> /dev/null; then
    echo "📥 Installing PM2..."
    npm install -g pm2
fi

# Go back to root directory
cd ..

# Start the application with PM2
echo "🎯 Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 startup (you'll need to run the command it shows)
pm2 startup

echo "✅ Deployment completed!"
echo "🌐 Your app should be running on http://localhost:3000"
echo "📊 Monitor with: pm2 monit"
echo "📝 View logs with: pm2 logs audio-scrapper"

#!/bin/bash

echo "🎬 Video Streaming System - Quick Setup"
echo "========================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo ""

# Setup backend
echo "📦 Setting up backend..."
cd backend
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Created backend .env file"
fi

npm install
if [ $? -ne 0 ]; then
    echo "❌ Backend npm install failed"
    exit 1
fi
echo "✅ Backend dependencies installed"
echo ""

# Setup frontend
echo "📦 Setting up frontend..."
cd ../frontend
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "✅ Created frontend .env file"
fi

npm install
if [ $? -ne 0 ]; then
    echo "❌ Frontend npm install failed"
    exit 1
fi
echo "✅ Frontend dependencies installed"
echo ""

cd ..

echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo ""
echo "1. Start the backend:"
echo "   cd backend && npm start"
echo ""
echo "2. In a new terminal, start the frontend:"
echo "   cd frontend && npm start"
echo ""
echo "3. Open http://localhost:3000 in your browser"
echo ""
echo "Happy streaming! 🎉"

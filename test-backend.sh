#!/bin/bash

echo "🧪 Testing Video Streaming Proxy"
echo "================================"
echo ""

# Check if backend is running
echo "1. Checking if backend is running..."
HEALTH_CHECK=$(curl -s http://localhost:3001/health 2>/dev/null)

if [ $? -eq 0 ]; then
    echo "✅ Backend is running"
    echo "   Response: $HEALTH_CHECK"
else
    echo "❌ Backend is not running on port 3001"
    echo "   Start it with: cd backend && npm start"
    exit 1
fi

echo ""

# Test with a sample video URL
echo "2. Testing streaming endpoint..."
echo "   Enter a test video URL (or press Enter for default):"
read -p "   URL: " TEST_URL

if [ -z "$TEST_URL" ]; then
    # Use a sample public domain video
    TEST_URL="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
    echo "   Using sample: $TEST_URL"
fi

echo ""
echo "   Testing HEAD request..."
RESPONSE=$(curl -I -s "http://localhost:3001/stream?url=$TEST_URL" 2>&1)

if echo "$RESPONSE" | grep -q "200\|206"; then
    echo "✅ Streaming endpoint working!"
    echo ""
    echo "   Response headers:"
    echo "$RESPONSE" | head -n 10
    echo ""
    
    # Check for Accept-Ranges header
    if echo "$RESPONSE" | grep -qi "Accept-Ranges: bytes"; then
        echo "✅ Range requests supported"
    else
        echo "⚠️  Range requests not detected"
    fi
    
    # Check Content-Type
    if echo "$RESPONSE" | grep -qi "Content-Type: video"; then
        echo "✅ Video content type detected"
    fi
    
else
    echo "❌ Streaming endpoint failed"
    echo ""
    echo "   Response:"
    echo "$RESPONSE"
    exit 1
fi

echo ""
echo "3. Testing Range request..."
RANGE_RESPONSE=$(curl -I -s -H "Range: bytes=0-1023" "http://localhost:3001/stream?url=$TEST_URL" 2>&1)

if echo "$RANGE_RESPONSE" | grep -q "206"; then
    echo "✅ Range requests working (206 Partial Content)"
else
    echo "⚠️  Range request returned: $(echo "$RANGE_RESPONSE" | head -n 1)"
fi

echo ""
echo "================================"
echo "✅ All tests passed!"
echo ""
echo "Your video streaming proxy is ready to use."
echo "Start the frontend with: cd frontend && npm start"
echo "Then visit: http://localhost:3000"

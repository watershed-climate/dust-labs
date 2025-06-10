#!/bin/bash

echo "🔍 Debug script for Linear hanging timeouts"
echo "========================================="

# Check current environment settings
echo ""
echo "📋 Current Environment Settings:"
echo "LINEAR_API_TIMEOUT: ${LINEAR_API_TIMEOUT:-'not set (default: 30000)'}"
echo "LINEAR_MAX_CONCURRENT: ${LINEAR_MAX_CONCURRENT:-'not set'}"
echo "LINEAR_API_RETRY_ATTEMPTS: ${LINEAR_API_RETRY_ATTEMPTS:-'not set (default: 3)'}"

# Suggest debug settings
echo ""
echo "🔧 Suggested Debug Settings (add to .env):"
echo "LINEAR_API_TIMEOUT=10000          # 10 second timeout"
echo "LINEAR_MAX_CONCURRENT=1           # Only 1 concurrent request"
echo "LINEAR_API_RETRY_ATTEMPTS=2       # Fewer retries for faster debugging"
echo "LOG_TO_FILE=true                  # Enable file logging"
echo "LOG_FILE=logs/debug-sync.log      # Debug log file"

# Check if we can test connectivity
echo ""
echo "🌐 Testing Linear API connectivity..."
if command -v curl &> /dev/null; then
    echo "Testing basic HTTPS connectivity to Linear..."
    if curl -s -o /dev/null -w "%{http_code}" --max-time 10 "https://api.linear.app/graphql" | grep -q "200\|400\|405"; then
        echo "✅ Basic connectivity to Linear API is working"
    else
        echo "❌ Cannot reach Linear API - network issues detected"
        echo "💡 This might explain the hanging timeouts"
    fi
else
    echo "⚠️  curl not available, cannot test connectivity"
fi

echo ""
echo "🚀 Running with debug settings..."
echo "Press Ctrl+C to stop if it hangs"
echo ""

# Check if timeout command is available (macOS doesn't have it by default)
if command -v timeout &> /dev/null; then
    TIMEOUT_CMD="timeout 120s"
elif command -v gtimeout &> /dev/null; then
    TIMEOUT_CMD="gtimeout 120s"
elif [ -f "timeout-wrapper.js" ]; then
    TIMEOUT_CMD="node timeout-wrapper.js 120"
    echo "🕐 Using Node.js timeout wrapper (120 seconds)"
else
    echo "⚠️  No timeout command available (this is normal on macOS)"
    echo "💡 Script will run without auto-timeout - press Ctrl+C to stop if it hangs"
    TIMEOUT_CMD=""
fi

# Run with debug settings
LINEAR_API_TIMEOUT=10000 \
LINEAR_MAX_CONCURRENT=1 \
LINEAR_API_RETRY_ATTEMPTS=2 \
LOG_TO_FILE=true \
LOG_FILE=logs/debug-sync.log \
$TIMEOUT_CMD npm run issues

exit_code=$?

echo ""
if [ $exit_code -eq 124 ]; then
    echo "⏰ Script timed out after 2 minutes - definite hanging issue"
    echo "💡 Check logs/debug-sync.log for the last activity"
    if [ -f "logs/debug-sync.log" ]; then
        echo ""
        echo "📄 Last 20 lines of debug log:"
        tail -20 logs/debug-sync.log
    fi
elif [ $exit_code -eq 130 ]; then
    echo "🛑 Script was interrupted (Ctrl+C)"
else
    echo "✅ Script completed with exit code: $exit_code"
fi

echo ""
echo "🔍 Analysis complete. If hanging persists, try:"
echo "1. Reduce LINEAR_API_TIMEOUT to 5000ms"
echo "2. Check network/firewall settings"
echo "3. Test with different LINEAR_UPDATED_SINCE dates"
echo "4. Check if Linear API key has proper permissions" 
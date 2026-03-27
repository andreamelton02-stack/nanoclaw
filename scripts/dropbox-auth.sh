#!/bin/bash
# Dropbox OAuth flow to get a refresh token for wife's account.
# Uses the same Dropbox app (eq54npod5q7g5nd) with her Dropbox login.
#
# Usage: ./scripts/dropbox-auth.sh

CLIENT_ID="eq54npod5q7g5nd"
CLIENT_SECRET="hctg46nib39y2ms"

echo ""
echo "=== Dropbox OAuth Setup for Jeeves ==="
echo ""
echo "1. Open this URL in a browser where your wife is logged into Dropbox:"
echo ""
echo "   https://www.dropbox.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&token_access_type=offline"
echo ""
echo "2. She should click 'Allow' to authorize the app."
echo "3. Dropbox will show an authorization code. Paste it below."
echo ""
read -p "Authorization code: " AUTH_CODE

if [ -z "$AUTH_CODE" ]; then
    echo "No code entered. Aborting."
    exit 1
fi

echo ""
echo "Exchanging code for tokens..."
echo ""

RESPONSE=$(curl -s -X POST https://api.dropboxapi.com/oauth2/token \
    -d code="$AUTH_CODE" \
    -d grant_type=authorization_code \
    -d client_id="$CLIENT_ID" \
    -d client_secret="$CLIENT_SECRET")

REFRESH_TOKEN=$(echo "$RESPONSE" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)
ACCESS_TOKEN=$(echo "$RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$REFRESH_TOKEN" ]; then
    echo "ERROR: Failed to get refresh token."
    echo "Response: $RESPONSE"
    exit 1
fi

echo "Success!  Add these to your .env file:"
echo ""
echo "DROPBOX_ACCESS_TOKEN=$ACCESS_TOKEN"
echo "DROPBOX_REFRESH_TOKEN=$REFRESH_TOKEN"
echo ""

# Auto-update .env if user wants
read -p "Update .env automatically? (y/n): " UPDATE
if [ "$UPDATE" = "y" ] || [ "$UPDATE" = "Y" ]; then
    sed -i "s|^DROPBOX_ACCESS_TOKEN=.*|DROPBOX_ACCESS_TOKEN=$ACCESS_TOKEN|" .env
    sed -i "s|^DROPBOX_REFRESH_TOKEN=.*|DROPBOX_REFRESH_TOKEN=$REFRESH_TOKEN|" .env
    echo "Done!  .env updated."
fi

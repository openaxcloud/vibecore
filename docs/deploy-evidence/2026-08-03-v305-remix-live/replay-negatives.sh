set -u
API=https://api.e-code.ai
SUF="$(date +%s)-$RANDOM"
EMAIL="v305-proof-$SUF@local.test"
echo "### 1. register QA user in PROD: $EMAIL"
REG=$(curl -s -w "\n%{http_code}" -X POST "$API/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Password123!\",\"name\":\"V305 Proof\",\"organizationName\":\"V305 Proof Org $SUF\"}")
CODE=$(echo "$REG" | tail -1); BODY=$(echo "$REG" | sed '$d')
echo "HTTP $CODE"
TOKEN=$(echo "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))' 2>/dev/null)
ORG=$(echo "$BODY" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("organization",{}).get("id",""))' 2>/dev/null)
echo "org=$ORG token=${TOKEN:0:12}..."
[ -z "$TOKEN" ] && { echo "REGISTER FAILED: $BODY"; exit 1; }

echo; echo "### 2. NEGATIVE A — remix a listing the author did NOT allow (realtime-chat-starter, remixAllowed=false, license=null)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$API/gallery/realtime-chat-starter/remix" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"organizationId\":\"$ORG\",\"acceptLicense\":true}"

echo; echo "### 3. NEGATIVE B — licensed listing but NO consent (storefront, MIT)"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$API/gallery/storefront/remix" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"organizationId\":\"$ORG\"}"

echo "TOKEN_FOR_LATER=$TOKEN" > /tmp/v305.env
echo "ORG_FOR_LATER=$ORG" >> /tmp/v305.env

#!/bin/bash
# Deploy all Supabase Edge Functions
# Usage: ./scripts/deploy-functions.sh
# Or with custom project: PROJECT_REF=your-ref ./scripts/deploy-functions.sh

# Use environment variable or default (set your default here or via env)
PROJECT_REF="${SUPABASE_PROJECT_REF:-qjwwkcoredotrjtstigt}"

# Check if logged in
echo "Checking Supabase authentication..."
supabase projects list > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Please login first: supabase login"
    exit 1
fi

echo "Deploying Edge Functions to project: $PROJECT_REF"
echo "================================================"

# Deploy each function
FUNCTIONS=(
    "ai-complete"
    "create-lead"
    "embed-knowledge-base"
    "billing-overage-check"
    "marketplace-install-template"
    "reseller-track-referral"
    "scrape-url"
)

for func in "${FUNCTIONS[@]}"; do
    echo ""
    echo "Deploying: $func"
    supabase functions deploy "$func" --project-ref "$PROJECT_REF"
    if [ $? -eq 0 ]; then
        echo "✓ $func deployed successfully"
    else
        echo "✗ Failed to deploy $func"
    fi
done

echo ""
echo "================================================"
echo "Deployment complete!"
echo ""
echo "Don't forget to set secrets:"
echo "  supabase secrets set OPENAI_API_KEY=sk-... --project-ref $PROJECT_REF"

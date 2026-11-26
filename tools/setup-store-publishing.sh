#!/bin/bash
# One-time Google Cloud setup so GitHub Actions can upload to the Chrome Web Store
# without any stored key or password (Workload Identity Federation).
# Run it in Google Cloud Shell (it has gcloud): https://shell.cloud.google.com
#   bash setup-store-publishing.sh YOUR_PROJECT_ID
# Safe to re-run: steps that already exist are skipped.
set -euo pipefail

PROJECT_ID="${1:?usage: bash setup-store-publishing.sh PROJECT_ID}"
REPO="shlomsh/videos-off-my-phone"
OWNER_ID="16246393"            # GitHub's numeric ID of the repo owner (blocks look-alike repos)
ENVIRONMENT="chrome-web-store" # only the approved release job may sign in
SA_NAME="cws-publisher"
POOL="github"
PROVIDER="videos-off-my-phone"

SA="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID" >/dev/null
NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

echo "1/5 Turning on the APIs"
gcloud services enable chromewebstore.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

echo "2/5 Service account $SA (no roles in the project)"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --display-name="Chrome Web Store publisher (GitHub Actions)"

echo "3/5 Identity pool for GitHub"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub Actions"

echo "4/5 Provider: only $REPO, only its $ENVIRONMENT job"
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --location=global --workload-identity-pool="$POOL" \
    --display-name="videos-off-my-phone releases" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO' && assertion.repository_owner_id=='$OWNER_ID' && assertion.environment=='$ENVIRONMENT'"

echo "5/5 Letting that job act as the service account"
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" >/dev/null

cat <<EOF

Done. Next:
  A. Chrome Web Store Developer Dashboard > Account: add this service account email:
       $SA
  B. Send these two values to the session that set this up (they are not secret):
       GCP_WIF_PROVIDER    = projects/$NUMBER/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER
       GCP_SERVICE_ACCOUNT = $SA
EOF

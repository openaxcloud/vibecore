#!/bin/bash
set -e

REGISTRY="europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers"

echo "=== Authentification Artifact Registry ==="
gcloud auth configure-docker europe-west9-docker.pkg.dev --quiet

echo ""
echo "=== 1/7 Build: web ==="
docker build \
  -t "$REGISTRY/web:latest" \
  --target bolt-ai-production \
  .

echo ""
echo "=== 2/7 Build: admin ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg PACKAGE_FILTER=@vibecore/admin \
  --build-arg 'START_CMD=node serve.mjs' \
  -t "$REGISTRY/admin:latest" \
  .

echo ""
echo "=== 3/7 Build: api ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg PACKAGE_FILTER=@vibecore/api \
  --build-arg 'START_CMD=node dist/server.js' \
  -t "$REGISTRY/api:latest" \
  .

echo ""
echo "=== 4/7 Build: worker ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg PACKAGE_FILTER=@vibecore/worker \
  --build-arg 'START_CMD=node dist/index.js' \
  -t "$REGISTRY/worker:latest" \
  .

echo ""
echo "=== 5/7 Build: ai-gateway ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg PACKAGE_FILTER=@vibecore/ai-gateway \
  --build-arg 'START_CMD=node dist/server.js' \
  -t "$REGISTRY/ai-gateway:latest" \
  .

echo ""
echo "=== 6/7 Build: workspace-manager ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg PACKAGE_FILTER=@vibecore/workspace-manager \
  --build-arg 'START_CMD=node dist/server.js' \
  -t "$REGISTRY/workspace-manager:latest" \
  .

echo ""
echo "=== 7/7 Build: preview-proxy ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg PACKAGE_FILTER=@vibecore/preview-proxy \
  --build-arg 'START_CMD=node dist/server.js' \
  -t "$REGISTRY/preview-proxy:latest" \
  .

echo ""
echo "=== Push des 7 images ==="
for img in web admin api worker ai-gateway workspace-manager preview-proxy; do
  echo "Pushing $img..."
  docker push "$REGISTRY/$img:latest"
done

echo ""
echo "=== Terminé ! 7 images pushées vers $REGISTRY ==="

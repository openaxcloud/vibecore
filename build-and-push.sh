#!/bin/bash
# Local equivalent of cloudbuild.yaml — builds the shared deps base once,
# then the 7 service images against it. Mirrors the Cloud Build pipeline
# but runs sequentially because a laptop usually can't afford 7 parallel
# Docker builds the way Cloud Build's 8-vCPU worker can.
set -e

REGISTRY="europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers"
DEPS_IMAGE="$REGISTRY/deps:latest"
export DOCKER_BUILDKIT=1

echo "=== Authentification Artifact Registry ==="
gcloud auth configure-docker europe-west9-docker.pkg.dev --quiet

echo ""
echo "=== 0/8 Build: deps (shared base) ==="
docker build \
  -f infra/docker/deps.Dockerfile \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t "$DEPS_IMAGE" \
  .

echo ""
echo "=== 1/8 Build: web ==="
docker build \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --target bolt-ai-production \
  -t "$REGISTRY/web:latest" \
  .

echo ""
echo "=== 2/8 Build: admin ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg PACKAGE_FILTER=@vibecore/admin \
  --build-arg 'START_CMD=node serve.mjs' \
  -t "$REGISTRY/admin:latest" \
  .

echo ""
echo "=== 3/8 Build: api ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg PACKAGE_FILTER=@vibecore/api \
  --build-arg 'START_CMD=tsx dist/server.js' \
  -t "$REGISTRY/api:latest" \
  .

echo ""
echo "=== 4/8 Build: worker ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg PACKAGE_FILTER=@vibecore/worker \
  --build-arg 'START_CMD=tsx dist/index.js' \
  -t "$REGISTRY/worker:latest" \
  .

echo ""
echo "=== 5/8 Build: ai-gateway ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg PACKAGE_FILTER=@vibecore/ai-gateway \
  --build-arg 'START_CMD=tsx dist/server.js' \
  -t "$REGISTRY/ai-gateway:latest" \
  .

echo ""
echo "=== 6/8 Build: workspace-manager ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg PACKAGE_FILTER=@vibecore/workspace-manager \
  --build-arg 'START_CMD=tsx dist/server.js' \
  -t "$REGISTRY/workspace-manager:latest" \
  .

echo ""
echo "=== 7/8 Build: preview-proxy ==="
docker build \
  -f infra/docker/node-service.Dockerfile \
  --build-arg "DEPS_IMAGE=$DEPS_IMAGE" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg PACKAGE_FILTER=@vibecore/preview-proxy \
  --build-arg 'START_CMD=tsx dist/server.js' \
  -t "$REGISTRY/preview-proxy:latest" \
  .

echo ""
echo "=== Push des 8 images ==="
for img in deps web admin api worker ai-gateway workspace-manager preview-proxy; do
  echo "Pushing $img..."
  docker push "$REGISTRY/$img:latest"
done

echo ""
echo "=== Terminé ! 8 images pushées vers $REGISTRY ==="

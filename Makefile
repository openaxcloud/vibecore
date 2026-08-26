# Top-level Makefile for vibecore.
#
# Conventions:
#   * Targets that touch GCP go through `gcloud builds submit`, never push
#     directly from a developer machine — Cloud Build is the only path
#     that produces the canonical SHA tags in Artifact Registry.
#   * SHORT_SHA defaults to the current HEAD short SHA (10 chars) so a
#     build produced from `main` matches the SHA helm pins. Override on
#     the command line for ad-hoc rebuilds:
#         make deploy-api SHORT_SHA=hotfix1
#   * DEPS_TAG, when not provided, is auto-detected at recipe time as the
#     most recent SHA tag on the `deps` image in Artifact Registry
#     (skipping `latest`). Override to pin:
#         make deploy-api DEPS_TAG=9b9c9a037b
#
# What this file is NOT:
#   * Not a developer task runner — that's pnpm scripts in package.json.
#   * Not a deploy tool — that's `helm upgrade` (or the wrapper in
#     scripts/). These targets only build and push images; running them
#     does not change what's serving traffic.

SHELL := /usr/bin/env bash
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:

# ---- GCP coords ----
PROJECT  ?= vibecore-495216
REGION   ?= europe-west9
REPO     ?= vibecore-prod-containers
REGISTRY := $(REGION)-docker.pkg.dev/$(PROJECT)/$(REPO)

# ---- Build metadata ----
SHORT_SHA ?= $(shell git rev-parse --short=10 HEAD)
MACHINE   ?= e2-highcpu-8
TIMEOUT_FULL    ?= 3600s
TIMEOUT_RUNTIME ?= 3600s
TIMEOUT_SINGLE  ?= 1800s

# DEPS_TAG is left unset here and resolved inside each recipe via the
# `resolve_deps_tag` shell helper. Doing it at Make parse time would
# shell out to gcloud on every invocation (including `make help`).
DEPS_TAG ?=

GCLOUD := gcloud builds submit \
	--project=$(PROJECT) \
	--region=$(REGION) \
	--machine-type=$(MACHINE)

# Shell snippet shared by single-service recipes: resolves DEPS_TAG if it
# wasn't passed explicitly, by listing tags on the deps image and picking
# the newest non-`latest` tag.
define resolve_deps_tag
	deps_tag="$(DEPS_TAG)"; \
	if [[ -z "$$deps_tag" ]]; then \
		deps_tag=$$(gcloud artifacts docker tags list "$(REGISTRY)/deps" \
			--project=$(PROJECT) \
			--format='value(tag)' \
			--sort-by='~version' 2>/dev/null \
			| grep -v '^latest$$' \
			| head -n1); \
	fi; \
	if [[ -z "$$deps_tag" ]]; then \
		echo "WARN: no deps SHA tag found in $(REGISTRY)/deps, falling back to :latest"; \
		deps_tag=latest; \
	fi
endef

.PHONY: help \
	deploy-all deploy-runtime \
	deploy-api deploy-worker deploy-web deploy-admin \
	deploy-ai-gateway deploy-workspace-manager deploy-preview-proxy \
	list-deps-tags

help: ## Show this help.
	@awk 'BEGIN{FS=":.*##"; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_.-]+:.*##/ {printf "  \033[1m%-26s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo
	@echo "Variables (override on the command line):"
	@echo "  SHORT_SHA  build SHA (current: $(SHORT_SHA))"
	@echo "  DEPS_TAG   pin deps image tag for single-service builds (default: auto-detect)"
	@echo "  PROJECT    GCP project (current: $(PROJECT))"
	@echo "  REGION     Cloud Build region (current: $(REGION))"

# ---- Full pipeline ----

deploy-all: ## Full pipeline: rebuild deps + all 7 services.
	@echo "::: full pipeline → SHORT_SHA=$(SHORT_SHA)"
	$(GCLOUD) \
		--config=cloudbuild.yaml \
		--substitutions=_SHORT_SHA=$(SHORT_SHA) \
		--timeout=$(TIMEOUT_FULL) .

# ---- Runtime tier (fresh deps + six serialized backend service images) ----

deploy-runtime: ## Fresh deps + all runtime service images (serialized).
	@echo "::: runtime tier (fresh deps) → SHORT_SHA=$(SHORT_SHA)"
	$(GCLOUD) \
		--config=infra/cloudbuild/runtime-tier.yaml \
		--substitutions=_SHORT_SHA=$(SHORT_SHA) \
		--timeout=$(TIMEOUT_RUNTIME) .

# ---- Single-service rebuilds ----
# Each target submits infra/cloudbuild/single-service.yaml with the right
# substitutions. SHORT_SHA tags the produced image. DEPS_TAG pins which
# deps base it builds against — change it only if you know an older deps
# image is the right one for the source you're shipping.

define _deploy_node_service
	$(resolve_deps_tag); \
	echo "::: single-service $(1) → SHORT_SHA=$(SHORT_SHA) DEPS_TAG=$$deps_tag"; \
	$(GCLOUD) \
		--config=infra/cloudbuild/single-service.yaml \
		--substitutions=_SERVICE=$(1),_PACKAGE_FILTER=$(2),_START_CMD="$(3)",_DEPS_TAG=$$deps_tag,_SHORT_SHA=$(SHORT_SHA) \
		--timeout=$(TIMEOUT_SINGLE) .
endef

deploy-api: ## Rebuild api only (against pinned deps).
	@$(call _deploy_node_service,api,@vibecore/api,tsx dist/server.js)

deploy-worker: ## Rebuild worker only (against pinned deps).
	@$(call _deploy_node_service,worker,@vibecore/worker,tsx dist/index.js)

deploy-admin: ## Rebuild + sign admin only (against pinned deps).
	@$(resolve_deps_tag); \
	echo "::: signed admin tier → SHORT_SHA=$(SHORT_SHA) DEPS_TAG=$$deps_tag"; \
	$(GCLOUD) \
		--config=infra/cloudbuild/single-admin.yaml \
		--substitutions=_DEPS_TAG=$$deps_tag,_SHORT_SHA=$(SHORT_SHA) \
		--timeout=$(TIMEOUT_SINGLE) .

deploy-ai-gateway: ## Rebuild ai-gateway only (against pinned deps).
	@$(call _deploy_node_service,ai-gateway,@vibecore/ai-gateway,tsx dist/server.js)

deploy-workspace-manager: ## Rebuild workspace-manager only (against pinned deps).
	@$(call _deploy_node_service,workspace-manager,@vibecore/workspace-manager,tsx dist/server.js)

deploy-workspace-agent: ## Rebuild the workspace-agent RUNTIME image (own Dockerfile, node-pty).
	@echo "::: workspace-agent runtime image -> sha-$(SHORT_SHA)"; \
	$(GCLOUD) \
		--config=infra/cloudbuild/workspace-agent.yaml \
		--substitutions=_SHORT_SHA=$(SHORT_SHA) \
		--timeout=$(TIMEOUT_SINGLE) .

deploy-preview-proxy: ## Rebuild preview-proxy only (against pinned deps).
	@$(call _deploy_node_service,preview-proxy,@vibecore/preview-proxy,tsx dist/server.js)

deploy-web: ## Rebuild web only (uses root Dockerfile, target=bolt-ai-production).
	@$(resolve_deps_tag); \
	echo "::: single-service web → SHORT_SHA=$(SHORT_SHA) DEPS_TAG=$$deps_tag"; \
	$(GCLOUD) \
		--config=infra/cloudbuild/single-web.yaml \
		--substitutions=_DEPS_TAG=$$deps_tag,_SHORT_SHA=$(SHORT_SHA) \
		--timeout=$(TIMEOUT_SINGLE) .

# ---- Diagnostics ----

list-deps-tags: ## List recent deps image tags in Artifact Registry.
	@gcloud artifacts docker tags list $(REGISTRY)/deps \
		--project=$(PROJECT) \
		--format='table(tag,version.basename():label=DIGEST)' \
		--sort-by='~version' \
		--limit=20

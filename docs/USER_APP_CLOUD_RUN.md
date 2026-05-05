# User Apps on Google Cloud Run

Google Cloud Run deployment support is exposed through provider `google-cloud-run`.

## Pipeline

1. Build from the active workspace with the submitted build command.
2. Create a source artifact from the project files.
3. Push an image to an isolated artifact registry.
4. Deploy a Cloud Run service for the selected environment.
5. Optionally map a verified custom domain.

## Controls

- `deployments.count` quota is checked before creating the deployment.
- Build timeout defaults to 600 seconds and is bounded by the API schema.
- Artifact size is bounded by `artifactSizeLimitMb`.
- Platform secrets are not copied into user services.
- Only explicitly selected project/user secrets are injected.
- Logs are redacted before storage and response.

## Isolation

Production Cloud Run builds must run through the secured builder path, not the platform API process. The builder must not expose Docker socket access to user code unless the builder is isolated for untrusted workloads and hardened with non-root execution, egress controls, size limits, malware checks, and audit logging.

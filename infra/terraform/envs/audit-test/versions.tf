terraform {
  required_version = ">= 1.7.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    # gVisor (`sandbox_config`) is beta-only in the provider.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Local state on purpose: this environment is ephemeral and is torn down by
  # destroying the whole GCP project. A GCS backend inside that same project
  # would be deleted with it (chicken/egg), and a backend in the prod project
  # would violate the "no prod resource" guardrail. State stays local and
  # gitignored; the project deletion is the authoritative teardown.
}

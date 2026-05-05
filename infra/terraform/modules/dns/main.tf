resource "google_dns_managed_zone" "primary" {
  name        = replace("${var.name_prefix}-${var.domain}", ".", "-")
  dns_name    = "${var.domain}."
  description = "VibeCore app DNS zone"
  labels      = var.labels
}

resource "google_dns_managed_zone" "preview" {
  name        = replace("${var.name_prefix}-${var.preview_domain}", ".", "-")
  dns_name    = "${var.preview_domain}."
  description = "VibeCore wildcard preview DNS zone"
  labels      = var.labels
}

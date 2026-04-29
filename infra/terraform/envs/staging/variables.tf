variable "project_id" { type = string }
variable "region" { type = string }
variable "domain" { type = string }
variable "preview_domain" { type = string }
variable "labels" {
  type    = map(string)
  default = {}
}

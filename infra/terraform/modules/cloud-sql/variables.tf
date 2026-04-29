variable "name_prefix" { type = string }
variable "region" { type = string }
variable "private_network_id" { type = string }
variable "private_network_link" { type = string }
variable "deletion_protection" { type = bool }
variable "labels" { type = map(string) }

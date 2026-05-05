output "vpc_id" { value = google_compute_network.main.id }
output "vpc_self_link" { value = google_compute_network.main.self_link }
output "app_subnet_self_link" { value = google_compute_subnetwork.app.self_link }
output "workspaces_subnet_self_link" { value = google_compute_subnetwork.workspaces.self_link }
output "private_service_connection" { value = google_service_networking_connection.private_vpc_connection.id }

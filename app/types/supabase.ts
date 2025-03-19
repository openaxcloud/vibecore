export interface SupabaseUser {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_sign_in_at: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  organization_id: string;
  region: string;
  created_at: string;
  status: string;
}

export interface SupabaseStats {
  projects: SupabaseProject[];
  totalProjects: number;
}

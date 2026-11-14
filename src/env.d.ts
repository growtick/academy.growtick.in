declare namespace App {
  interface Locals {
    user: { id: string; email: string | null; aud: string } | null;
    supabase: any;
  }
}

from supabase_client import supabase

response = supabase.table("users").select("*").execute()

print(response.data)
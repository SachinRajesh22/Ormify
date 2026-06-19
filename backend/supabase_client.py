from supabase import create_client
from dotenv import load_dotenv
import os

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_KEY")

print("URL =", url)
print("KEY EXISTS =", key is not None)

supabase = create_client(url, key)
import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

try:
    print("Initializing client...")
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    
    print("Sending request to Gemini...")
    response = client.models.generate_content(
        model="gemini-2.5-flash", 
        contents="Say 'API connection successful' if you can read this."
    )
    
    print("\n--- RESPONSE ---")
    print(response.text)
    print("----------------\n")
except Exception as e:
    print(f"\nERROR: {e}")


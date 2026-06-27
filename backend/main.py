import json
from typing import Dict, Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Clash Fleet API")

# --- Security: CORS Configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Imposter API is breathing"}

# --- The Imposter API ---
@app.get("/api/load")
def load_timers():
    """ Mimics the GET request of api.php?action=load """
    try:
        with open("/app/data/timers.json", "r") as f:
            return json.load(f)
    except FileNotFoundError:
        return {"error": "timers.json not found in the container"}

@app.post("/api/save")
def save_timers(payload: Dict[str, Any]):
    """ Mimics the POST request of api.php?action=save """
    try:
        with open("/app/data/timers.json", "w") as f:
            json.dump(payload, f, indent=2)
            
        return {"status": "success", "message": "Timers saved successfully by Python!"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
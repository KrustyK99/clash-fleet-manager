# Use the official, lightweight Python image
FROM python:3.11-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install the Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# We don't copy the code here because docker-compose is mounting it as a volume!
# This allows us to have instant hot-reloading when we save files in VS Code.

# Expose the port FastAPI runs on
EXPOSE 8000

# The command to start the server (with hot-reloading enabled)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
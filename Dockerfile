# 1. Start with a Node.js base
FROM node:18-bullseye

# 2. Install Python 3 and pip
RUN apt-get update && apt-get install -y python3 python3-pip python-is-python3

# 3. Set the working directory inside the server
WORKDIR /app

# 4. Install Node.js dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# 5. Install Python dependencies
COPY ml_engine/requirements.txt ./ml_engine/
RUN pip install --break-system-packages -r ml_engine/requirements.txt || pip install -r ml_engine/requirements.txt

# 6. Copy all your code into the server
COPY . .

# 7. Expose the port and start the backend!
EXPOSE 5000
WORKDIR /app/backend
CMD ["node", "index.js"]
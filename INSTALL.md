# 📥 Installation Guide - Chit Fund Manager

Welcome! This guide will help you install and run the Chit Fund Manager on your computer or server.

---

## ✅ Method 1: The Easy Way (Docker) - Recommended
*Works on Windows, Mac, and Linux*

This method isolates the application so you don't need to install Node.js manually.

### Prerequisites
1.  Install **Docker Desktop**: [Download Here](https://www.docker.com/products/docker-desktop/)

### Steps
1.  **Extract the folder** containing these files.
2.  Open a terminal/command prompt in this folder.
3.  Run the following command:
    ```bash
    docker-compose up -d
    ```
4.  Open your browser and go to: `http://localhost:3000`

### Updating
To update to a newer version later:
```bash
docker-compose down
docker-compose up -d --build
```

---

## 🛠️ Method 2: Manual Installation (Windows)

### Prerequisites
1.  **Node.js**: Download and install "LTS Version" from [nodejs.org](https://nodejs.org/).

### Steps
1.  **Unzip** the application folder.
2.  Open the folder, hold **Shift + Right Click** on blank space, and select **"Open PowerShell window here"** (or Command Prompt).
3.  Type the following commands:
    ```powershell
    npm install
    ```
    *(Wait for it to finish downloading dependencies)*
4.  Start the app:
    ```powershell
    node server.js
    ```
5.  You will see `Server running at http://localhost:3000`.
6.  Open your browser to that address.

---

## 🐧 Method 3: Manual Installation (Linux - Ubuntu/Debian)

### Steps
1.  **Install Node.js**:
    ```bash
    sudo apt update
    sudo apt install nodejs npm -y
    ```
2.  **Navigate to folder**:
    ```bash
    cd /path/to/chitfund
    ```
3.  **Install & Run**:
    ```bash
    npm install
    node server.js
    ```
4.  *(Optional)* Run in background using PM2:
    ```bash
    sudo npm install -g pm2
    pm2 start server.js --name chitfund
    pm2 save
    pm2 startup
    ```

---

## 🍎 Method 4: Manual Installation (macOS)

### Steps
1.  **Install Node.js**:
    Download installer from [nodejs.org](https://nodejs.org/) OR use Homebrew:
    ```bash
    brew install node
    ```
2.  **Navigate to folder**:
    ```bash
    cd /path/to/chitfund
    ```
3.  **Install & Run**:
    ```bash
    npm install
    node server.js
    ```

---

## 🔑 Login Credentials

*   **Admin**: `admin` / `admin123`
*   **Manager**: `manager` / `manager123`

> **Note**: Please change these passwords immediately after logging in!

---

## ❓ Troubleshooting

*   **Port 3000 Error**: If it says "Port already in use", edit the `docker-compose.yml` (change `3000:3000` to `8080:3000`) or `server.js` (change `PORT = 3000` to `8080`) and restart.
*   **Database**: The file `chitfund.db` contains all your data. **Do not delete it!**

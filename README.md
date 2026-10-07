# Production-Ready Node.js Backend Boilerplate

A high-performance, enterprise-ready, modular RESTful API boilerplate built using **Node.js**, **Express**, **TypeScript**, **MongoDB**, **Redis**, and **BullMQ**.

---

## 🚀 Features & Architecture Highlights

- **TypeScript Architecture**: Strict type checking with clean modular structure.
- **Security & Protection**:
  - **Helmet.js** for HTTP security headers.
  - **CORS** configuration.
  - **Redis-backed Rate Limiting** against DDoS and brute-force attacks.
  - **Mongo Sanitize & HPP** protection against NoSQL injection and HTTP Parameter Pollution.
  - **10kb Request Body Payload Limit** for DOS mitigation.
- **Caching & Queue Processing**:
  - **Redis Integration** via `ioredis` for fast data caching.
  - **BullMQ Background Workers** for asynchronous task execution (e.g., email dispatch & video processing).
- **Database**:
  - **MongoDB** with **Mongoose ODM** for reliable schema modelling and indexes.
- **Developer Experience & CI/CD**:
  - **ESLint v9 (Flat Config)** & **Prettier** for code formatting and linting.
  - **Husky** & **Lint-staged** for pre-commit hooks to ensure code quality.
  - **Jest** pre-configured for TDD and unit testing.
  - **GitHub Actions** ready for CI/CD pipelines.
- **API Documentation**:
  - Interactive **Redocly API Documentation** for API exploration.
- **Logging & Monitoring**:
  - **Pino & Pino-HTTP** for fast JSON logging with request tracking.
- **Containerization**:
  - Full **Docker** & **Docker Compose** support for multi-container development & production setups.

---

## 🛠️ Tech Stack

| Domain | Technology |
| :--- | :--- |
| **Language & Runtime** | Node.js (v20+), TypeScript |
| **Framework** | Express.js |
| **Database** | MongoDB (Mongoose ODM) |
| **Cache & Message Broker** | Redis |
| **Task Queue** | BullMQ |
| **Security** | Helmet, CORS, Express-Rate-Limit, Rate-Limit-Redis, Mongo-Sanitize, HPP |
| **Logger** | Pino, Pino-HTTP |
| **Validation** | Zod |
| **Containerization** | Docker, Docker Compose |
| **Code Quality** | ESLint, Prettier, Husky, Lint-Staged |
| **Testing** | Jest, Supertest |

---

## 📂 Project Structure

```text
node-backend-boilerplate/
├── src/
│   ├── config/              # Environment & service configurations (Redis, Rate Limits, DB)
│   ├── errors/              # Centralized error classes & custom error handlers (Zod, Mongoose)
│   ├── middlewares/         # Express middlewares (Security, Auth, Global Error, Rate Limiter)
│   ├── modules/             # Modular feature domains (User, Auth, etc.)
│   │   └── user/
│   │       ├── user.controller.ts
│   │       ├── user.model.ts
│   │       ├── user.routes.ts
│   │       ├── user.service.ts
│   │       └── user.validation.ts
│   ├── routes/              # Central application route registry
│   ├── utils/               # Helper utilities (Logger, sendResponse, catchAsync)
│   ├── app.ts               # Express application initialization & middleware stack
│   └── server.ts            # Entry point (Server listener & DB/Redis setup)
├── Dockerfile               # Multi-stage production Docker build
├── docker-compose.yml       # Docker Compose setup for App, MongoDB, and Redis
├── eslint.config.mjs        # ESLint Flat Config rules
├── jest.config.js           # Jest testing framework config
├── package.json             # NPM dependencies & scripts
└── tsconfig.json            # TypeScript compiler configuration
```

---

## ⚙️ Getting Started

### Prerequisites

Ensure you have the following installed on your system:
- **Node.js** (v20+ recommended)
- **Yarn** or **NPM**
- **Docker & Docker Compose** (Optional, but recommended for easy database setup)

---

### 📥 1. Installation

Clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd node-backend-boilerplate
yarn install
```

---

### 🔑 2. Environment Setup

Create a `.env` file in the root directory based on `.env.example`:

```bash
cp .env.example .env
```

Configure your environment variables in `.env`:

```env
# Application Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
DATABASE_URL=mongodb://127.0.0.1:27017/my_database_name

# Redis Configuration
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Authentication Secrets
JWT_ACCESS_SECRET=your_jwt_access_secret_key_here
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_here
JWT_REFRESH_EXPIRES_IN=365d

# SMTP Configuration (For Email/OTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM=your_email@gmail.com

# Security & Encryption
BCRYPT_SALT_ROUNDS=12

# Logging
LOG_LEVEL=info
```

---

### 🐳 3. Running with Docker Compose (Recommended)

To launch the full backend infrastructure (**App**, **MongoDB**, and **Redis**) with one command:

```bash
# Build and start all services in detached mode
docker-compose up -d --build
```

To stop all containers:

```bash
docker-compose down
```

To start only local services (**MongoDB & Redis**) while running the node server locally:

```bash
docker-compose up -d mongodb redis
```

---

### 💻 4. Local Development

Run the local development server with hot-reloading:

```bash
yarn dev
```

The server will be available at `http://localhost:5000`.
You can view the interactive **Redocly API Documentation** at `http://localhost:5005/api/docs`.

---

## 📜 Available NPM / Yarn Scripts

| Command | Action |
| :--- | :--- |
| `yarn dev` | Starts the server in development mode with `ts-node-dev` |
| `yarn build` | Compiles TypeScript files to output directory (`/dist`) |
| `yarn start` | Runs compiled production JavaScript files from `/dist` |
| `yarn lint` | Runs ESLint for code quality checks |
| `yarn lint:fix` | Automatically fixes ESLint errors |
| `yarn format` | Runs Prettier to format codebase |
| `yarn test` | Runs Jest unit tests |

---

## 🛡️ Response Format & Error Handling

### Standard Success Response

```json
{
  "statusCode": 200,
  "success": true,
  "message": "Operation successful",
  "data": {}
}
```

### Standard Error Response (Global Error Handler)

```json
{
  "statusCode": 404,
  "success": false,
  "message": "API Not Found: GET /unknown-path",
  "errorSources": [
    {
      "path": "/unknown-path",
      "message": "The requested route does not exist on this server."
    }
  ],
  "stack": "Error stack trace here (Only in Development Mode)"
}
```

---

## 📄 License

This boilerplate project is open-source and available under the [MIT License](LICENSE).

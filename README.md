# SLSEA Solar Generation Data API

A REST API for managing rooftop solar installations and electricity generation data in Sri Lanka. Built with **Node.js, Express, MongoDB, and Mongoose**.

## Features

- Manage provinces, districts, substations, and solar installations.
- Store and retrieve historical solar generation readings.
- Filter readings by location and date range.
- View the latest available readings and district generation summaries.
- Secure endpoints using JWT authentication and role-based access.
- Explore and test endpoints using Swagger UI.

## Getting Started

**Requirements:** Node.js, npm, and MongoDB.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and configure `MONGODB_URI` and `JWT_SECRET`.
3. Start the API: `npm run dev`
4. To load demonstration data, configure the required `SEED_*` credentials in `.env`, then run `npm run seed`.

## API

- **Live API:** https://solar-generation-data-api.onrender.com/api/v1
- **Swagger Documentation:** https://solar-generation-data-api.onrender.com/api-docs/
- **Health Check:** https://solar-generation-data-api.onrender.com/health
- **Authentication:** `POST /api/v1/auth/tokens`

## Testing

Run `npm test` to execute the automated tests.

## Technology Stack

Node.js · Express.js · MongoDB Atlas · Mongoose · JWT · Swagger/OpenAPI · Jest

**Note:** Keep `.env`, passwords, database credentials, and device secrets out of GitHub.
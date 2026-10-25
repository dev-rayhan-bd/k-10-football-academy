# Project Agent Rules & Guidelines

## Core Principles

### 1. Zero Duplicate APIs / Endpoints
- **NEVER create duplicate endpoints or redundant route aliases** for the same feature/action (e.g., do not define multiple alternative paths doing the same thing).
- Provide exactly **ONE single canonical endpoint** per feature.
- When updating, uploading, or re-uploading resources, always reuse the primary canonical endpoint (e.g., `PATCH /api/v1/agents/agent-profile`) rather than creating fragmented endpoints.
- In documentation and Postman, specify only the single canonical route (never provide "or / অথবা" alias routes).

### 2. Database Integrity & No Unprompted Seeding
- NEVER seed the database or insert mock data without explicit instructions.
- NEVER return fake mock fallbacks or dummy IDs when queries return empty results.

### 3. Git Operations
- **DO NOT commit code to git** unless explicitly requested by the user.

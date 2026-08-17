-- Runs once on first Postgres container start.
-- Creates the RAG database and enables required extensions on both databases.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

SELECT 'CREATE DATABASE topchoice_rag'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'topchoice_rag')\gexec

\connect topchoice_rag

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

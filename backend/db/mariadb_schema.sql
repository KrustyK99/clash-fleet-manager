-- Clash Fleet Manager MariaDB document-store schema.
--
-- Phase 3B intentionally stores the existing API payloads as aggregate
-- documents. This keeps the current FastAPI/PHP compatibility contract intact
-- while proving MariaDB can sit behind the FleetStore seam.
--
-- Apply this manually to an empty MariaDB database selected by environment
-- variables. Do not store credentials or production database names here.

CREATE TABLE IF NOT EXISTS fleet_documents (
    doc_key VARCHAR(64) NOT NULL,
    schema_version INT NOT NULL,
    last_updated VARCHAR(64) NULL,
    payload_json LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (doc_key),
    CONSTRAINT chk_fleet_documents_json_valid CHECK (JSON_VALID(payload_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fleet_document_backups (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    doc_key VARCHAR(64) NOT NULL,
    backup_name VARCHAR(160) NOT NULL,
    previous_last_updated VARCHAR(64) NULL,
    payload_json LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_fleet_document_backups_name (backup_name),
    KEY idx_fleet_document_backups_doc_created (doc_key, created_at),
    CONSTRAINT chk_fleet_document_backups_json_valid CHECK (JSON_VALID(payload_json)),
    CONSTRAINT fk_fleet_document_backups_doc
        FOREIGN KEY (doc_key)
        REFERENCES fleet_documents (doc_key)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS chantierproof
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE chantierproof;

CREATE TABLE IF NOT EXISTS companies (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(80) NULL,
  address TEXT NULL,
  logo_url TEXT NULL,
  status ENUM('trial', 'active', 'suspended', 'cancelled') NOT NULL DEFAULT 'trial',
  storage_quota_mb INT UNSIGNED NOT NULL DEFAULT 1024,
  chantier_quota INT UNSIGNED NOT NULL DEFAULT 100,
  user_quota INT UNSIGNED NOT NULL DEFAULT 10,
  INDEX companies_status_idx (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teams (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  name VARCHAR(255) NOT NULL,
  company_id CHAR(36) NULL,
  UNIQUE KEY teams_company_name_unique (company_id, name),
  INDEX teams_company_id_idx (company_id),
  CONSTRAINT teams_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NULL,
  role ENUM('admin', 'accountant', 'technician', 'manager', 'super_admin') NOT NULL DEFAULT 'technician',
  team_id CHAR(36) NULL,
  team_name VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  company_id CHAR(36) NULL,
  password_hash VARCHAR(255) NULL,
  password_reset_token_hash CHAR(64) NULL,
  password_reset_expires_at DATETIME(6) NULL,
  password_set_at DATETIME(6) NULL,
  UNIQUE KEY profiles_email_unique (email),
  INDEX profiles_company_id_idx (company_id),
  CONSTRAINT profiles_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE SET NULL,
  CONSTRAINT profiles_team_fk FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_invitations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'accountant', 'technician', 'manager', 'super_admin') NOT NULL DEFAULT 'technician',
  team_id CHAR(36) NULL,
  team_name VARCHAR(255) NULL,
  token CHAR(36) NOT NULL,
  invited_by CHAR(36) NULL,
  accepted_at DATETIME(6) NULL,
  company_id CHAR(36) NULL,
  UNIQUE KEY user_invitations_token_unique (token),
  INDEX user_invitations_company_id_idx (company_id),
  INDEX user_invitations_email_idx (email),
  CONSTRAINT invitations_team_fk FOREIGN KEY (team_id) REFERENCES teams (id) ON DELETE SET NULL,
  CONSTRAINT invitations_invited_by_fk FOREIGN KEY (invited_by) REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT invitations_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS validations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  client_name VARCHAR(255) NOT NULL,
  client_phone VARCHAR(80) NULL,
  intervention_title VARCHAR(500) NOT NULL,
  intervention_price DECIMAL(12, 2) NULL,
  gps_position TEXT NULL,
  status ENUM('pending', 'signed', 'dispute') NOT NULL DEFAULT 'pending',
  photo_before_url TEXT NULL,
  photo_after_url TEXT NULL,
  signature_png_url TEXT NULL,
  technician_name VARCHAR(255) NULL,
  technician_notes TEXT NULL,
  signer_name VARCHAR(255) NULL,
  signed_at DATETIME(6) NULL,
  pdf_url TEXT NULL,
  accounting_status VARCHAR(40) NOT NULL DEFAULT 'not_sent',
  sent_to_accounting_at DATETIME(6) NULL,
  validation_link_expires_at DATETIME(6) NULL,
  created_by CHAR(36) NULL,
  assigned_team_id CHAR(36) NULL,
  assigned_technician_id CHAR(36) NULL,
  company_id CHAR(36) NULL,
  INDEX validations_status_idx (status),
  INDEX validations_created_at_idx (created_at),
  INDEX validations_signed_at_idx (signed_at),
  INDEX validations_status_created_at_idx (status, created_at),
  INDEX validations_created_by_created_at_idx (created_by, created_at),
  INDEX validations_accounting_status_created_at_idx (accounting_status, created_at),
  INDEX validations_company_id_created_at_idx (company_id, created_at),
  CONSTRAINT validations_created_by_fk FOREIGN KEY (created_by) REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT validations_assigned_team_fk FOREIGN KEY (assigned_team_id) REFERENCES teams (id) ON DELETE SET NULL,
  CONSTRAINT validations_assigned_technician_fk FOREIGN KEY (assigned_technician_id) REFERENCES profiles (id) ON DELETE SET NULL,
  CONSTRAINT validations_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  company_id CHAR(36) NOT NULL,
  plan ENUM('free', 'starter', 'pro', 'enterprise') NOT NULL DEFAULT 'starter',
  monthly_price_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'XOF',
  starts_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ends_at DATETIME(6) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  INDEX subscriptions_company_id_idx (company_id),
  CONSTRAINT subscriptions_company_fk FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS accounting_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  validation_id CHAR(36) NOT NULL,
  pdf_url TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  processed_at DATETIME(6) NULL,
  processed_by CHAR(36) NULL,
  UNIQUE KEY accounting_requests_validation_unique (validation_id),
  INDEX accounting_requests_status_created_at_idx (status, created_at),
  CONSTRAINT accounting_requests_validation_fk FOREIGN KEY (validation_id) REFERENCES validations (id) ON DELETE CASCADE,
  CONSTRAINT accounting_requests_processed_by_fk FOREIGN KEY (processed_by) REFERENCES profiles (id) ON DELETE SET NULL
) ENGINE=InnoDB;

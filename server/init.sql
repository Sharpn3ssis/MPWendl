CREATE DATABASE IF NOT EXISTS badatelsky_dejepis;
USE badatelsky_dejepis;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
    status ENUM('active','suspended') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    title VARCHAR(255),
    abstract TEXT,
    summary TEXT,
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    year SMALLINT,
    location VARCHAR(255),
    text LONGTEXT NOT NULL,
    content_json LONGTEXT,
    content_html LONGTEXT,
    videos_json LONGTEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    CONSTRAINT fk_sources_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY idx_sources_owner (owner_id),
    KEY idx_sources_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS source_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    editor_id INT NULL,
    change_type ENUM('content','metadata','status') NOT NULL DEFAULT 'content',
    snapshot_json LONGTEXT,
    snapshot_html LONGTEXT,
    diff_json LONGTEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_revisions_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    CONSTRAINT fk_source_revisions_editor FOREIGN KEY (editor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS source_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    uploader_id INT NOT NULL,
    asset_type ENUM('image','document','audio','video','other') NOT NULL DEFAULT 'image',
    asset_url TEXT NOT NULL,
    metadata_json JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_assets_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    CONSTRAINT fk_source_assets_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS source_tags (
    source_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (source_id, tag_id),
    CONSTRAINT fk_source_tags_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    CONSTRAINT fk_source_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS source_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    prompt TEXT NOT NULL,
    question_type ENUM('multiple-choice','text','ai-understanding') NOT NULL DEFAULT 'multiple-choice',
    text_answer TEXT NULL,
    text_answers_json LONGTEXT NULL,
    reference_answer TEXT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_questions_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    CONSTRAINT fk_source_questions_owner FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    KEY idx_questions_source (source_id),
    KEY idx_questions_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS source_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    answer_text TEXT NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_answers_question FOREIGN KEY (question_id) REFERENCES source_questions(id) ON DELETE CASCADE,
    KEY idx_answers_question (question_id),
    KEY idx_answers_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO users (username, email, password, role)
VALUES ('admin', 'admin@test.cz', '$2b$10$8K1p/a5eGyD.tFx8Pyk5/.8WwR.W0UxKXT4/PPvD9paV35Xn2h5PC', 'admin')
ON DUPLICATE KEY UPDATE username = VALUES(username);
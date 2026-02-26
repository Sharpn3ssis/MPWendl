import express from 'express';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const app = express();

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_AI_QUESTIONS = 20;
const MAX_AI_CONTEXT_CHARS = 6000;

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      organization: process.env.OPENAI_ORGANIZATION || undefined,
    })
  : null;

const sanitizeYear = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return Number.isFinite(rounded) ? rounded : null;
};

const stripHtml = (value) => {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const deriveSummary = (providedSummary, html, plainText) => {
  if (providedSummary && providedSummary.trim().length) {
    return providedSummary.trim();
  }
  const base = html ? stripHtml(html) : (plainText || '').trim();
  if (!base) return null;
  return base.length > 280 ? `${base.slice(0, 277).trim()}…` : base;
};

const getRequestUser = (req) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Povol požadavky bez origin (např. REST klient) nebo matchující seznam
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' není povolen`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'tajny_secret_jen_pro_vyvoj';

const allowedSourceStatuses = new Set(['draft', 'published', 'archived']);
const allowedQuestionTypes = new Set(['multiple-choice', 'text', 'ai-understanding']);
const MAX_QUIZ_QUESTIONS = 20;
const MIN_ANSWERS_PER_QUESTION = 2;
const MAX_ANSWERS_PER_QUESTION = 6;
const MAX_TEXT_ANSWERS = 10;
const MAX_SOURCE_VIDEOS = 8;
const AI_UNDERSTANDING_THRESHOLD = 80;
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const parseYoutubeId = (input) => {
  if (!input || typeof input !== 'string') {
    return null;
  }
  const candidate = input.trim();
  if (!candidate) {
    return null;
  }
  if (YOUTUBE_ID_REGEX.test(candidate)) {
    return candidate;
  }
  try {
    const normalized = candidate.startsWith('http') ? candidate : `https://${candidate}`;
    const url = new URL(normalized);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      const segment = url.pathname.replace(/^\/+/, '');
      return YOUTUBE_ID_REGEX.test(segment) ? segment.slice(0, 11) : null;
    }
    if (host.includes('youtube.com')) {
      if (url.searchParams.has('v')) {
        const v = url.searchParams.get('v');
        return v && YOUTUBE_ID_REGEX.test(v) ? v : null;
      }
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' && parts[1] && YOUTUBE_ID_REGEX.test(parts[1])) {
        return parts[1];
      }
      if (parts[0] === 'shorts' && parts[1] && YOUTUBE_ID_REGEX.test(parts[1])) {
        return parts[1];
      }
    }
  } catch (parseErr) {
    return null;
  }
  return null;
};

const formatYoutubeShortUrl = (videoId) => `https://youtu.be/${videoId}`;

const truncateForAiContext = (value, maxLength = MAX_AI_CONTEXT_CHARS) => {
  if (!value || typeof value !== 'string') {
    return '';
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const parseAiJson = (payload) => {
  if (!payload || typeof payload !== 'string') {
    return null;
  }
  try {
    return JSON.parse(payload);
  } catch (err) {
    console.warn('Nepodařilo se zpracovat AI odpověď jako JSON:', err?.message || err);
    return null;
  }
};

const sanitizeAiQuestions = (incoming) => {
  if (!Array.isArray(incoming)) {
    return [];
  }
  const limit = Math.min(MAX_AI_QUESTIONS, MAX_QUIZ_QUESTIONS);
  const sanitized = [];
  const seenPrompts = new Set();
  for (let i = 0; i < incoming.length && sanitized.length < limit; i += 1) {
    const rawQuestion = incoming[i];
    const prompt = typeof rawQuestion?.prompt === 'string' ? rawQuestion.prompt.trim() : '';
    if (!prompt) {
      continue;
    }
    const normalizedPromptKey = prompt.toLowerCase();
    if (seenPrompts.has(normalizedPromptKey)) {
      continue;
    }
    const type = rawQuestion?.type === 'text' ? 'text' : 'multiple-choice';
    if (type === 'multiple-choice') {
      const answersRaw = Array.isArray(rawQuestion?.answers) ? rawQuestion.answers : [];
      const preparedAnswers = answersRaw
        .map((answer) => ({
          text: typeof answer?.text === 'string' ? answer.text.trim() : '',
          is_correct: !!answer?.is_correct,
        }))
        .filter((answer) => answer.text.length)
        .slice(0, MAX_ANSWERS_PER_QUESTION);
      if (preparedAnswers.length < MIN_ANSWERS_PER_QUESTION) {
        continue;
      }
      if (!preparedAnswers.some((answer) => answer.is_correct)) {
        continue;
      }
      sanitized.push({
        prompt,
        type: 'multiple-choice',
        answers: preparedAnswers,
        textAnswers: [],
      });
      seenPrompts.add(normalizedPromptKey);
      continue;
    }

    const textAnswersArray = Array.isArray(rawQuestion?.textAnswers)
      ? rawQuestion.textAnswers
      : typeof rawQuestion?.textAnswer === 'string'
        ? [rawQuestion.textAnswer]
        : [];
    const normalizedTextAnswers = Array.from(
      new Set(
        textAnswersArray
          .map((value) => (typeof value === 'string' ? value.trim() : ''))
          .filter((value) => value.length)
      )
    ).slice(0, MAX_TEXT_ANSWERS);

    if (!normalizedTextAnswers.length) {
      continue;
    }

    sanitized.push({
      prompt,
      type: 'text',
      answers: [],
      textAnswers: normalizedTextAnswers,
    });
    seenPrompts.add(normalizedPromptKey);
  }
  return sanitized;
};

const buildAiRequestOptions = () => {
  const payload = {
    model: OPENAI_MODEL,
    response_format: { type: 'json_object' },
  };
  if (!/^gpt-5-nano/i.test(OPENAI_MODEL)) {
    payload.temperature = 0.4;
  }
  return payload;
};

const sanitizeSourceVideos = (incoming) => {
  if (!Array.isArray(incoming)) {
    return [];
  }
  const sanitized = [];
  for (let i = 0; i < incoming.length; i += 1) {
    if (sanitized.length >= MAX_SOURCE_VIDEOS) {
      break;
    }
    const entry = incoming[i];
    const videoId =
      parseYoutubeId(entry?.videoId) ||
      parseYoutubeId(entry?.url) ||
      parseYoutubeId(entry?.id) ||
      parseYoutubeId(entry?.youtubeId);
    if (!videoId) {
      continue;
    }
    const id = typeof entry?.id === 'string' && entry.id.trim().length ? entry.id.trim() : `video_${Date.now()}_${i}`;
    sanitized.push({
      id,
      videoId,
      title: typeof entry?.title === 'string' ? entry.title.trim().slice(0, 200) : '',
      description: typeof entry?.description === 'string' ? entry.description.trim().slice(0, 700) : '',
      url:
        typeof entry?.url === 'string' && entry.url.trim().length
          ? entry.url.trim()
          : formatYoutubeShortUrl(videoId),
    });
  }
  return sanitized;
};

const deserializeSourceVideos = (payload) => {
  if (!payload) {
    return [];
  }
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    return Array.isArray(parsed) ? sanitizeSourceVideos(parsed) : [];
  } catch {
    return [];
  }
};

const attachVideosToSource = (row) => {
  if (!row) return row;
  return {
    ...row,
    videos: deserializeSourceVideos(row.videos_json),
  };
};

const ensureSchema = async (database) => {
  const safeExec = async (query, description, params = []) => {
    try {
      await database.query(query, params);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      const ignorable =
        err?.code === 'ER_DUP_FIELDNAME' ||
        err?.code === 'ER_TABLE_EXISTS_ERROR' ||
        err?.code === 'ER_DUP_KEYNAME' ||
        msg.includes('Duplicate column name') ||
        msg.includes('already exists');
      if (!ignorable) {
        console.warn(`Schema ensure warning${description ? ` (${description})` : ''}:`, msg);
      }
    }
  };

  const columnExists = async (table, column) => {
    const [rows] = await database.query(
      `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?`,
      [table, column]
    );
    return (rows?.[0]?.cnt || 0) > 0;
  };

  const ensureColumn = async (table, column, definition, description) => {
    const hasColumn = await columnExists(table, column);
    if (!hasColumn) {
      await safeExec(
        `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
        description
      );
    }
  };

  const indexExists = async (table, index) => {
    const [rows] = await database.query(
      `SELECT COUNT(*) AS cnt
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND INDEX_NAME = ?`,
      [table, index]
    );
    return (rows?.[0]?.cnt || 0) > 0;
  };

  const ensureIndex = async (table, index, columns, description) => {
    const hasIndex = await indexExists(table, index);
    if (!hasIndex) {
      const columnList = columns.map(col => `\`${col}\``).join(', ');
      await safeExec(
        `CREATE INDEX \`${index}\` ON \`${table}\` (${columnList})`,
        description
      );
    }
  };

  await safeExec(`CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
    status ENUM('active','suspended') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create users');

  await ensureColumn('users', 'status', "ENUM('active','suspended') NOT NULL DEFAULT 'active'", 'users.add_status');
  await ensureColumn('users', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'users.add_updated_at');
  await ensureColumn('users', 'last_login', 'DATETIME NULL', 'users.add_last_login');

  await safeExec(`CREATE TABLE IF NOT EXISTS sources (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    title VARCHAR(255),
    abstract TEXT,
    text LONGTEXT NOT NULL,
    content_json LONGTEXT,
    content_html LONGTEXT,
    summary TEXT,
    status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
    year SMALLINT,
    location VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    published_at DATETIME NULL,
    CONSTRAINT fk_sources_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create sources');

  await ensureColumn('sources', 'abstract', 'TEXT NULL', 'sources.add_abstract');
  await ensureColumn('sources', 'content_json', 'LONGTEXT NULL', 'sources.add_content_json');
  await ensureColumn('sources', 'content_html', 'LONGTEXT NULL', 'sources.add_content_html');
  await ensureColumn('sources', 'videos_json', 'LONGTEXT NULL', 'sources.add_videos_json');
  await ensureColumn('sources', 'summary', 'TEXT NULL', 'sources.add_summary');
  await ensureColumn('sources', 'status', "ENUM('draft','published','archived') NOT NULL DEFAULT 'draft'", 'sources.add_status');
  await ensureColumn('sources', 'location', 'VARCHAR(255) NULL', 'sources.add_location');
  await ensureColumn('sources', 'updated_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'sources.add_updated_at');
  await ensureColumn('sources', 'published_at', 'DATETIME NULL', 'sources.add_published_at');
  await ensureIndex('sources', 'idx_sources_owner', ['owner_id'], 'sources.idx_owner');
  await ensureIndex('sources', 'idx_sources_status', ['status'], 'sources.idx_status');

  await safeExec(`CREATE TABLE IF NOT EXISTS source_revisions (
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
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create source_revisions');

  await safeExec(`CREATE TABLE IF NOT EXISTS source_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    uploader_id INT NOT NULL,
    asset_type ENUM('image','document','audio','video','other') NOT NULL DEFAULT 'image',
    asset_url TEXT NOT NULL,
    metadata_json JSON,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_assets_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    CONSTRAINT fk_source_assets_uploader FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create source_assets');

  await safeExec(`CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create tags');

  await safeExec(`CREATE TABLE IF NOT EXISTS source_tags (
    source_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (source_id, tag_id),
    CONSTRAINT fk_source_tags_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
    CONSTRAINT fk_source_tags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create source_tags');

  await safeExec(`CREATE TABLE IF NOT EXISTS source_questions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_id INT NOT NULL,
    prompt TEXT NOT NULL,
    question_type ENUM('multiple-choice','text') NOT NULL DEFAULT 'multiple-choice',
    text_answer TEXT NULL,
    text_answers_json LONGTEXT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_questions_source FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create source_questions');

  await ensureColumn('source_questions', 'question_type', "ENUM('multiple-choice','text') NOT NULL DEFAULT 'multiple-choice'", 'source_questions.add_question_type');
  await ensureColumn('source_questions', 'text_answer', 'TEXT NULL', 'source_questions.add_text_answer');
  await ensureColumn('source_questions', 'text_answers_json', 'LONGTEXT NULL', 'source_questions.add_text_answers_json');
  await ensureColumn('source_questions', 'display_order', 'INT NOT NULL DEFAULT 0', 'source_questions.add_display_order');
  await ensureColumn('source_questions', 'created_by', 'INT NULL', 'source_questions.add_created_by');
  await safeExec(
    'ALTER TABLE source_questions MODIFY COLUMN created_by INT NULL',
    'source_questions.ensure_created_by_nullable'
  );
  await safeExec(
    `ALTER TABLE source_questions
       ADD CONSTRAINT fk_source_questions_owner
       FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`,
    'source_questions.add_fk_owner'
  );
  await ensureIndex('source_questions', 'idx_source_questions_source', ['source_id'], 'source_questions.idx_source');
  await ensureIndex('source_questions', 'idx_source_questions_order', ['display_order'], 'source_questions.idx_order');

  await safeExec(`CREATE TABLE IF NOT EXISTS source_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question_id INT NOT NULL,
    answer_text TEXT NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_source_answers_question FOREIGN KEY (question_id) REFERENCES source_questions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, 'create source_answers');

  await ensureColumn('source_answers', 'display_order', 'INT NOT NULL DEFAULT 0', 'source_answers.add_display_order');
  await ensureIndex('source_answers', 'idx_source_answers_question', ['question_id'], 'source_answers.idx_question');
  await ensureIndex('source_answers', 'idx_source_answers_order', ['display_order'], 'source_answers.idx_order');

};

// Připojení k databázi
const createDbConnection = async () => {
  try {
    const connection = await mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'admin',
      database: process.env.DB_NAME || 'badatelsky_dejepis',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
      database: process.env.DB_NAME || 'badatelsky_dejepis',
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    console.log('Úspěšně připojeno k databázi');
    return connection;
  } catch (error) {
    console.error('Chyba při připojení k databázi:', error);
    process.exit(1);
  }
};

let db;
createDbConnection().then(async (connection) => {
  db = connection;
  try {
    await ensureSchema(db);
    console.log('DB schema ensured');
  } catch (schemaErr) {
    console.error('Nepodařilo se zajistit schéma DB:', schemaErr);
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Něco se pokazilo!' });
});

// Test
app.get('/api/test', (req, res) => {
  res.json({ message: 'API běží' });
});

// Vrátí unikátní roky (pro sidebar)
app.get('/api/years', async (req, res) => {
  try {
    const requester = getRequestUser(req);
    const conditions = ['year IS NOT NULL'];
    const params = [];
    if (!requester || requester.role !== 'admin') {
      if (requester) {
        conditions.push('(status = "published" OR owner_id = ?)');
        params.push(requester.id);
      } else {
        conditions.push("status = 'published'");
      }
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await db.query(`SELECT DISTINCT year FROM sources ${whereClause} ORDER BY year DESC`, params);
    const years = rows.map(r => r.year).filter(y => y !== null);
    res.json({ years });
  } catch (err) {
    console.error('Chyba při získávání let:', err);
    res.status(500).json({ error: 'Chyba při získávání let' });
  }
});

// Vrátí zdroje, volitelně filtrované podle roku
app.get('/api/sources', async (req, res) => {
  try {
    const year = req.query.year ? sanitizeYear(req.query.year) : null;
    const requester = getRequestUser(req);
    const clauses = [];
    const params = [];
    if (year !== null) {
      clauses.push('s.year = ?');
      params.push(year);
    }
    if (!requester || requester.role !== 'admin') {
      if (requester) {
        clauses.push('(s.status = "published" OR s.owner_id = ?)');
        params.push(requester.id);
      } else {
        clauses.push("s.status = 'published'");
      }
    }
    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const q = `SELECT s.id, s.title, s.abstract, s.summary, s.status, s.text, s.content_html, s.videos_json, s.year, s.location, s.owner_id, s.created_at, s.updated_at, s.published_at, u.username as owner_name, u.role as owner_role FROM sources s LEFT JOIN users u ON s.owner_id = u.id ${whereClause} ORDER BY s.created_at DESC`;
    const [rows] = await db.query(q, params);
    const enriched = rows.map((row) => attachVideosToSource(row));
    res.json({ sources: enriched });
  } catch (err) {
    console.error('Chyba při získávání zdrojů:', err);
    res.status(500).json({ error: 'Chyba při získávání zdrojů' });
  }
});

// Vrátí jeden zdroj podle id
app.get('/api/sources/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.query(
      `SELECT s.id, s.title, s.abstract, s.summary, s.status, s.text, s.content_json, s.content_html, s.videos_json, s.year, s.location,
        s.owner_id, s.created_at, s.updated_at, s.published_at, u.username as owner_name, u.role as owner_role
       FROM sources s
       LEFT JOIN users u ON s.owner_id = u.id
       WHERE s.id = ?`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pramen nenalezen' });
  const source = attachVideosToSource(rows[0]);
    const requester = getRequestUser(req);
    const isOwner = requester && String(requester.id) === String(source.owner_id);
    const isAdmin = requester && requester.role === 'admin';
    if (!isOwner && !isAdmin && source.status !== 'published') {
      return res.status(403).json({ error: 'Pramen není zveřejněn' });
    }
    res.json({ source, aiModel: OPENAI_MODEL });
  } catch (err) {
    console.error('Chyba při získávání pramene:', err);
    res.status(500).json({ error: 'Chyba při získávání pramene' });
  }
});

app.get('/api/sources/:id/quiz', async (req, res) => {
  try {
    const sourceId = Number(req.params.id);
    if (!Number.isFinite(sourceId)) {
      return res.status(400).json({ error: 'Neplatné ID pramene' });
    }

    const [sourceRows] = await db.query('SELECT id, owner_id, status FROM sources WHERE id = ?', [sourceId]);
    if (!sourceRows.length) {
      return res.status(404).json({ error: 'Pramen nenalezen' });
    }
    const source = sourceRows[0];
    const requester = getRequestUser(req);
    const isOwner = requester && String(requester.id) === String(source.owner_id);
    const isAdmin = requester && requester.role === 'admin';
    if (source.status !== 'published' && !isOwner && !isAdmin) {
      return res.status(403).json({ error: 'K tomuto prameni nemáte přístup' });
    }

    const [questionRows] = await db.query(
      `SELECT id, prompt, display_order, question_type, text_answer, text_answers_json, reference_answer
         FROM source_questions
        WHERE source_id = ?
        ORDER BY display_order ASC, id ASC`,
      [sourceId]
    );

    if (!questionRows.length) {
      return res.json({ questions: [] });
    }

    const questionIds = questionRows
      .filter((row) => (row.question_type || 'multiple-choice') === 'multiple-choice')
      .map((row) => row.id);
    let answerRows = [];
    if (questionIds.length) {
      const placeholders = questionIds.map(() => '?').join(',');
      const [rowsAnswers] = await db.query(
        `SELECT id, question_id, answer_text, is_correct, display_order
           FROM source_answers
          WHERE question_id IN (${placeholders})
          ORDER BY display_order ASC, id ASC`,
        questionIds
      );
      answerRows = rowsAnswers;
    }

    const questions = questionRows.map((q) => {
      const type = allowedQuestionTypes.has(q.question_type) ? q.question_type : 'multiple-choice';
      const textAnswers = [];
      if (type === 'text') {
        if (q.text_answers_json) {
          try {
            const parsed = JSON.parse(q.text_answers_json);
            if (Array.isArray(parsed)) {
              parsed.forEach((value) => {
                if (typeof value === 'string' && value.trim().length) {
                  textAnswers.push(value.trim());
                }
              });
            }
          } catch (parseErr) {
            console.warn('Neplatný JSON s textovými odpověďmi bude ignorován:', parseErr);
          }
        }
        if (!textAnswers.length && typeof q.text_answer === 'string' && q.text_answer.trim().length) {
          textAnswers.push(q.text_answer.trim());
        }
      }

      const answers = type === 'multiple-choice'
        ? answerRows
            .filter((a) => a.question_id === q.id)
            .map((a) => ({
              id: a.id,
              text: a.answer_text,
              is_correct: !!a.is_correct,
              display_order: a.display_order,
            }))
        : [];

      // For AI understanding questions, include reference answer only for owners/admins
      const referenceAnswer = type === 'ai-understanding' && (isOwner || isAdmin)
        ? (q.reference_answer || '')
        : undefined;

      return {
        id: q.id,
        prompt: q.prompt,
        display_order: q.display_order,
        type,
        textAnswers,
        answers,
        ...(type === 'ai-understanding' && { referenceAnswer }),
      };
    });

    res.json({ questions });
  } catch (err) {
    console.error('Chyba při načítání kvízu:', err);
    res.status(500).json({ error: 'Chyba při načítání kvízu' });
  }
});

app.post('/api/sources/:id/quiz/generate', verifyToken, async (req, res) => {
  if (!openaiClient) {
    return res.status(503).json({ error: 'AI generátor není nakonfigurován (chybí OPENAI_API_KEY)' });
  }

  const sourceId = Number(req.params.id);
  if (!Number.isFinite(sourceId)) {
    return res.status(400).json({ error: 'Neplatné ID pramene' });
  }

  try {
    const [rows] = await db.query(
      'SELECT id, owner_id, title, summary, text, content_html FROM sources WHERE id = ?',
      [sourceId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Pramen nenalezen' });
    }

    const source = rows[0];
    const isOwner = Number(req.user.id) === Number(source.owner_id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Nemáte oprávnění generovat otázky pro tento pramen' });
    }

    const baseText = typeof source.text === 'string' && source.text.trim().length
      ? source.text.trim()
      : stripHtml(source.content_html || '');
    if (!baseText) {
      return res.status(400).json({ error: 'Pramen nemá dostatek textu pro generování otázek' });
    }

    const excerpt = truncateForAiContext(baseText);
    const summary = typeof source.summary === 'string' ? source.summary.trim() : '';
    
    // Support for separate MC and text question counts
    const requestedMcCount = Math.min(Math.max(Number(req.body?.mcCount) || 0, 0), MAX_AI_QUESTIONS);
    const requestedTextCount = Math.min(Math.max(Number(req.body?.textCount) || 0, 0), MAX_AI_QUESTIONS);
    const totalFromSplit = requestedMcCount + requestedTextCount;
    
    // If split counts provided, use them; otherwise fall back to generic count
    const questionCount = totalFromSplit > 0 
      ? Math.min(totalFromSplit, MAX_AI_QUESTIONS)
      : Math.min(Math.max(Number(req.body?.count) || 3, 1), MAX_AI_QUESTIONS);
    
    const mcCount = totalFromSplit > 0 ? requestedMcCount : Math.ceil(questionCount * 0.7);
    const textCount = totalFromSplit > 0 ? requestedTextCount : questionCount - mcCount;

    const requestOptions = buildAiRequestOptions();
    const completion = await openaiClient.chat.completions.create({
      ...requestOptions,
      messages: [
        {
          role: 'system',
          content: `Jsi zkušený středoškolský učitel dějepisu. Tvým úkolem je vytvářet kvalitní kvízové otázky v češtině na základě historického textu.

PRAVIDLA PRO TVORBU OTÁZEK:
1. Otázky musí být jasné, srozumitelné a fakticky správné
2. Otázky se musí přímo vztahovat k obsahu poskytnutého textu
3. Nepoužívej vágní nebo zavádějící formulace
4. Každá otázka musí mít jednoznačně správnou odpověď

PRO OTÁZKY TYPU "multiple-choice":
- Vytvoř přesně 4 možné odpovědi
- Právě JEDNA odpověď musí být správná (is_correct: true)
- Ostatní 3 odpovědi musí být chybné, ale věrohodné
- Chybné odpovědi by měly být podobného typu jako správná (např. všechny jsou data, nebo všechny jsou jména)

PRO OTÁZKY TYPU "text":
- Odpověď by měla být krátká (1-3 slova)
- Uveď všechny přijatelné varianty odpovědi v poli "textAnswers"
- Například: ["Karel IV.", "Karel IV", "Karel Čtvrtý"]

FORMÁT ODPOVĚDI:
Vrať POUZE validní JSON v tomto formátu:
{
  "questions": [
    {
      "prompt": "Text otázky končící otazníkem?",
      "type": "multiple-choice",
      "answers": [
        {"text": "Správná odpověď", "is_correct": true},
        {"text": "Chybná odpověď 1", "is_correct": false},
        {"text": "Chybná odpověď 2", "is_correct": false},
        {"text": "Chybná odpověď 3", "is_correct": false}
      ],
      "textAnswers": []
    },
    {
      "prompt": "Otázka s textovou odpovědí?",
      "type": "text",
      "answers": [],
      "textAnswers": ["Správná odpověď", "Alternativní zápis"]
    }
  ]
}`,
        },
        {
          role: 'user',
          content: `Vytvoř přesně ${questionCount} kvalitních kvízových otázek k následujícímu historickému prameni.

POŽADAVKY NA TYPY OTÁZEK:
- Vytvoř PŘESNĚ ${mcCount} otázek typu "multiple-choice" (výběr ze 4 možností)
- Vytvoř PŘESNĚ ${textCount} otázek typu "text" (krátká textová odpověď)

NÁZEV PRAMENE: ${source.title || 'Bez názvu'}

SHRNUTÍ: ${summary || 'Není k dispozici'}

OBSAH PRAMENE:
${excerpt}

Odpověz POUZE validním JSON objektem podle výše uvedeného formátu.`,
        },
      ],
    });

    const messageContent = completion?.choices?.[0]?.message?.content;
    const normalizedContent = Array.isArray(messageContent)
      ? messageContent.map((entry) => entry?.text || '').join('\n')
      : messageContent;
    const parsed = parseAiJson(normalizedContent);
    const questions = sanitizeAiQuestions(parsed?.questions || parsed?.data || []);

    if (!questions.length) {
      return res.status(502).json({ error: 'AI nevrátila použitelné otázky, zkuste to prosím znovu.' });
    }

    res.json({ questions });
  } catch (err) {
    console.error('Chyba při generování AI otázek:', err);
    res.status(500).json({ error: 'Nepodařilo se vygenerovat otázky. Zkuste to prosím později.' });
  }
});

// Aktualizace pramene (vlastník nebo admin)
app.put('/api/sources/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const {
      title,
      abstract,
      summary,
      status,
      year,
      location,
      text,
      content_json,
      content_html,
      videos
    } = req.body;

    const [rows] = await db.query('SELECT owner_id, status AS existing_status, published_at FROM sources WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Pramen nenalezen' });
    const ownerId = rows[0].owner_id;
    if (req.user.id !== ownerId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Nemáte oprávnění upravovat tento pramen' });
    }

    const normalizedYear = sanitizeYear(year);
    const normalizedStatus = allowedSourceStatuses.has((status || '').toLowerCase())
      ? (status || '').toLowerCase()
      : rows[0].existing_status || 'draft';

  const preparedContentJson = typeof content_json === 'string' ? content_json : (content_json ? JSON.stringify(content_json) : null);
  const preparedContentHtml = typeof content_html === 'string' ? content_html : null;
  const sanitizedVideos = sanitizeSourceVideos(Array.isArray(videos) ? videos : []);
  const serializedVideos = sanitizedVideos.length ? JSON.stringify(sanitizedVideos) : null;
    const normalizedText = typeof text === 'string' && text.trim().length
      ? text.trim()
      : (preparedContentHtml ? stripHtml(preparedContentHtml) : null);

    if (!normalizedText) {
      return res.status(400).json({ error: 'Obsah pramene nesmí být prázdný' });
    }

    const resolvedSummary = deriveSummary(summary, preparedContentHtml, normalizedText);
    let publishedAt = rows[0].published_at;
    if (normalizedStatus === 'published' && !publishedAt) {
      publishedAt = new Date();
    }
    if (normalizedStatus !== 'published') {
      publishedAt = null;
    }

    await db.query(
      `UPDATE sources
       SET title = ?, abstract = ?, summary = ?, status = ?, year = ?, location = ?, text = ?, content_json = ?, content_html = ?, videos_json = ?, updated_at = NOW(), published_at = ?
       WHERE id = ?`,
      [
        title || null,
        abstract || null,
        resolvedSummary,
        normalizedStatus,
        normalizedYear,
        location || null,
        normalizedText,
        preparedContentJson,
        preparedContentHtml,
        serializedVideos,
        publishedAt,
        id
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Chyba při aktualizaci pramene:', err);
    res.status(500).json({ error: 'Chyba při aktualizaci pramene' });
  }
});

app.put('/api/sources/:id/quiz', verifyToken, async (req, res) => {
  const sourceId = Number(req.params.id);
  if (!Number.isFinite(sourceId)) {
    return res.status(400).json({ error: 'Neplatné ID pramene' });
  }

  try {
    const [sourceRows] = await db.query('SELECT owner_id FROM sources WHERE id = ?', [sourceId]);
    if (!sourceRows.length) {
      return res.status(404).json({ error: 'Pramen nenalezen' });
    }
    const ownerId = sourceRows[0].owner_id;
    const isOwner = Number(req.user.id) === Number(ownerId);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Nemáte oprávnění upravovat otázky u tohoto pramene' });
    }

    const incoming = req.body?.questions;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'Očekávám pole otázek' });
    }
    if (incoming.length > MAX_QUIZ_QUESTIONS) {
      return res.status(400).json({ error: `Maximální počet otázek je ${MAX_QUIZ_QUESTIONS}` });
    }

    const sanitizedQuestions = [];
    for (let i = 0; i < incoming.length; i += 1) {
      const question = incoming[i];
      const prompt = typeof question?.prompt === 'string' ? question.prompt.trim() : '';
      if (!prompt) {
        return res.status(400).json({ error: `Otázka č. ${i + 1} nemá text` });
      }

      const rawAnswersArray = Array.isArray(question.answers) ? question.answers : [];
      const hasChoiceOptions = rawAnswersArray.some((ans) => typeof ans?.text === 'string' && ans.text.trim().length);

      const textAnswersRaw = Array.isArray(question?.textAnswers) ? question.textAnswers : [];
      const normalizedTextAnswers = textAnswersRaw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length);
      const uniqueTextAnswers = Array.from(new Set(normalizedTextAnswers));
      const hasTextAnswers = uniqueTextAnswers.length > 0;

      const typeRaw = typeof question?.type === 'string' ? question.type.trim().toLowerCase() : 'multiple-choice';
      let type = allowedQuestionTypes.has(typeRaw) ? typeRaw : 'multiple-choice';
      if (type !== 'text' && type !== 'ai-understanding' && hasTextAnswers && !hasChoiceOptions) {
        type = 'text';
      }

      // Handle AI understanding questions
      if (type === 'ai-understanding') {
        const referenceAnswer = typeof question?.referenceAnswer === 'string' ? question.referenceAnswer.trim() : '';
        if (!referenceAnswer) {
          return res.status(400).json({ error: `AI otázka "${prompt}" musí mít referenční odpověď` });
        }
        sanitizedQuestions.push({
          prompt,
          type,
          answers: [],
          textAnswers: [],
          referenceAnswer,
        });
        continue;
      }

      if (type === 'multiple-choice') {
        const answersFiltered = rawAnswersArray
          .map((ans, idx) => ({
            text: typeof ans?.text === 'string' ? ans.text.trim() : '',
            is_correct: !!ans?.is_correct,
            originalIndex: idx,
          }))
          .filter((ans) => ans.text.length);

        if (answersFiltered.length < MIN_ANSWERS_PER_QUESTION) {
          return res.status(400).json({ error: `Otázka "${prompt}" musí mít alespoň ${MIN_ANSWERS_PER_QUESTION} odpovědi` });
        }
        if (answersFiltered.length > MAX_ANSWERS_PER_QUESTION) {
          return res.status(400).json({ error: `Otázka "${prompt}" může mít maximálně ${MAX_ANSWERS_PER_QUESTION} odpovědí` });
        }
        if (!answersFiltered.some((ans) => ans.is_correct)) {
          return res.status(400).json({ error: `Otázka "${prompt}" musí mít alespoň jednu správnou odpověď` });
        }
        sanitizedQuestions.push({
          prompt,
          type,
          answers: answersFiltered.map((ans) => ({ text: ans.text, is_correct: ans.is_correct })),
          textAnswers: [],
        });
      } else {
        if (!uniqueTextAnswers.length) {
          return res.status(400).json({ error: `Textová otázka "${prompt}" musí mít alespoň jednu správnou odpověď` });
        }
        if (uniqueTextAnswers.length > MAX_TEXT_ANSWERS) {
          return res.status(400).json({ error: `Textová otázka "${prompt}" může mít maximálně ${MAX_TEXT_ANSWERS} správných odpovědí` });
        }
        sanitizedQuestions.push({
          prompt,
          type,
          answers: [],
          textAnswers: uniqueTextAnswers,
        });
      }
    }

    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query('DELETE FROM source_questions WHERE source_id = ?', [sourceId]);

      for (let qIndex = 0; qIndex < sanitizedQuestions.length; qIndex += 1) {
        const question = sanitizedQuestions[qIndex];
        const textAnswer = question.type === 'text' ? question.textAnswers[0] : null;
        const textAnswersJson = question.type === 'text' ? JSON.stringify(question.textAnswers) : null;
        const referenceAnswer = question.type === 'ai-understanding' ? question.referenceAnswer : null;
        const [insertQuestion] = await connection.query(
          'INSERT INTO source_questions (source_id, prompt, question_type, text_answer, text_answers_json, reference_answer, display_order, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [sourceId, question.prompt, question.type, textAnswer, textAnswersJson, referenceAnswer, qIndex, req.user.id]
        );
        const questionId = insertQuestion.insertId;
        if (question.type === 'multiple-choice') {
          for (let aIndex = 0; aIndex < question.answers.length; aIndex += 1) {
            const answer = question.answers[aIndex];
            await connection.query(
              'INSERT INTO source_answers (question_id, answer_text, is_correct, display_order) VALUES (?, ?, ?, ?)',
              [questionId, answer.text, answer.is_correct ? 1 : 0, aIndex]
            );
          }
        }
      }

      await connection.commit();
      res.json({ success: true, count: sanitizedQuestions.length });
    } catch (err) {
      await connection.rollback();
      console.error('Chyba při ukládání kvízu:', err);
      res.status(500).json({ error: 'Chyba při ukládání otázek' });
    } finally {
      connection.release();
    }
  } catch (outerErr) {
    console.error('Chyba při zpracování požadavku na kvíz:', outerErr);
    res.status(500).json({ error: 'Chyba při zpracování požadavku' });
  }
});

// AI Understanding - vyhodnocení odpovědi
app.post('/api/quiz/evaluate-ai', verifyToken, async (req, res) => {
  if (!openaiClient) {
    return res.status(503).json({ error: 'AI služba není nakonfigurována' });
  }

  const { questionId, userAnswer } = req.body;
  
  if (!questionId || typeof userAnswer !== 'string' || !userAnswer.trim()) {
    return res.status(400).json({ error: 'Chybí ID otázky nebo odpověď' });
  }

  try {
    // Načti otázku a referenční odpověď
    const [questionRows] = await db.query(
      'SELECT prompt, reference_answer FROM source_questions WHERE id = ? AND question_type = ?',
      [questionId, 'ai-understanding']
    );
    
    if (!questionRows.length) {
      return res.status(404).json({ error: 'Otázka nenalezena' });
    }

    const question = questionRows[0];
    const referenceAnswer = question.reference_answer;

    if (!referenceAnswer) {
      return res.status(400).json({ error: 'Otázka nemá referenční odpověď' });
    }

    const requestOptions = buildAiRequestOptions();
    const completion = await openaiClient.chat.completions.create({
      ...requestOptions,
      messages: [
        {
          role: 'system',
          content: `Jsi zkušený učitel dějepisu, který vyhodnocuje odpovědi studentů na otevřené otázky.

Tvým úkolem je porovnat odpověď studenta s referenční odpovědí a určit, do jaké míry jsou si obsahově podobné.

PRAVIDLA PRO VYHODNOCENÍ:
1. Porovnávej OBSAH a VÝZNAM, ne přesnou formulaci
2. Odpověď nemusí být identická, stačí, když zachycuje klíčové body
3. Drobné faktické chyby nebo opomenutí snižují shodu
4. Úplně chybná odpověď = 0%
5. Částečně správná odpověď = 30-70%
6. Většinově správná odpověď = 70-90%
7. Plně správná odpověď (i jinak formulovaná) = 90-100%

FORMÁT ODPOVĚDI:
Vrať POUZE validní JSON:
{
  "matchPercentage": číslo od 0 do 100,
  "feedback": "Krátké vysvětlení hodnocení v češtině (1-2 věty)",
  "keyPointsMissed": ["bod 1", "bod 2"] nebo [],
  "keyPointsCorrect": ["bod 1", "bod 2"] nebo []
}`,
        },
        {
          role: 'user',
          content: `OTÁZKA: ${question.prompt}

REFERENČNÍ ODPOVĚĎ (správná):
${referenceAnswer}

ODPOVĚĎ STUDENTA:
${userAnswer.trim()}

Vyhodnoť odpověď studenta a vrať JSON s procentuální shodou a zpětnou vazbou.`,
        },
      ],
    });

    const messageContent = completion?.choices?.[0]?.message?.content;
    const normalizedContent = Array.isArray(messageContent)
      ? messageContent.map((entry) => entry?.text || '').join('\n')
      : messageContent;
    
    const parsed = parseAiJson(normalizedContent);
    
    if (!parsed || typeof parsed.matchPercentage !== 'number') {
      return res.status(502).json({ error: 'AI nevrátila platné vyhodnocení' });
    }

    const matchPercentage = Math.max(0, Math.min(100, Math.round(parsed.matchPercentage)));
    const isCorrect = matchPercentage >= AI_UNDERSTANDING_THRESHOLD;

    res.json({
      isCorrect,
      matchPercentage,
      feedback: parsed.feedback || (isCorrect ? 'Správně!' : 'Odpověď není dostatečně přesná.'),
      keyPointsMissed: Array.isArray(parsed.keyPointsMissed) ? parsed.keyPointsMissed : [],
      keyPointsCorrect: Array.isArray(parsed.keyPointsCorrect) ? parsed.keyPointsCorrect : [],
      threshold: AI_UNDERSTANDING_THRESHOLD,
    });
  } catch (err) {
    console.error('Chyba při AI vyhodnocení:', err);
    res.status(500).json({ error: 'Nepodařilo se vyhodnotit odpověď' });
  }
});

// Smazání pramene (vlastník nebo admin)
app.delete('/api/sources/:id', verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await db.query('SELECT owner_id FROM sources WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Pramen nenalezen' });
    const ownerId = rows[0].owner_id;
    if (req.user.id !== ownerId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Nemáte oprávnění smazat tento pramen' });
    }
    await db.query('DELETE FROM sources WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Chyba při mazání pramene:', err);
    res.status(500).json({ error: 'Chyba při mazání pramene' });
  }
});

// Registrace
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'Všechna pole jsou povinná' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (username, email, password, role, created_at) VALUES (?, ?, ?, ?, NOW())',
      [username, email, hash, role]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Chyba při registraci:', error && error.message ? error.message : error);
    // Pokud jde o duplicitní email, mysql vrací errno 1062
    if (error && error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Email již existuje' });
    }
    res.status(500).json({ error: 'Nastal problém při registraci (viz server log)' });
  }
});

// Vytvoření nového zdroje (pramene) - vyžaduje autorizaci
app.post('/api/sources', verifyToken, async (req, res) => {
  try {
    const {
      title,
      abstract,
      summary,
      status,
      year,
      location,
      text,
      content_json,
      content_html,
      videos
    } = req.body;

  const preparedContentJson = typeof content_json === 'string' ? content_json : (content_json ? JSON.stringify(content_json) : null);
  const preparedContentHtml = typeof content_html === 'string' ? content_html : null;
  const sanitizedVideos = sanitizeSourceVideos(Array.isArray(videos) ? videos : []);
  const serializedVideos = sanitizedVideos.length ? JSON.stringify(sanitizedVideos) : null;
    const normalizedText = typeof text === 'string' && text.trim().length
      ? text.trim()
      : stripHtml(preparedContentHtml || '');

    if (!normalizedText) {
      return res.status(400).json({ error: 'Text pramene je povinný' });
    }

    const normalizedYear = sanitizeYear(year);
    const normalizedStatus = allowedSourceStatuses.has((status || '').toLowerCase()) ? (status || '').toLowerCase() : 'draft';
    const resolvedSummary = deriveSummary(summary, preparedContentHtml, normalizedText);

    const ownerId = req.user.id;
    const [result] = await db.query(
      `INSERT INTO sources
       (owner_id, title, abstract, summary, status, year, location, text, content_json, content_html, videos_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ownerId,
        title || null,
        abstract || null,
        resolvedSummary,
        normalizedStatus,
        normalizedYear,
        location || null,
        normalizedText,
        preparedContentJson,
        preparedContentHtml,
        serializedVideos
      ]
    );

    res.json({ success: true, id: result.insertId });
  } catch (err) {
    console.error('Chyba při vkládání zdroje:', err);
    res.status(500).json({ error: 'Chyba při vkládání zdroje' });
  }
});

// Debug endpoint: vypíše uživatele (pouze pro vývoj)
app.get('/api/debug/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, email, role, status, last_login, created_at FROM users');
    res.json({ users: rows });
  } catch (err) {
    console.error('Chyba při čtení uživatelů:', err);
    res.status(500).json({ error: 'Chyba při čtení uživatelů' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email a heslo jsou povinné' });
    }

    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) {
      console.log('Login: uživatel nenalezen', email);
      return res.status(401).json({ error: 'Nesprávný email nebo heslo' });
    }

    const user = rows[0];
    console.log('Login: nalezený uživatel', user);
    const validPassword = await bcrypt.compare(password, user.password);
    console.log('Login: porovnání hesla', password, user.password, validPassword);
    if (!validPassword) {
      return res.status(401).json({ error: 'Nesprávný email nebo heslo' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    try {
      await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    } catch (updateErr) {
      console.warn('Nepodařilo se zapsat last_login:', updateErr?.message || updateErr);
    }

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Chyba při přihlášení:', error);
    res.status(500).json({ error: 'Chyba serveru při přihlášení' });
  }
});

    

// Ověření tokenu middleware (deklarováno jako funkce, aby bylo hoistované)
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ error: 'Není poskytnut přístupový token' });
  }
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nesprávný formát autorizace (očekávám Bearer token)' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Není poskytnut přístupový token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT verify error:', error && error.message ? error.message : error);
    return res.status(401).json({ error: 'Neplatný nebo expirovaný token' });
  }
}

// Chráněný endpoint pro získání informací o uživateli
app.get('/api/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, email, role, status, last_login, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Uživatel nenalezen' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Chyba při získávání dat uživatele:', error);
    res.status(500).json({ error: 'Chyba serveru' });
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});

-- =====================================================
-- Создание базы данных для Tender Monitor
-- PostgreSQL 17
-- =====================================================

-- ВАЖНО: Сначала создайте базу данных в pgAdmin:
-- 1. Откройте pgAdmin
-- 2. Подключитесь к серверу PostgreSQL
-- 3. ПКМ на Databases → Create → Database
-- 4. Имя: tender_monitor
-- 5. Owner: postgres (или ваш пользователь)
-- 6. Сохранить

-- После создания БД выполните этот скрипт:
-- Откройте Query Tool для базы tender_monitor и запустите:

-- =====================================================
-- ТАБЛИЦЫ
-- =====================================================

-- Основная таблица тендеров
CREATE TABLE IF NOT EXISTS tenders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    deadline TIMESTAMP,
    link TEXT,
    source TEXT NOT NULL CHECK (source IN ('anbud', 'doffin', 'ted', 'mercell')),
    scraped_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    price NUMERIC(15, 2),
    location TEXT,
    contractor TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_tenders_source ON tenders(source);
CREATE INDEX IF NOT EXISTS idx_tenders_scraped_at ON tenders(scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_deadline ON tenders(deadline);
CREATE INDEX IF NOT EXISTS idx_tenders_category ON tenders(category);
CREATE INDEX IF NOT EXISTS idx_tenders_title ON tenders USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_tenders_description ON tenders USING gin(to_tsvector('english', description));

-- Избранное
CREATE TABLE IF NOT EXISTS favorites (
    tender_id TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
    favorited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_favorites_favorited_at ON favorites(favorited_at DESC);

-- Просмотренные
CREATE TABLE IF NOT EXISTS viewed (
    tender_id TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_viewed_viewed_at ON viewed(viewed_at DESC);

-- Заметки
CREATE TABLE IF NOT EXISTS notes (
    tender_id TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Статусы тендеров
CREATE TABLE IF NOT EXISTS tender_statuses (
    tender_id TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('new', 'in_progress', 'bid_submitted', 'won', 'lost', 'cancelled')),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tender_statuses_status ON tender_statuses(status);

-- Приоритеты
CREATE TABLE IF NOT EXISTS priorities (
    tender_id TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_priorities_priority ON priorities(priority);

-- Теги
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    tender_id TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    tag_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tender_id, tag_name)
);

CREATE INDEX IF NOT EXISTS idx_tags_tender_id ON tags(tender_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag_name ON tags(tag_name);

-- Напоминания
CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    tender_id TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
    remind_before_days INTEGER NOT NULL CHECK (remind_before_days > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notified BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_reminders_tender_id ON reminders(tender_id);
CREATE INDEX IF NOT EXISTS idx_reminders_notified ON reminders(notified) WHERE notified = FALSE;

-- Пресеты фильтров
CREATE TABLE IF NOT EXISTS filter_presets (
    name TEXT PRIMARY KEY,
    filters JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ПРЕДСТАВЛЕНИЯ (VIEWS)
-- =====================================================

-- Полная информация о тендере с метаданными
CREATE OR REPLACE VIEW tenders_full AS
SELECT 
    t.*,
    CASE WHEN f.tender_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_favorite,
    CASE WHEN v.tender_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_viewed,
    n.note_text,
    ts.status,
    p.priority,
    ARRAY_AGG(tg.tag_name) FILTER (WHERE tg.tag_name IS NOT NULL) AS tags
FROM tenders t
LEFT JOIN favorites f ON t.id = f.tender_id
LEFT JOIN viewed v ON t.id = v.tender_id
LEFT JOIN notes n ON t.id = n.tender_id
LEFT JOIN tender_statuses ts ON t.id = ts.tender_id
LEFT JOIN priorities p ON t.id = p.tender_id
LEFT JOIN tags tg ON t.id = tg.tender_id
GROUP BY t.id, f.tender_id, v.tender_id, n.note_text, ts.status, p.priority;

-- Статистика по источникам
CREATE OR REPLACE VIEW stats_by_source AS
SELECT 
    source,
    COUNT(*) AS total_count,
    COUNT(CASE WHEN scraped_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours' THEN 1 END) AS last_24h,
    COUNT(CASE WHEN scraped_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 END) AS last_7days,
    COUNT(CASE WHEN deadline IS NOT NULL THEN 1 END) AS with_deadline
FROM tenders
GROUP BY source
ORDER BY total_count DESC;

-- Статистика по категориям
CREATE OR REPLACE VIEW stats_by_category AS
SELECT 
    COALESCE(category, 'Без категории') AS category,
    COUNT(*) AS count,
    COUNT(CASE WHEN scraped_at >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 END) AS last_7days
FROM tenders
GROUP BY category
ORDER BY count DESC;

-- =====================================================
-- ФУНКЦИИ
-- =====================================================

-- Функция для полнотекстового поиска
CREATE OR REPLACE FUNCTION search_tenders(search_query TEXT)
RETURNS TABLE (
    id TEXT,
    title TEXT,
    description TEXT,
    source TEXT,
    scraped_at TIMESTAMP,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.title,
        t.description,
        t.source,
        t.scraped_at,
        ts_rank(
            to_tsvector('english', COALESCE(t.title, '') || ' ' || COALESCE(t.description, '')),
            plainto_tsquery('english', search_query)
        ) AS rank
    FROM tenders t
    WHERE to_tsvector('english', COALESCE(t.title, '') || ' ' || COALESCE(t.description, '')) 
        @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC, t.scraped_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Триггер для автообновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tender_statuses_updated_at BEFORE UPDATE ON tender_statuses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_priorities_updated_at BEFORE UPDATE ON priorities
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ПРАВА ДОСТУПА (опционально)
-- =====================================================

-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;

-- =====================================================
-- ГОТОВО!
-- =====================================================

-- Проверка созданных объектов:
SELECT 'Tables:', COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL
SELECT 'Views:', COUNT(*) FROM information_schema.views WHERE table_schema = 'public'
UNION ALL
SELECT 'Indexes:', COUNT(*) FROM pg_indexes WHERE schemaname = 'public';

-- Посмотреть все таблицы:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

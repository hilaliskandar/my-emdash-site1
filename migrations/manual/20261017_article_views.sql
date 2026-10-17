-- Dados agregados por artigo e dia: nenhuma informacao individual e armazenada.
CREATE TABLE IF NOT EXISTS radar_article_views (
  entry_id TEXT NOT NULL,
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0 CHECK (views >= 0),
  PRIMARY KEY (entry_id, day)
);
CREATE INDEX IF NOT EXISTS radar_article_views_day_idx ON radar_article_views(day);

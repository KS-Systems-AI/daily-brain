-- Full-Text Search Index auf Notizen (Titel + Inhalt), deutsche Konfiguration
CREATE INDEX IF NOT EXISTS notes_fts
  ON notes
  USING gin(to_tsvector('german', coalesce(title, '') || ' ' || coalesce(content_text, '')));

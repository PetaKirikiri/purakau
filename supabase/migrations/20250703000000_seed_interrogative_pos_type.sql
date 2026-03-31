-- Interrogatives as a POS type (Words tab + tagging like other types).
INSERT INTO pos_types (id, code, label, description, color)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM pos_types), 'INTERROG', 'Interrogative', 'Question word (e.g. wai, hea, aha, he aha)', '#0d9488'
WHERE NOT EXISTS (SELECT 1 FROM pos_types WHERE code = 'INTERROG');

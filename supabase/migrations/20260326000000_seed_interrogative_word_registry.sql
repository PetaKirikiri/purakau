-- Interrogative POS + canonical interrogatives in word_registry (matches src/lib/questionTemplates.ts INTERROGATIVE_OPTIONS).
-- word_registry trigger normalizes word_text (lowercase, strip punct/whitespace).

INSERT INTO pos_types (id, code, label, description, color)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM pos_types), 'INTERROG', 'Interrogative',
  'Question word (e.g. wai, hea, aha, he aha)', '#0d9488'
WHERE NOT EXISTS (SELECT 1 FROM pos_types WHERE code = 'INTERROG');

INSERT INTO word_registry (word_text, pos_types, metadata, language)
SELECT
  v.surface,
  jsonb_build_array(
    jsonb_build_object(
      'pos_type_id',
      pt.id,
      'code',
      pt.code
    )
  ),
  '{}'::jsonb,
  'mi'
FROM unnest(
  ARRAY[
    'wai',
    'hea',
    'hia',
    'aha',
    'tokohia',
    'tēhea',
    'ia',
    'ko wai',
    'he aha',
    'hei hea',
    'nō hea',
    'e hia',
    'i hea'
  ]
) AS v(surface)
CROSS JOIN LATERAL (
  SELECT id, code
  FROM pos_types
  WHERE code = 'INTERROG'
  LIMIT 1
) pt
ON CONFLICT (word_text) DO UPDATE SET
  pos_types = CASE
    WHEN EXISTS (
      SELECT 1
      FROM jsonb_array_elements(word_registry.pos_types) elem
      WHERE (elem->>'pos_type_id')::int = (
          SELECT id
          FROM pos_types
          WHERE code = 'INTERROG'
          LIMIT 1
        )
    ) THEN word_registry.pos_types
    ELSE word_registry.pos_types || jsonb_build_array(
      jsonb_build_object(
        'pos_type_id',
        (SELECT id FROM pos_types WHERE code = 'INTERROG' LIMIT 1),
        'code',
        'INTERROG'
      )
    )
  END;

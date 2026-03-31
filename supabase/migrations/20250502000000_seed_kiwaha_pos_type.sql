-- Kīwaha as a normal POS type (color/label in Words like other POS).
INSERT INTO pos_types (id, code, label, description, color)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM pos_types), 'KIWHA', 'Kīwaha', 'Idiomatic phrase / fixed expression', '#a16207'
WHERE NOT EXISTS (SELECT 1 FROM pos_types WHERE code = 'KIWHA');

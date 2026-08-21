-- Align the invoice sequence with rows created before sequence-based
-- numbering existed. Fresh installs: count=0 → next value is 1.
SELECT setval('invoice_number_seq', GREATEST((SELECT COUNT(*) + 1 FROM "Invoice"), 1), false);

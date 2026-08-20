-- Append-only enforcement: compliance-relevant history tables must never be
-- silently altered, not even by administrators or the application itself.

CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table "%": % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_append_only
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

CREATE TRIGGER transaction_state_event_append_only
  BEFORE UPDATE OR DELETE ON "TransactionStateEvent"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

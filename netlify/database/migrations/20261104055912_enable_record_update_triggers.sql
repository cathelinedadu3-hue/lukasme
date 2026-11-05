-- Preserve immutable financial/audit history; timestamp changes to mutable records.
CREATE FUNCTION horizon_touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER businesses_touch_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION horizon_touch_updated_at();
CREATE TRIGGER members_touch_updated_at BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION horizon_touch_updated_at();
CREATE TRIGGER contacts_touch_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION horizon_touch_updated_at();
CREATE TRIGGER products_touch_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION horizon_touch_updated_at();
CREATE TRIGGER employees_touch_updated_at BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION horizon_touch_updated_at();
CREATE TRIGGER reminders_touch_updated_at BEFORE UPDATE ON reminders FOR EACH ROW EXECUTE FUNCTION horizon_touch_updated_at();

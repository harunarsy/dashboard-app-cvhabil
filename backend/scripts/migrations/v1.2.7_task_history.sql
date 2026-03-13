-- Migration v1.2.7: Add task history and soft delete
ALTER TABLE tasks ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;

CREATE TABLE task_history (
    id SERIAL PRIMARY KEY,
    task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- 'created', 'updated', 'status_change', 'moved_to_trash'
    old_value JSONB,
    new_value JSONB,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger for basic history logging
CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO task_history(task_id, action, new_value)
        VALUES (NEW.id, 'created', to_jsonb(NEW));
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status <> NEW.status) THEN
            INSERT INTO task_history(task_id, action, old_value, new_value)
            VALUES (NEW.id, 'status_change', jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
        ELSE
            INSERT INTO task_history(task_id, action, old_value, new_value)
            VALUES (NEW.id, 'updated', to_jsonb(OLD), to_jsonb(NEW));
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_log_task_changes
AFTER INSERT OR UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION log_task_changes();

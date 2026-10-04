-- AIDEV-NOTE: Users are provisioned offline until real sign-in exists; the private pilot has ten users maximum.
CREATE TRIGGER user_cap BEFORE INSERT ON users
WHEN (SELECT count(*) FROM users)>=10 AND NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.id)
BEGIN SELECT RAISE(ABORT,'user_limit'); END;

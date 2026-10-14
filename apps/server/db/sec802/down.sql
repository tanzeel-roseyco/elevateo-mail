SET LOCAL ROLE elevateo_owner;
DROP FUNCTION app.change_organization_role(text,uuid,integer,text);
DROP TABLE app.mailbox_security;
DROP TABLE app.organization_access;
DROP FUNCTION app.prevent_owner_loss();

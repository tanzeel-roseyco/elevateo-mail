-- Transaction abort on expected smoke failure rolls this attribute change back.
BEGIN;
ALTER ROLE elevateo_attachment_gateway CREATEROLE;

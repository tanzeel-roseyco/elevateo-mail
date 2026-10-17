# AIDEV-NOTE: Start from authenticated Lane C config; replace only ephemeral data mounts with owned volumes.
.services.db.volumes |= map(select(.target != "/var/lib/postgresql/data")) |
.services.db.volumes += [
  {type:"volume",source:"data",target:"/var/lib/postgresql/data"},
  {type:"volume",source:"config",target:"/etc/postgresql-custom"}] |
.services.storage.volumes = [{type:"volume",source:"storage",target:"/var/lib/storage"}] |
# AIDEV-NOTE: Fixture-only state is owned by volumes.sh; Compose removes unused volume declarations.
.volumes = (["data","config","storage"] | map({key:.,value:{external:true,name:($task+"-"+.)}}) | from_entries)

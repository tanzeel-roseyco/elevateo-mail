# AIDEV-NOTE: Caller authenticates raw manifest bytes; bind both Docker identity forms to that config chain.
def identity:
  "sha256:f040863673aea2570c3ff6a5c3fb4c673a016cbc5375005ad145915922b6b78a" as $digest |
  "sha256:4143a73d5a9804c1bb2f93cc823a7c173dbc62964d4a5ccabcb1167229b0e2b9" as $config |
  ($manifest | length == 1) and
  ($manifest[0].schemaVersion == 2) and
  ($manifest[0].mediaType == "application/vnd.oci.image.manifest.v1+json") and
  ($manifest[0].config.digest == $config) and
  (length == 1) and (.[0] | type == "array" and length == 1) and
  (.[0][0] |
    .Os == "linux" and .Architecture == "amd64" and
    (.RepoDigests | type == "array") and
    (any(.RepoDigests[]; . == ("python@" + $digest) or . == ("docker.io/library/python@" + $digest))) and
    (if .Descriptor == null then .Id == $config
     else .Descriptor.digest == $digest and
          .Descriptor.mediaType == "application/vnd.oci.image.manifest.v1+json" and
          (.Id == $config or .Id == $digest)
     end));
try identity catch false

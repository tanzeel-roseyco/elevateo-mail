#!/usr/bin/env bash
# AIDEV-NOTE: signing helpers sourced by build.sh; kept separate so test_signing_helpers.py can run
# them on Linux with a stubbed `security`. No credentials are read here; callers pass values in.

# Prints the user keychain search list, one path per line, without quotes or indentation.
current_keychain_search_list() {
    security list-keychains -d user | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//'
}

# Adds $1 in front of the saved search list ($2: file holding the original list, one per line), so
# signing and organizational keychains already configured stay reachable during the build.
prepend_build_keychain() {
    local build_keychain="$1" saved="$2"
    local -a entries=("$build_keychain")
    while IFS= read -r line; do
        [[ -n "$line" && "$line" != "$build_keychain" ]] && entries+=("$line")
    done < "$saved"
    security list-keychains -d user -s "${entries[@]}"
}

# Restores the original search list from $1; returns non-zero (and says so) when it cannot.
restore_keychain_search_list() {
    local saved="$1"
    local -a entries=()
    while IFS= read -r line; do
        [[ -n "$line" ]] && entries+=("$line")
    done < "$saved"
    if ! security list-keychains -d user -s "${entries[@]}"; then
        echo "ERROR: could not restore the original keychain search list; restore it manually from: ${entries[*]}" >&2
        return 1
    fi
}

# Writes manual-signing ExportOptions.plist mapping the bundle id to its distribution profile.
# Args: <output path> <team id> <bundle id> <profile uuid>
write_export_options() {
    local out="$1" team="$2" bundle_id="$3" profile="$4"
    cat > "$out" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>app-store-connect</string>
	<key>teamID</key>
	<string>$team</string>
	<key>signingStyle</key>
	<string>manual</string>
	<key>provisioningProfiles</key>
	<dict>
		<key>$bundle_id</key>
		<string>$profile</string>
	</dict>
</dict>
</plist>
PLIST
}

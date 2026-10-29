#!/usr/bin/env bash
set -euo pipefail
# Headless emulator acceptance for the x86_64 QA APK. Runs inside the `emulator` stage of
# apps/android/build/Dockerfile with --device /dev/kvm. Scripted subset of apps/android/acceptance.md;
# non-automatable cases are recorded NOT_RUN with reasons, never silently dropped.
# Usage: emulator-acceptance.sh QA_APK TRUST_DIR OUT_DIR
#   TRUST_DIR holds server.pem/server.key (fixture TLS leaf) from build-apk.sh's qa-trust output.
# AIDEV-NOTE: The APK trusts only elevateo.qa.internal via its packaged CA; the emulator reaches it
# AIDEV-NOTE: through -http-proxy -> CONNECT-only fixture_origin.py, matching the ANDROID1031 design.

[[ $# -eq 3 ]] || { echo 'usage: emulator-acceptance.sh QA_APK TRUST_DIR OUT_DIR' >&2; exit 2; }
apk=$1; trust=$2; out=$3
package=com.elevateo.mail.qa
lane="${ELEVATEO_ANDROID_LANE:?android lane path required (set by the emulator image)}"
dist="${ELEVATEO_FIXTURE_DIST:?web fixture dist required (set by the emulator image)}"
support="$lane/build"

if [[ ! -e /dev/kvm || ! -r /dev/kvm || ! -w /dev/kvm ]]; then
  echo 'FATAL: /dev/kvm is unavailable. Run the container with --device /dev/kvm and' >&2
  echo '--group-add "$(stat -c %g /dev/kvm)" so this unprivileged user can open it (Docker Desktop' >&2
  echo 'needs nested virtualization / WSL2 with KVM); the x86_64 emulator cannot boot without it.' >&2
  exit 3
fi
[[ -f $apk ]] || { echo "QA APK missing: $apk" >&2; exit 2; }
[[ -f $trust/server.pem && -f $trust/server.key ]] || { echo "TLS leaf missing in $trust" >&2; exit 2; }
mkdir -p "$out"

export ANDROID_AVD_HOME="$out/avd"
mkdir -p "$ANDROID_AVD_HOME"
echo no | "$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager" create avd --force --name elevateo-qa \
  --package 'system-images;android-36;google_apis;x86_64' --device pixel_5

adb=$ANDROID_HOME/platform-tools/adb
origin_pid=""
emulator_pid=""
cleanup() {
  [[ -n $origin_pid ]] && kill "$origin_pid" 2>/dev/null || true
  [[ -n $emulator_pid ]] && { "$adb" emu kill 2>/dev/null || kill "$emulator_pid" 2>/dev/null || true; }
  "$adb" kill-server 2>/dev/null || true
}
trap cleanup EXIT

start_origin() { # $1 = scenario
  [[ -n $origin_pid ]] && { kill "$origin_pid" 2>/dev/null || true; wait "$origin_pid" 2>/dev/null || true; }
  python3 "$support/fixture_origin.py" --dist "$dist" --scenario "$1" \
    --cert "$trust/server.pem" --key "$trust/server.key" \
    --https-port 8443 --proxy-port 8080 >> "$out/fixture-origin.log" 2>&1 &
  origin_pid=$!
  sleep 2
  kill -0 "$origin_pid" || { echo 'fixture origin failed to start; see fixture-origin.log' >&2; exit 2; }
}

start_origin unauthenticated
"$ANDROID_HOME/emulator/emulator" -avd elevateo-qa -no-window -no-audio -no-boot-anim \
  -gpu swiftshader_indirect -no-snapshot -memory 2048 \
  -http-proxy http://127.0.0.1:8080 > "$out/emulator.log" 2>&1 &
emulator_pid=$!
# Bounded device discovery: `adb wait-for-device` has no timeout and never notices a dead emulator.
for _ in $(seq 1 90); do
  [[ $("$adb" get-state 2>/dev/null) == device ]] && break
  kill -0 "$emulator_pid" 2>/dev/null || { echo 'emulator exited before registering with adb; see emulator.log' >&2; exit 2; }
  sleep 2
done
[[ $("$adb" get-state 2>/dev/null) == device ]] || { echo 'emulator did not register with adb within 180 s' >&2; exit 2; }
for _ in $(seq 1 120); do
  [[ $("$adb" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r') == 1 ]] && break
  kill -0 "$emulator_pid" || { echo 'emulator exited during boot; see emulator.log' >&2; exit 2; }
  sleep 5
done
[[ $("$adb" shell getprop sys.boot_completed | tr -d '\r') == 1 ]] || { echo 'emulator boot timed out' >&2; exit 2; }

cases="$out/cases.tsv"
: > "$cases"
record() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$cases"; }

dump_ui() { # $1 = evidence name; prints the pulled dump path
  "$adb" shell uiautomator dump /sdcard/view.xml >/dev/null
  "$adb" pull /sdcard/view.xml "$out/$1.xml" >/dev/null
  "$adb" exec-out screencap -p > "$out/$1.png" || true
  echo "$out/$1.xml"
}
assert_text() { python3 "$support/acceptance_results.py" assert-text "$1" "$2"; }
focused() { # prints the resumed package; fails (no output) when it cannot be determined
  "$adb" shell dumpsys activity activities > "$out/dumpsys.txt" || return 1
  python3 "$support/acceptance_results.py" focused-package "$out/dumpsys.txt"
}
assert_signed_in() { python3 "$support/acceptance_results.py" assert-signed-in "$1"; }
launch_app() {
  "$adb" shell am start -W -n "$package/.MainActivity" >/dev/null
  sleep 8 # WebView load of the fixture bundle over the proxied TLS origin
}

# Case: install
if "$adb" install -r "$apk" > "$out/install.log" 2>&1; then
  record install PASS 'adb install -r succeeded'
else
  record install FAIL "adb install failed: $(tail -n 1 "$out/install.log")"
  python3 "$support/acceptance_results.py" write "$out/results.json" "$cases" \
    "apk_sha256=$(sha256sum "$apk" | cut -d ' ' -f 1)" 'aborted=install failed'
  exit 1
fi

# Case: cold launch reaches the sign-in screen (unauthenticated fixture scenario)
launch_app
dump=$(dump_ui cold-launch)
if assert_text "$dump" 'Sign in'; then
  record cold_launch_sign_in PASS 'sign-in screen text visible after cold launch'
else
  record cold_launch_sign_in FAIL 'sign-in text absent from uiautomator dump after cold launch'
fi

# Case: back navigation does not escape into another app
"$adb" shell input keyevent KEYCODE_BACK
sleep 2
focus=$(focused || echo unknown)
if [[ $focus == "$package" || $focus == *launcher* || $focus == com.android.systemui ]]; then
  record back_no_escape PASS "focus after Back: $focus"
else
  record back_no_escape FAIL "unexpected foreground app after Back: $focus"
fi

# Case: rotation and resume keep the session-protected view fenced (authenticated scenario)
start_origin authenticated
"$adb" shell am force-stop "$package"
launch_app
before=$(dump_ui before-rotation)
"$adb" shell settings put system accelerometer_rotation 0
"$adb" shell settings put system user_rotation 1
sleep 3
dump=$(dump_ui rotated)
"$adb" shell am force-stop "$package"
launch_app
resumed=$(dump_ui resumed)
# The fixture notice renders even over sign-in/error screens, so the signed-in shell itself is
# asserted (acceptance_results.signed_in_view) before rotation, after it, and after relaunch.
focus=$(focused || echo '')
if assert_signed_in "$before" && assert_signed_in "$dump" && assert_signed_in "$resumed" \
   && [[ $focus == "$package" ]]; then
  record rotation_resume_fenced PASS 'signed-in shell stayed in-app through rotation and relaunch'
else
  record rotation_resume_fenced FAIL 'signed-in shell or focus lost across rotation/relaunch (see before-rotation/rotated/resumed)'
fi
"$adb" shell settings put system user_rotation 0

# Case: offline shows the offline state
"$adb" shell cmd connectivity airplane-mode enable
sleep 6
dump=$(dump_ui offline)
if assert_text "$dump" 'connection problem'; then
  record offline_state PASS 'connectivity banner visible in airplane mode'
else
  # ANDROID1035 saw WebView report online while the OS was offline; record honestly either way.
  record offline_state FAIL 'offline banner absent in airplane mode (see offline.xml/png)'
fi
"$adb" shell cmd connectivity airplane-mode disable
sleep 4

# Case: a system https link is not captured by the app (no VIEW intent filter)
# A failed launch or unknown focus is not evidence of external resolution (NOT_RUN/FAIL, never PASS).
launch_ok=1
"$adb" shell am start -W -a android.intent.action.VIEW -d 'https://example.org/external-check' \
  > "$out/view-intent.log" 2>&1 || launch_ok=0
grep -q '^Error' "$out/view-intent.log" && launch_ok=0
sleep 3
focus=$(focused || echo '')
IFS=$'\t' read -r link_status link_detail < <(python3 "$support/acceptance_results.py" \
  classify-external-link "$launch_ok" "$package" "$focus")
record system_link_external "$link_status" "$link_detail"

# Case: uninstall
if "$adb" uninstall "$package" > "$out/uninstall.log" 2>&1; then
  record uninstall PASS 'adb uninstall succeeded'
else
  record uninstall FAIL "adb uninstall failed: $(tail -n 1 "$out/uninstall.log")"
fi

# Cases from acceptance.md that this harness cannot automate.
record login_logout_session NOT_RUN 'needs the real Rails/Auth fixture backend; the static fixture origin has no server session'
record sso_round_trip NOT_RUN 'shared shell denies leaving the origin; Authentik redirect needs a reviewed native-shell change'
record host_boundary_lookalikes NOT_RUN 'needs shell navigation instrumentation; uiautomator cannot observe denied WebView navigations'
record revoke_resume_role_change NOT_RUN 'needs a live API session to revoke from another client'
record keyboard_insets_visual NOT_RUN 'screenshots captured but keyboard/inset acceptance requires human visual review'
record upgrade_signatures NOT_RUN 'needs a signed release candidate APK to compare against'

status=0
python3 "$support/acceptance_results.py" write "$out/results.json" "$cases" \
  "apk_sha256=$(sha256sum "$apk" | cut -d ' ' -f 1)" \
  'system_image=system-images;android-36;google_apis;x86_64' \
  "android_release=$("$adb" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r' || true)" \
  || status=$?
cat "$out/results.json"
exit "$status"

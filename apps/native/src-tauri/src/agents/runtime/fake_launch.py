"""Final Docker gate fixture only; contains no model API client."""
import json
import subprocess
import sys
import time

# AIDEV-NOTE: The child intentionally survives the fixture parent until the container's PID namespace is killed.
request = json.load(sys.stdin)
child = subprocess.Popen(["python3", "-c", "import time; time.sleep(310)"])
print("READY", flush=True)
if request["prompt"] == "complete":
    print("draft saved [message:fixture]", flush=True)
    child.terminate()
    child.wait()
else:
    print("fixture waiting", flush=True)
    time.sleep(310)

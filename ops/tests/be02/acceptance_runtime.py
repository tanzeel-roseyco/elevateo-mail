"""Opt-in real-app acceptance on the existing isolated BE02 stack."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import time
from acceptance_cleanup import acceptance_owner, validate_container
from docker_task import Task

NODE = "node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20"
PLAYWRIGHT = "mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f"
GRID = "selenium/standalone-chrome:4.49.0-20260909@sha256:88dacdd42d93ab738bed045129376b2f965117c5f2e4710693e54695d531380d"
SECCOMP_SHA256 = "cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849"
# AIDEV-NOTE: This fixed archive record must match browsers.Dockerfile; CfT is not a Docker image input.
CFT_ARCHIVE = {
    "version": "155.0.8059.39",
    "url": "https://storage.googleapis.com/chrome-for-testing-public/155.0.8059.39/linux64/chrome-linux64.zip",
    "bytes": 198195769,
    "sha256": "55672d1f392fd3e7b7a08621b6e804e6bcb39d40cf155504abb74b3a021ea8ea",
}
VERSIONS = {"chromium": "156.0.8078.4", "firefox": "157.0", "webkit": "27.2"}
# AIDEV-NOTE: Keep repair unit entrypoints explicit; ui.browser-probe requires a real browser lane.
UNITS = ["contracts/report-validation.spec", "proxy/proxy.spec", "playwright/boundaries.unit.spec",
         "playwright/credential-origin.unit.spec", "playwright/credential-fill.unit.spec",
         "playwright/screenshots.unit.spec",
         "puppeteer/boundaries.unit.spec", "selenium/boundaries.unit.spec"]


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--acceptance", action="store_true")
    parser.add_argument("--acceptance-lanes", default="playwright,puppeteer,selenium")
    parser.add_argument("--acceptance-browsers", default="chromium,firefox,webkit")
    parser.add_argument("--acceptance-dispatch-id")
    parser.add_argument("--acceptance-grid-image", default=GRID,
                        help="Official standalone-chrome:4.49.0-20260909@sha256 digest")
    parser.add_argument("--acceptance-seccomp-sha256", default=SECCOMP_SHA256,
                        help="Approved ops/acceptance/seccomp.json SHA-256")


class Acceptance:
    # AIDEV-NOTE: Register all images/mounts before creating resources, including partially failed starts/builds.
    def __init__(self, task: Task, args: argparse.Namespace) -> None:
        self.task = task
        self.lanes = args.acceptance_lanes.split(",")
        self.browsers = args.acceptance_browsers.split(",")
        for values, allowed in ((self.lanes, {"playwright", "puppeteer", "selenium"}),
                                (self.browsers, set(VERSIONS))):
            if not values or len(values) != len(set(values)) or not set(values) <= allowed:
                raise RuntimeError("unknown, empty or duplicate acceptance selection")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", args.acceptance_dispatch_id or ""):
            raise RuntimeError("acceptance requires a dispatch identity")
        self.grid = str(args.acceptance_grid_image or "")
        if not re.fullmatch(re.escape("selenium/standalone-chrome:4.49.0-20260909") + r"@sha256:[a-f0-9]{64}", self.grid):
            raise RuntimeError("acceptance requires a reviewed official Grid image digest")
        # AIDEV-NOTE: Record opt-in ownership on Task; fleet has no sudo and base Task creation stays unchanged.
        setattr(task, "acceptance_uid", os.geteuid())
        setattr(task, "acceptance_gid", os.getegid())
        uid, gid = acceptance_owner(task)
        if task.root.is_symlink() or task.root.stat().st_uid != uid:
            raise RuntimeError("acceptance source must belong to the invoking user")
        self.seccomp = task.root / "ops/acceptance/seccomp.json"
        if self.seccomp.is_symlink() or not self.seccomp.is_file() or self.seccomp.stat().st_size > 262144:
            raise RuntimeError("staged approved seccomp profile missing")
        policy_bytes = self.seccomp.read_bytes()
        if hashlib.sha256(policy_bytes).hexdigest() != args.acceptance_seccomp_sha256:
            raise RuntimeError("seccomp profile digest mismatch")
        profile = json.loads(policy_bytes)
        # AIDEV-NOTE: Both inspection gates compare against the same bytes authenticated above, without rereading.
        setattr(task, "acceptance_seccomp", profile)
        allowed_calls = {name for entry in profile["syscalls"] if entry["action"] == "SCMP_ACT_ALLOW"
                         for name in entry["names"]}
        if profile["defaultAction"] != "SCMP_ACT_ERRNO" or not {"clone", "setns", "unshare"} <= allowed_calls:
            raise RuntimeError("profile must retain default denial and permit reviewed browser namespaces")
        required = [".dockerignore", "tests/acceptance/package-lock.json", "ops/acceptance/browsers.Dockerfile",
                    "ops/acceptance/web.Dockerfile", "apps/web/package-lock.json"]
        if any(not (task.root / path).is_file() for path in required):
            raise RuntimeError("immutable acceptance context is incomplete")
        # AIDEV-NOTE: Runtime secrets/evidence share the source parent; never send them to the root build context.
        exclusions = {line.strip().rstrip("/") for line in (task.root / ".dockerignore").read_text().splitlines()
                      if line.strip() and not line.lstrip().startswith("#")}
        if (not {"ops/local", "**/node_modules", "**/dist", "**/.env*"} <= exclusions
                or any(line.startswith("!") for line in exclusions)
                or any((task.root / f"ops/acceptance/{name}.Dockerfile.dockerignore").exists()
                       for name in ("web", "browsers"))):
            raise RuntimeError("build context must exclude private/generated paths without override rules")
        self.runs = [("playwright_real", browser) for browser in self.browsers if "playwright" in self.lanes]
        self.runs += [("puppeteer_cdp", "chromium")] if "puppeteer" in self.lanes else []
        self.runs += [("selenium", "chrome")] if "selenium" in self.lanes else []
        self.outputs = [task.evidence / (lane + "-" + browser) for lane, browser in self.runs]
        self.private = task.evidence / "acceptance-private"
        task.acceptance_private = self.private
        self.web, self.image = task.project + ":acceptance-web", task.project + ":acceptance-browser"
        task.owned_image_tags.update({self.web, self.image})
        task.acceptance_mounts = {
            "acceptance-web": set(), "selenium": set(),
            "acceptance-seed": {(task.root / path, destination, False) for path, destination in (
                ("apps/server", "/workspace/apps/server"), ("contracts", "/workspace/contracts"),
                ("ops/tests/be02", "/workspace/ops/tests/be02"),
                ("tests/acceptance/shared/seed-contract.json", "/acceptance-contract/seed-contract.json"))},
            "acceptance-browser": {(self.private / "seed.json", "/acceptance/seed.json", False),
                (self.private / "acceptance-credentials.json", "/run/secrets/acceptance-credentials.json", False),
                *((path, "/output", True) for path in self.outputs)}}
        task.acceptance_mounts["acceptance-seed"].add((self.private, "/acceptance", True))
        self.env = {"BE02_ACCEPTANCE_PRIVATE": str(self.private), "BE02_ACCEPTANCE_WEB_IMAGE": self.web,
                    "BE02_ACCEPTANCE_BROWSER_IMAGE": self.image, "BE02_ACCEPTANCE_GRID_IMAGE": self.grid,
                    "BE02_ACCEPTANCE_UID": str(uid), "BE02_ACCEPTANCE_GID": str(gid),
                    "BE02_ACCEPTANCE_SECCOMP": str(self.seccomp),
                    "BE02_ACCEPTANCE_DISPATCH_ID": args.acceptance_dispatch_id}
        self.base_env = task.env_file.read_text()
        task.deadline = time.monotonic() + 7200

    def environment(self, index: int) -> None:
        lane, browser = self.runs[index]
        values = {**self.env, "BE02_ACCEPTANCE_OUTPUT": str(self.outputs[index]),
                  "BE02_ACCEPTANCE_LANE": lane, "BE02_ACCEPTANCE_BROWSER": browser,
                  "BE02_ACCEPTANCE_RUN_ID": self.task.project + "-" + str(index)}
        self.task.env_file.write_text(self.base_env + "".join(f"{key}={value}\n" for key, value in values.items()))

    def start(self, service: str) -> str:
        if any(item["Config"]["Labels"].get("com.docker.compose.service") == service
               for item in self.task.project_containers()):
            raise RuntimeError("acceptance service already exists; retain it for inspected final cleanup")
        self.task.compose("acceptance-create", ["create", "--no-deps", service], 45, quiet=True)
        items = [item for item in self.task.project_containers()
                 if item["Config"]["Labels"].get("com.docker.compose.service") == service]
        if len(items) != 1:
            raise RuntimeError("acceptance service identity missing or ambiguous")
        validate_container(self.task, items[0])
        identity: str = items[0]["Id"]
        self.task.docker("acceptance-start", ["container", "start", identity], quiet=True)
        return identity

    def execute(self, identity: str, command: list[str], seconds: int = 90) -> None:
        self.task.docker("acceptance-exec", ["container", "exec", identity, *command], seconds, quiet=True)

    def readiness(self, identity: str, grid: bool = False) -> None:
        urls = {"http://selenium:4444/status": 200} if grid else {
            "http://app.test/": 200, "http://app.test/auth/complete": 200,
            "http://app.test/v1/session": 401, "http://app.test/dev-fixtures.html": 404,
            "http://app.test/src/main.tsx": 404}
        script = """const end=Date.now()+60000; let ready=false;
          while(Date.now()<end&&!ready){try{for(const [url,status] of Object.entries(URLS)){
            const r=await fetch(url,{signal:AbortSignal.timeout(2000),redirect:'manual'});
            if(r.status!==status || (url.endsWith('/status') && !(await r.json()).value.ready))throw 0;
          }ready=true;}catch{await new Promise(r=>setTimeout(r,500));}} if(!ready)process.exit(1);"""
        self.execute(identity, ["node", "--input-type=module", "-e", script.replace("URLS", json.dumps(urls))])

    def run(self) -> None:
        task = self.task
        uid, gid = acceptance_owner(task)
        for path in [self.private, *self.outputs, *(path / "cases" for path in self.outputs)]:
            path.mkdir(mode=0o700)
            info = path.lstat()
            if (path.resolve() != path or not stat.S_ISDIR(info.st_mode) or info.st_uid != uid
                    or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o700):
                raise RuntimeError("acceptance directory ownership/mode mismatch")
        task.write("acceptance-owner.json", {"uid": uid, "gid": gid})
        pins = [NODE, PLAYWRIGHT] + ([self.grid] if "selenium" in self.lanes else [])
        task.write("acceptance-inputs.json", {"images": pins, "chrome_for_testing_archive": CFT_ARCHIVE})
        for pin in pins:
            metadata = task.inspect("image", [pin])[0]
            if metadata["Os"] != "linux" or metadata["Architecture"] != "amd64" or metadata["Config"].get("Volumes"):
                raise RuntimeError("acceptance requires staged Linux amd64 images without anonymous volumes")
        task.ensure_builder()
        for tag, recipe in ((self.web, "web"), (self.image, "browsers")):
            task.docker("acceptance-build", ["buildx", "build", "--builder", task.builder, "--load",
                        "--platform", "linux/amd64", "--label", "elevateo.be02.project=" + task.project,
                        "--tag", tag,
                        "-f", str(task.root / f"ops/acceptance/{recipe}.Dockerfile"), str(task.root)], 900)
        images = {"acceptance-web": self.web, "acceptance-browser": self.image, "acceptance-seed": task.image}
        if "selenium" in self.lanes:
            images["selenium"] = self.grid
        task.acceptance_images = {service: task.inspect("image", [pin])[0]["Id"] for service, pin in images.items()}
        task.write("acceptance-images.json", {"inputs": pins, "chrome_for_testing_archive": CFT_ARCHIVE,
                                              "services": task.acceptance_images})
        task.compose_files.append(task.root / "ops/compose.acceptance-test.yaml")
        self.environment(0)
        task.compose("acceptance-config", ["config", "--quiet"], quiet=True)
        # AIDEV-NOTE: Keep application consumers stopped until the seed publishes its complete private manifest.
        task.compose("acceptance-consumers-stop", ["stop", "-t", "10", "api", "worker"], 35, quiet=True)
        task.compose("acceptance-origin", ["up", "-d", "--no-deps", "--force-recreate", "--wait",
                     "--wait-timeout", "120", "auth"], 140, quiet=True)
        task.runtime_credentials()
        network = task.inspect("network", [task.project + "_isolated"])[0]
        if not network["Internal"] or network.get("Labels", {}).get("elevateo.be02.project") != task.project:
            raise RuntimeError("acceptance requires the task's internal network")
        seed = self.start("acceptance-seed")
        code = task.docker("acceptance-seed-wait", ["container", "wait", seed], 180).strip()
        if code != "0":
            raise RuntimeError("supported Auth seed did not complete")
        validate_container(task, task.inspect("container", [seed])[0])
        task.docker("acceptance-seed-remove", ["container", "rm", seed])
        for name in ("seed.json", "acceptance-credentials.json"):
            info = (self.private / name).lstat()
            if (not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_gid != gid
                    or stat.S_IMODE(info.st_mode) != 0o600
                    or info.st_nlink != 1 or not 0 < info.st_size <= 65536):
                raise RuntimeError("seed output private-file contract mismatch")
        task.write("acceptance-seed.sha256.json", {"seed.json": hashlib.sha256((self.private / "seed.json").read_bytes()).hexdigest()})
        task.compose("acceptance-consumers-start", ["up", "-d", "--no-deps", "--force-recreate", "api", "worker"], 45, quiet=True)
        task.runtime_credentials()
        self.start("acceptance-web")
        results: list[dict[str, str]] = []
        for index, (lane, browser) in enumerate(self.runs):
            self.environment(index)
            identity, grid = "", ""
            try:
                identity = self.start("acceptance-browser")
                self.readiness(identity)
                if index == 0:
                    self.execute(identity, ["node", "--test", *(f"dist/{path}.js" for path in UNITS)], 180)
                if lane == "selenium":
                    grid = self.start("selenium")
                    self.execute(grid, ["python3", "-c", "from pathlib import Path; import subprocess; "
                        "assert Path('/opt/google/chrome/chrome').read_bytes()[:4]==b'\\x7fELF'; "
                        "assert '153.0.8010.47' in subprocess.check_output(['/opt/google/chrome/chrome','--version'],text=True); "
                        "assert '153.0.8010.47' in subprocess.check_output(['/usr/bin/chromedriver','--version'],text=True)"])
                    self.readiness(identity, grid=True)
                if lane == "playwright_real":
                    smoke = "import {" + browser + " as engine} from 'playwright';" + \
                        "const b=await engine.launch({headless:true,chromiumSandbox:true});" + \
                        "try{if(b.version()!==" + json.dumps(VERSIONS[browser]) + ")process.exitCode=1;}finally{await b.close();}"
                    self.execute(identity, ["node", "--input-type=module", "-e", smoke])
                    command = ["node", "node_modules/@playwright/test/cli.js", "test",
                               "--config=playwright/playwright.config.ts", "--output=/tmp/playwright-native"]
                else:
                    engine = "puppeteer" if lane == "puppeteer_cdp" else "selenium"
                    # AIDEV-NOTE: Prove browser predicates with synthetic DOM fixtures before trusting app case results.
                    self.execute(identity, ["node", "--test", f"dist/{engine}/ui.browser-probe.js"], 90)
                    command = ["node", f"dist/{engine}/run.js"]
                self.execute(identity, command, 600)
                # AIDEV-NOTE: Parse the wire schema before comparing the frozen unique scenario set for this run.
                check = (Path(__file__).with_name("acceptance_evidence.mjs").read_text() + """
                  import {readdirSync,readFileSync} from 'node:fs';
                  import {caseResultSchema} from './dist/shared/schema.js';
                  const records=readdirSync('/output/cases').map(name =>
                    caseResultSchema.parse(JSON.parse(readFileSync('/output/cases/'+name,'utf8'))));
                  validateEvidence(records, SELECTION);""")
                selection = {"lane": lane, "browser": browser, "runId": task.project + "-" + str(index),
                             "dispatchId": self.env["BE02_ACCEPTANCE_DISPATCH_ID"], "profile": "internal_http"}
                self.execute(identity, ["node", "--input-type=module", "-e", check.replace("SELECTION", json.dumps(selection))])
                results.append({"lane": lane, "browser": browser, "status": "PASSED"})
            except Exception as error:
                results.append({"lane": lane, "browser": browser, "status": "FAILED_OR_INCOMPLETE", "error": str(error)})
            finally:
                for container in (identity, grid):
                    if container:
                        validate_container(task, task.inspect("container", [container])[0])
                        task.docker("acceptance-lane-remove", ["container", "rm", "-f", container], 30)
                task.write("acceptance-results.json", {"scope": "selected internal HTTP lanes only", "runs": results})
        if any(result["status"] != "PASSED" for result in results):
            raise RuntimeError("acceptance failed or incomplete; inspect sanitized cases and acceptance-results.json")

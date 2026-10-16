"""Cold-boot one disposable fleet Android emulator; adb remains inside network=none."""
from pathlib import Path
import json
import os
import signal
import subprocess
import time

WORK = Path('/work')
EVIDENCE = Path('/evidence')


def adb(*arguments: str, timeout: int = 20) -> str:
    result = subprocess.run(['adb', '-s', 'emulator-5554', *arguments], capture_output=True,
                            text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('ADB operation failed')
    return result.stdout.strip()


def main() -> None:
    os.umask(0o077)
    # AIDEV-NOTE: Explicit acceleration forbids a slow unbounded software-CPU fallback.
    with (EVIDENCE / 'acceleration.log').open('w') as log:
        subprocess.run(['emulator', '-accel-check'], check=True, timeout=30, stdout=log, stderr=subprocess.STDOUT)
    avd = WORK / 'avd/ElevateoFleetQA.avd'; avd.mkdir(parents=True)
    (WORK / '.android').mkdir()
    (WORK / 'avd/ElevateoFleetQA.ini').write_text('avd.ini.encoding=UTF-8\npath=' + str(avd) + '\ntarget=android-34\n')
    options = {'AvdId': 'ElevateoFleetQA', 'abi.type': 'x86_64', 'hw.cpu.arch': 'x86_64', 'hw.cpu.ncore': '2',
        'hw.ramSize': '1536', 'hw.lcd.width': '720', 'hw.lcd.height': '1280', 'hw.lcd.density': '320',
        'disk.dataPartition.size': '2G', 'hw.keyboard': 'yes', 'hw.mainKeys': 'no', 'hw.sdCard': 'no',
        'hw.gpu.enabled': 'yes', 'hw.gpu.mode': 'swiftshader', 'hw.audioInput': 'no', 'hw.audioOutput': 'no',
        'image.sysdir.1': '/opt/android-sdk/system-images/android-34/default/x86_64/',
        'tag.id': 'default', 'tag.display': 'Default', 'PlayStore.enabled': 'false', 'showDeviceFrame': 'no',
        'fastboot.forceColdBoot': 'yes', 'hw.camera.back': 'none', 'hw.camera.front': 'none'}
    (avd / 'config.ini').write_text(''.join(key + '=' + value + '\n' for key, value in options.items()))
    with (EVIDENCE / 'emulator.log').open('w') as log:
        children: list[subprocess.Popen[str]] = []
        # AIDEV-NOTE: Track each child immediately so partial startup failures still terminate the emulator.
        try:
            emulator = subprocess.Popen(['emulator', '-avd', 'ElevateoFleetQA', '-no-window', '-no-audio',
                '-no-boot-anim', '-no-snapshot', '-gpu', 'swiftshader', '-accel', 'on', '-port', '5554',
                '-no-metrics'], stdout=log, stderr=subprocess.STDOUT)
            children.append(emulator)
            relay = subprocess.Popen(['python3', '-I', '-B', '/qa/relay.py', 'container'], stdout=log, stderr=subprocess.STDOUT)
            children.append(relay)
            stopping = False
            def stop(_signal: int, _frame: object) -> None:
                nonlocal stopping
                stopping = True
            for event in (signal.SIGTERM, signal.SIGINT):
                signal.signal(event, stop)
            deadline = time.monotonic() + 240
            while time.monotonic() < deadline and not stopping:
                if emulator.poll() is not None or relay.poll() is not None:
                    raise RuntimeError('Emulator or relay exited during boot')
                try:
                    if adb('shell', 'getprop', 'sys.boot_completed', timeout=5) == '1':
                        break
                except (RuntimeError, subprocess.TimeoutExpired):
                    pass
                time.sleep(1)
            else:
                raise RuntimeError('Android boot deadline exceeded')
            adb('shell', 'settings', 'put', 'global', 'http_proxy', '10.0.2.2:19443')
            adb('shell', 'settings', 'put', 'global', 'window_animation_scale', '0')
            adb('shell', 'settings', 'put', 'global', 'transition_animation_scale', '0')
            adb('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0')
            adb('install', '--no-streaming', '/apk/elevateo.apk', timeout=180)
            metadata = {'status': 'BOOTED_INSTALLED', 'acceptance': 'NOT_RUN',
                'android': adb('shell', 'getprop', 'ro.build.version.release'),
                'webview': adb('shell', 'dumpsys', 'webviewupdate')[:6000]}
            (EVIDENCE / 'emulator-ready.json').write_text(json.dumps(metadata, indent=2) + '\n')
            deadline = time.monotonic() + 3600
            while time.monotonic() < deadline and not stopping:
                if emulator.poll() is not None or relay.poll() is not None:
                    raise RuntimeError('Emulator or relay exited')
                time.sleep(1)
        finally:
            for process in reversed(children):
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill(); process.wait(timeout=5)


if __name__ == '__main__':
    main()

"""Supervise installed-APK checks; GUI assertions execute through CDP inside the fleet container."""
from pathlib import Path
import json
import subprocess
import time
import request as qa_request
from boundaries import AcceptanceResult, CONTROL, active_fixture, decode

active = active_fixture(decode((CONTROL / 'android-active.json').read_text()))
evidence = Path(active['evidence'])
if (evidence / 'automated-result.json').exists():
    raise RuntimeError('Acceptance evidence already exists; start a fresh isolated fixture')
checks = dict.fromkeys(('login', 'inbox', 'thread', 'navigation', 'rotation', 'lifecycle', 'offline', 'logout', 'keyboard'), 'NOT_RUN')
result: AcceptanceResult = {'status': 'FAILED', 'checks': checks, 'visual_review': 'PENDING'}

def gui(action: str, **values: object) -> object:
    completed = subprocess.run(['python3', str(Path(qa_request.__file__).resolve())],
        input=json.dumps({'action': action, **values}), text=True, capture_output=True, timeout=70, check=True)
    rows = completed.stdout.strip().splitlines()
    return decode(rows[-1])

def adb(*args: str) -> str:
    return subprocess.check_output(['docker', 'exec', active['emulator'], 'adb', '-s', 'emulator-5554',
        'shell', *args], text=True, timeout=30).strip()

def wait(expression: str) -> None:
    # AIDEV-NOTE: Outcome assertions and bounded waits execute in the installed WebView, never the host browser.
    gui('evaluate', expression="(async()=>{const end=Date.now()+8000;while(Date.now()<end){if(" + expression +
        ")return true;await new Promise(r=>setTimeout(r,100));}throw new Error('Android expected state did not appear')})()")

def screen(name: str) -> None:
    gui('screen', name=name)
    (evidence / (name + '.json')).write_text(json.dumps(gui('snapshot'), indent=2) + '\n')

def passed(name: str) -> None:
    checks[name] = 'PASSED'
    print(name + ': PASSED', flush=True)
    (evidence / 'automated-progress.json').write_text(json.dumps(result, indent=2) + '\n')

def restore_network() -> None:
    adb('cmd', 'connectivity', 'airplane-mode', 'disable')
    adb('svc', 'wifi', 'enable')
    adb('svc', 'data', 'enable')

try:
    wait("!!document.querySelector('input[name=email]')")
    screen('01-login')
    gui('private-login')
    wait("!!document.querySelector('button[aria-label=\"Open navigation\"]') && !document.querySelector('input[name=password]')")
    passed('login')
    gui('click', selector='button[aria-label="Open navigation"]')
    wait("!!document.querySelector('[role=dialog]') && document.body.innerText.includes('PERSONAL') && document.body.innerText.includes('OUTREACH')")
    screen('02-navigation')
    passed('navigation')
    gui('click', selector='[role=dialog] a[href="#/mailboxes/00000000-0000-4000-8000-000000000201"]')
    wait("!!document.querySelector('a[href*=\"/threads/00000000-0000-4000-8000-000000000301\"]')")
    screen('03-inbox')
    passed('inbox')
    gui('click', selector='a[href*="/threads/00000000-0000-4000-8000-000000000301"]')
    wait("!!document.querySelector('article') && document.querySelector('article').innerText.includes('Plain text <b>remains literal</b> primary') && !document.querySelector('article b')")
    gui('evaluate', expression="(()=>{const e=[...document.querySelectorAll('a')].find(e=>e.textContent.trim()==='Open this message');if(!e)throw new Error('Message link absent');e.dataset.qaMessage='true';return true})()")
    gui('click', selector='a[data-qa-message=true]')
    wait("location.href.includes('message=')")
    message_url = gui('evaluate', expression='location.href')
    screen('04-thread')
    passed('thread')
    adb('settings', 'put', 'system', 'accelerometer_rotation', '0')
    adb('settings', 'put', 'system', 'user_rotation', '1')
    wait('innerWidth > innerHeight')
    wait('location.href === ' + json.dumps(message_url))
    screen('05-landscape')
    adb('settings', 'put', 'system', 'user_rotation', '0')
    wait('innerHeight > innerWidth')
    screen('06-portrait')
    passed('rotation')
    baseline = gui('evaluate', expression='innerHeight')
    if type(baseline) is not int or baseline <= 100:
        raise RuntimeError('Invalid Android viewport height')
    adb('settings', 'put', 'secure', 'show_ime_with_hard_keyboard', '1')
    # AIDEV-NOTE: Repeat opening/closing; one successful IME resize missed the intermittent obscured-field defect.
    for attempt in range(1, 4):
        gui('fill', selector='textarea', value='Temporary keyboard layout check')
        wait('innerHeight < ' + str(baseline - 100))
        wait("(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return e.tagName==='TEXTAREA' && r.top>=0 && r.bottom<=innerHeight})()")
        screen('07-keyboard-' + str(attempt))
        gui('fill', selector='textarea', value='')
        adb('input', 'keyevent', '4')
        wait('innerHeight === ' + str(baseline))
    passed('keyboard')
    adb('input', 'keyevent', '3')
    adb('am', 'start', '-n', 'com.elevateo.mail.qa/.MainActivity')
    wait('location.href === ' + json.dumps(message_url))
    adb('am', 'force-stop', 'com.elevateo.mail.qa')
    adb('am', 'start', '-n', 'com.elevateo.mail.qa/.MainActivity')
    time.sleep(2)
    wait("!document.querySelector('input[name=password]') && !!document.querySelector('button[aria-label=\"Account and sign-out\"]')")
    screen('08-resumed')
    passed('lifecycle')
    adb('cmd', 'connectivity', 'airplane-mode', 'enable')
    adb('svc', 'wifi', 'disable')
    adb('svc', 'data', 'disable')
    wait("navigator.onLine===false && [...document.querySelectorAll('[role=status]')].some(e=>e.innerText.includes('Your device reports a connection problem.'))")
    (evidence / 'offline-network.txt').write_text(adb('dumpsys', 'connectivity'))
    screen('09-offline')
    restore_network()
    wait("navigator.onLine===true")
    # AIDEV-NOTE: An offline session refresh can require an explicit retry; recovery must prove the authenticated UI.
    recovered = "!!document.querySelector('button[aria-label=\"Account and sign-out\"]')"
    recovery_error = "document.body.innerText.includes('The session could not be loaded')"
    wait('(' + recovered + ') || (' + recovery_error + ')')
    if gui('evaluate', expression=recovery_error) is True:
        gui('evaluate', expression="(()=>{const e=[...document.querySelectorAll('button')].find(e=>!e.disabled && e.textContent.trim()==='Try again');if(!e)throw new Error('Recovery retry absent');e.dataset.qaRetry='true';return true})()")
        gui('click', selector='button[data-qa-retry=true]')
    wait("!!document.querySelector('button[aria-label=\"Account and sign-out\"]') && !document.body.innerText.includes('Your device reports a connection problem.')")
    screen('10-online')
    passed('offline')
    gui('click', selector='button[aria-label="Account and sign-out"]')
    wait("!!document.querySelector('[role=dialog]')")
    gui('evaluate', expression="(()=>{const e=[...document.querySelectorAll('[role=dialog] button')].find(e=>!e.disabled && e.textContent.trim()==='Sign out');if(!e)throw new Error('Sign out missing');e.dataset.qaLogout='true';return true})()")
    gui('click', selector='button[data-qa-logout=true]')
    wait("!!document.querySelector('input[name=password]') && !document.querySelector('button[aria-label=\"Account and sign-out\"]')")
    screen('11-logged-out')
    passed('logout')
    result['status'] = 'AUTOMATED_PASSED_AWAITING_VISUAL_REVIEW'
except Exception as error:
    result['failure'] = type(error).__name__ + ': ' + str(error)
    print(result['failure'], flush=True)
finally:
    try:
        restore_network()
        adb('settings', 'put', 'system', 'user_rotation', '0')
    except Exception as error:
        result['restore_error'] = type(error).__name__ + ': ' + str(error)
        result['status'] = 'FAILED'
    (evidence / 'automated-result.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result), flush=True)

if result["status"] != "AUTOMATED_PASSED_AWAITING_VISUAL_REVIEW":
    raise SystemExit(1)
